import type { DatabaseSync } from 'node:sqlite'

import type {
  EventsIteratorOptions,
  GetHistoryOptions,
  MessageRecord,
  MessagingEvent,
} from '@animocabrands/minds-client-lib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDatabase } from '../../src/server/db/database.js'
import { migrate } from '../../src/server/db/migrations.js'
import { CaseEventRepository } from '../../src/server/db/repositories/case-event-repository.js'
import { IngestionCursorRepository } from '../../src/server/db/repositories/ingestion-cursor-repository.js'
import { NotificationDeliveryRepository } from '../../src/server/db/repositories/notification-delivery-repository.js'
import { ObservationRepository } from '../../src/server/db/repositories/observation-repository.js'
import { RecoveryCaseRepository } from '../../src/server/db/repositories/recovery-case-repository.js'
import {
  ObservationPipeline,
  type ObservationSourceClient,
} from '../../src/server/services/observation-pipeline.js'

const COMMUNITY_ID = '11111111-1111-4111-8111-111111111111'
const SOURCE_ALIAS = 'vibecheck-community-source'
const CREATOR_ALIAS = 'vibecheck-creator-private'
const NOW = Date.parse('2026-08-17T12:00:00.000Z')

class FakeObservationSource implements ObservationSourceClient {
  readonly historyCalls: Array<{ alias: string; options?: GetHistoryOptions }> = []
  readonly eventCalls: EventsIteratorOptions[] = []

  constructor(
    private readonly history: MessageRecord[] = [],
    private readonly streamedEvents: MessagingEvent[] = [],
  ) {}

  getHistory(alias: string, options?: GetHistoryOptions): Promise<MessageRecord[]> {
    this.historyCalls.push({ alias, options })
    return Promise.resolve(this.history)
  }

  async *events(alias: string, signal?: AbortSignal): AsyncGenerator<MessagingEvent> {
    this.eventCalls.push({ alias, signal })
    for (const event of this.streamedEvents) yield event
  }
}

describe('ObservationPipeline', () => {
  let database: DatabaseSync
  let observations: ObservationRepository
  let cursors: IngestionCursorRepository

  beforeEach(() => {
    database = createDatabase(':memory:')
    migrate(database)
    insertCommunity(database)
    observations = new ObservationRepository(database)
    cursors = new IngestionCursorRepository(database)
  })

  afterEach(() => database.close())

  it('persists human community history and resumes after its committed fingerprint', async () => {
    const source = new FakeObservationSource([
      humanRow('fingerprint-1', 'member-a', 'Alex', 'First message', '2026-08-17T11:58:00.000Z'),
      humanRow('fingerprint-2', 'member-b', 'Sam', 'Second message', '2026-08-17T11:59:00.000Z'),
    ])
    const pipeline = createCommunityPipeline(source, observations, cursors)

    await expect(pipeline.catchUp()).resolves.toEqual({ inserted: 2, duplicate: 0, skipped: 0 })
    await expect(pipeline.catchUp()).resolves.toEqual({ inserted: 0, duplicate: 2, skipped: 0 })

    expect(source.historyCalls).toEqual([
      { alias: SOURCE_ALIAS, options: { limit: 50, after: undefined } },
      { alias: SOURCE_ALIAS, options: { limit: 50, after: 'fingerprint-2' } },
    ])
    expect(cursors.findByAlias(SOURCE_ALIAS)?.lastFingerprint).toBe('fingerprint-2')
    expect(tableCount(database, 'observations')).toBe(2)
    expect(tableCount(database, 'member_references')).toBe(2)
  })

  it('ignores Mind echoes and malformed rows without advancing evidence state', async () => {
    const source = new FakeObservationSource([
      { ...humanRow('mind-echo', 'mind-id', 'VibeCheck', '{}', '2026-08-17T11:58:00.000Z'), senderType: 0 },
      { fingerprint: 'missing-author', senderType: 1, messageText: 'No stable author' },
      { fingerprint: 'missing-text', senderType: 1, senderId: 'member-a' },
    ])
    const pipeline = createCommunityPipeline(source, observations, cursors)

    await expect(pipeline.catchUp()).resolves.toEqual({ inserted: 0, duplicate: 0, skipped: 3 })
    expect(tableCount(database, 'observations')).toBe(0)
    expect(tableCount(database, 'member_references')).toBe(0)
    expect(cursors.findByAlias(SOURCE_ALIAS)).toBeNull()
  })

  it('deduplicates streamed replays and updates member activity only for new observations', async () => {
    const event = humanRow(
      'event-fingerprint',
      'member-a',
      'Alex',
      'A bounded human message.',
      '2026-08-17T11:59:00.000Z',
    )
    const source = new FakeObservationSource([], [event, event])
    const pipeline = createCommunityPipeline(source, observations, cursors)
    const signal = new AbortController().signal

    await pipeline.run(signal)

    expect(source.eventCalls).toEqual([{ alias: SOURCE_ALIAS, signal }])
    expect(tableCount(database, 'observations')).toBe(1)
    const member = database
      .prepare('SELECT activity_count, display_label FROM member_references')
      .get() as { activity_count: number; display_label: string }
    expect(member).toEqual({ activity_count: 1, display_label: 'Alex' })
  })

  it('dispatches concurrent replay only once to case, event, and notification processing', async () => {
    const row = humanRow(
      'concurrent-fingerprint',
      'member-a',
      'Alex',
      'A single committed trigger.',
      '2026-08-17T11:59:00.000Z',
    )
    const onObservationCommitted = async (observationId: string): Promise<void> => {
      const caseId = '22222222-2222-4222-8222-222222222222'
      const eventId = '33333333-3333-4333-8333-333333333333'
      new RecoveryCaseRepository(database).create({
        id: caseId,
        communityId: COMMUNITY_ID,
        fractureKey: 'stable-fracture-key',
        trigger: 'escalating_conflict',
        state: 'needs_review',
        confidence: 0.8,
        uncertainty: 'Only the committed fixture is available.',
        openedAt: NOW,
        updatedAt: NOW,
        monitoringStartedAt: null,
        resolutionDueAt: null,
        dismissedUntil: null,
        outcomeSummary: null,
        version: 1,
      })
      new CaseEventRepository(database).append({
        id: eventId,
        caseId,
        idempotencyKey: `observation:${observationId}`,
        eventType: 'case_opened',
        actor: 'mind',
        provenance: 'mind_inference',
        summary: 'The committed observation produced one staged case.',
        evidenceRefs: [observationId],
        fromState: null,
        toState: 'needs_review',
        occurredAt: NOW,
      })
      new NotificationDeliveryRepository(database).enqueue({
        id: '44444444-4444-4444-8444-444444444444',
        caseEventId: eventId,
        kind: 'initial_alert',
        recipientTelegramId: '123456789',
        payloadDigest: 'stable-payload-digest',
      })
    }
    const dependencies = {
      observations,
      cursors,
      alias: SOURCE_ALIAS,
      communityId: COMMUNITY_ID,
      source: 'minds_telegram_group' as const,
      memberHashKey: 'test-member-hash-key',
      now: () => NOW,
      idFactory: () => crypto.randomUUID(),
      maxAnalysisBatchSize: 10,
      onObservationCommitted,
    }
    const first = new ObservationPipeline({
      ...dependencies,
      client: new FakeObservationSource([row]),
    })
    const second = new ObservationPipeline({
      ...dependencies,
      client: new FakeObservationSource([row]),
    })

    await Promise.all([first.catchUp(), second.catchUp()])

    expect(tableCount(database, 'observations')).toBe(1)
    expect(tableCount(database, 'recovery_cases')).toBe(1)
    expect(tableCount(database, 'case_events')).toBe(1)
    expect(tableCount(database, 'notification_deliveries')).toBe(1)
  })

  it('caps chronological reasoning batches at the configured size', async () => {
    const source = new FakeObservationSource([
      humanRow('fingerprint-1', 'member-a', 'Alex', 'One', '2026-08-17T11:57:00.000Z'),
      humanRow('fingerprint-2', 'member-b', 'Sam', 'Two', '2026-08-17T11:58:00.000Z'),
      humanRow('fingerprint-3', 'member-a', 'Alex', 'Three', '2026-08-17T11:59:00.000Z'),
    ])
    const pipeline = createCommunityPipeline(source, observations, cursors, 2)
    await pipeline.catchUp()

    const batch = pipeline.analysisBatch()

    expect(batch).toHaveLength(2)
    expect(batch.map(({ evidenceExcerpt }) => evidenceExcerpt)).toEqual(['Two', 'Three'])
    expect(batch.every(({ senderType }) => senderType === 1)).toBe(true)
  })

  it('stores creator-alias messages without treating the creator as a community member', async () => {
    const source = new FakeObservationSource([
      humanRow(
        'creator-command',
        'creator-id',
        'Creator',
        'Approve 12345678',
        '2026-08-17T11:59:00.000Z',
      ),
    ])
    const pipeline = new ObservationPipeline({
      client: source,
      observations,
      cursors,
      alias: CREATOR_ALIAS,
      communityId: COMMUNITY_ID,
      source: 'minds_creator_chat',
      memberHashKey: 'test-member-hash-key',
      now: () => NOW,
      idFactory: () => crypto.randomUUID(),
      maxAnalysisBatchSize: 10,
    })

    await expect(pipeline.catchUp()).resolves.toMatchObject({ inserted: 1 })
    const row = database
      .prepare('SELECT source, member_ref_id FROM observations')
      .get() as { source: string; member_ref_id: string | null }
    expect(row).toEqual({ source: 'minds_creator_chat', member_ref_id: null })
    expect(tableCount(database, 'member_references')).toBe(0)
  })
})

function createCommunityPipeline(
  client: ObservationSourceClient,
  observations: ObservationRepository,
  cursors: IngestionCursorRepository,
  maxAnalysisBatchSize = 10,
): ObservationPipeline {
  return new ObservationPipeline({
    client,
    observations,
    cursors,
    alias: SOURCE_ALIAS,
    communityId: COMMUNITY_ID,
    source: 'minds_telegram_group',
    memberHashKey: 'test-member-hash-key',
    now: () => NOW,
    idFactory: () => crypto.randomUUID(),
    maxAnalysisBatchSize,
  })
}

function humanRow(
  fingerprint: string,
  senderId: string,
  senderName: string,
  messageText: string,
  createdAt: string,
): MessageRecord {
  return { fingerprint, senderType: 1, senderId, senderName, messageText, createdAt }
}

function insertCommunity(database: DatabaseSync): void {
  database
    .prepare(
      `INSERT INTO communities
       (id, telegram_chat_ref, display_name, minds_source_alias, observation_status, timing_profile)
       VALUES (?, 'group-ref', 'Staged Creators', ?, 'learning', 'demo')`,
    )
    .run(COMMUNITY_ID, SOURCE_ALIAS)
}

function tableCount(
  database: DatabaseSync,
  table:
    | 'observations'
    | 'member_references'
    | 'recovery_cases'
    | 'case_events'
    | 'notification_deliveries',
): number {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }
  return row.count
}
