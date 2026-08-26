import type { DatabaseSync } from 'node:sqlite'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDatabase } from '../../src/server/db/database.js'
import { migrate } from '../../src/server/db/migrations.js'
import { CaseEventRepository } from '../../src/server/db/repositories/case-event-repository.js'
import { IngestionCursorRepository } from '../../src/server/db/repositories/ingestion-cursor-repository.js'
import { NotificationDeliveryRepository } from '../../src/server/db/repositories/notification-delivery-repository.js'
import { ObservationRepository } from '../../src/server/db/repositories/observation-repository.js'
import { ReasoningRunRepository } from '../../src/server/db/repositories/reasoning-run-repository.js'
import { OperationalError } from '../../src/server/errors.js'
import { NotificationService } from '../../src/server/services/notification-service.js'
import { ObservationPipeline } from '../../src/server/services/observation-pipeline.js'
import { ReasoningService } from '../../src/server/services/reasoning-service.js'
import { RecoveryReadService } from '../../src/server/services/recovery-read-service.js'
import { CaseService } from '../../src/server/services/case-service.js'
import { CommandService } from '../../src/server/services/command-service.js'

const COMMUNITY_ID = '11111111-1111-4111-8111-111111111111'
const CASE_ID = '22222222-2222-4222-8222-222222222222'
const OBSERVATION_ID = '33333333-3333-4333-8333-333333333333'
const EVENT_ID = '44444444-4444-4444-8444-444444444444'

describe('failure integrity matrix', () => {
  let database: DatabaseSync

  beforeEach(() => {
    database = createDatabase(':memory:')
    migrate(database)
    seedBaseRecord(database)
  })

  afterEach(() => database.close())

  it('reports observation retrieval failure without committing fabricated evidence', async () => {
    const statusChanges: Array<{ status: string; code: string }> = []
    const dependencies = {
      client: {
        getHistory: async () => { throw new Error('Minds history unavailable') },
        events: async function* () {},
      },
      observations: new ObservationRepository(database),
      cursors: new IngestionCursorRepository(database),
      alias: 'community-source',
      communityId: COMMUNITY_ID,
      source: 'minds_telegram_group',
      memberHashKey: 'test-member-hash-key',
      maxAnalysisBatchSize: 10,
      status: {
        markObserving: () => undefined,
        markDelayed: (_communityId: string, code: string) => {
          statusChanges.push({ status: 'delayed', code })
        },
      },
    } as unknown as ConstructorParameters<typeof ObservationPipeline>[0]
    const pipeline = new ObservationPipeline(dependencies)

    await expect(pipeline.catchUp()).rejects.toThrow('Minds history unavailable')
    expect(statusChanges).toEqual([{ status: 'delayed', code: 'minds_history_unavailable' }])
    expect(tableCount(database, 'observations')).toBe(1)
    expect(caseState(database)).toBe('needs_review')
  })

  it('records reasoning transport failure without creating a case event', async () => {
    const runs = new ReasoningRunRepository(database)
    const reasoning = new ReasoningService({
      transport: { sendAndWait: async () => { throw new Error('Minds unavailable') } },
      store: runs,
      engineAlias: 'vibecheck-engine',
      idFactory: () => '55555555-5555-4555-8555-555555555555',
      now: () => 5_000,
    })

    const result = await reasoning.analyze({
      analysisKind: 'fracture',
      timeoutMs: 1_000,
      observations: [{
        id: OBSERVATION_ID,
        memberRefId: null,
        senderType: 1,
        occurredAt: '2026-08-18T12:00:00.000Z',
        evidenceExcerpt: 'A difficult exchange.',
      }],
    })

    expect(result).toMatchObject({ status: 'failed', errorCode: 'minds_request_failed' })
    expect(runs.findByInputDigest(result.inputDigest)).toMatchObject({
      status: 'failed',
      errorCode: 'minds_request_failed',
    })
    expect(tableCount(database, 'case_events')).toBe(1)
    expect(caseState(database)).toBe('needs_review')
  })

  it('rejects persistence with unresolved evidence before appending an event', () => {
    const events = new CaseEventRepository(database)

    expect(() => events.append({
      id: '66666666-6666-4666-8666-666666666666',
      caseId: CASE_ID,
      idempotencyKey: 'bad-evidence',
      eventType: 'evidence_appended',
      actor: 'mind',
      provenance: 'mind_inference',
      summary: 'This must not be persisted.',
      evidenceRefs: ['99999999-9999-4999-8999-999999999999'],
      fromState: 'needs_review',
      toState: 'needs_review',
      occurredAt: 4_000,
    })).toThrow('Unknown evidence reference')
    expect(tableCount(database, 'case_events')).toBe(1)
    expect(caseState(database)).toBe('needs_review')
  })

  it('quarantines ambiguous notification delivery without advancing case state', async () => {
    const repository = new NotificationDeliveryRepository(database)
    const service = new NotificationService({
      repository,
      messenger: {
        sendCreatorMessage: async () => {
          throw new OperationalError({
            code: 'telegram_delivery_unknown',
            title: 'Telegram outcome is ambiguous',
            status: 502,
            retryable: false,
          })
        },
      },
      now: () => 6_000,
    })
    const notification = {
      id: '77777777-7777-4777-8777-777777777777',
      caseEventId: EVENT_ID,
      kind: 'initial_alert' as const,
      recipientTelegramId: '42',
      text: 'Mind inference · A recovery case needs review.',
    }

    service.enqueue(notification)
    await expect(service.deliver(notification.id, notification.text)).resolves.toEqual({
      status: 'unknown',
      errorCode: 'telegram_delivery_unknown',
    })
    expect(repository.findById(notification.id)).toMatchObject({ status: 'unknown' })
    expect(caseState(database)).toBe('needs_review')
  })

  it('persists an invalid command event without changing the case state', async () => {
    const cases = new CaseService({
      database,
      timingProfile: 'demo',
      idFactory: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      now: () => 6_500,
    })
    const commands = new CommandService({ authorizedTelegramUserId: '42', gateway: cases })

    await expect(commands.handle({
      senderTelegramUserId: '42',
      text: `Sent ${CASE_ID}`,
    })).resolves.toMatchObject({ status: 'help', code: 'invalid_state' })

    const event = database
      .prepare(
        `SELECT event_type, actor, provenance, from_state, to_state
         FROM case_events WHERE event_type = 'invalid_command'`,
      )
      .get() as Record<string, string> | undefined
    expect(event).toEqual({
      event_type: 'invalid_command',
      actor: 'creator',
      provenance: 'creator_decision',
      from_state: 'needs_review',
      to_state: 'needs_review',
    })
    expect(caseState(database)).toBe('needs_review')
  })

  it('fails closed when a stored timeline contains an unresolved evidence reference', () => {
    database.prepare(
      `INSERT INTO case_events
       (id, case_id, idempotency_key, event_type, actor, provenance, summary,
        evidence_refs_json, from_state, to_state, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      '88888888-8888-4888-8888-888888888888',
      CASE_ID,
      'poisoned-read',
      'evidence_appended',
      'mind',
      'mind_inference',
      'Stored event with missing evidence.',
      '["99999999-9999-4999-8999-999999999999"]',
      'needs_review',
      'needs_review',
      7_000,
    )
    const reads = new RecoveryReadService(database, COMMUNITY_ID)

    expect(() => reads.detail(CASE_ID)).toThrowError(expect.objectContaining({
      code: 'recovery_provenance_invalid',
      retryable: true,
    }))
    expect(caseState(database)).toBe('needs_review')
  })

  it('fails closed when a stored event actor contradicts its provenance', () => {
    database.prepare(
      `INSERT INTO case_events
       (id, case_id, idempotency_key, event_type, actor, provenance, summary,
        evidence_refs_json, from_state, to_state, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      CASE_ID,
      'mislabeled-event',
      'draft_approved',
      'creator',
      'mind_inference',
      'Contradictory provenance must not be projected.',
      '[]',
      'needs_review',
      'needs_review',
      7_100,
    )
    const reads = new RecoveryReadService(database, COMMUNITY_ID)

    expect(() => reads.detail(CASE_ID)).toThrowError(expect.objectContaining({
      code: 'recovery_provenance_invalid',
      retryable: true,
    }))
  })
})

function seedBaseRecord(database: DatabaseSync): void {
  database.exec(`
    INSERT INTO communities
      (id, telegram_chat_ref, display_name, minds_source_alias, observation_status, timing_profile)
    VALUES ('${COMMUNITY_ID}', '-100-test', 'Staged Creators', 'community-source', 'observing', 'demo');
    INSERT INTO observations
      (id, community_id, source, source_fingerprint, session_ref, member_ref_id, occurred_at,
       ingested_at, evidence_excerpt, content_digest, visibility)
    VALUES ('${OBSERVATION_ID}', '${COMMUNITY_ID}', 'minds_telegram_group', 'source-one',
      'session-1', NULL, 1_000, 1_001, 'A difficult exchange.', 'digest-one', 'case_evidence');
    INSERT INTO recovery_cases
      (id, community_id, fracture_key, trigger, state, confidence, uncertainty, opened_at,
       updated_at, monitoring_started_at, resolution_due_at, dismissed_until, outcome_summary, version)
    VALUES ('${CASE_ID}', '${COMMUNITY_ID}', 'fracture-key', 'escalating_conflict', 'needs_review',
      0.8, 'Intent remains uncertain.', 2_000, 2_000, NULL, NULL, NULL, NULL, 1);
    INSERT INTO intervention_plans
      (id, case_id, suggested_text, final_text, finalized_by, finalized_at, sent_confirmed_at)
    VALUES ('99999999-8888-4777-8666-555555555555', '${CASE_ID}', 'Check in privately.',
      NULL, NULL, NULL, NULL);
    INSERT INTO case_events
      (id, case_id, idempotency_key, event_type, actor, provenance, summary,
       evidence_refs_json, from_state, to_state, occurred_at)
    VALUES ('${EVENT_ID}', '${CASE_ID}', 'open', 'case_opened', 'mind', 'mind_inference',
      'Mind analysis met the deterministic fracture gate.', '["${OBSERVATION_ID}"]',
      NULL, 'needs_review', 2_000);
  `)
}

function tableCount(database: DatabaseSync, table: string): number {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }
  return row.count
}

function caseState(database: DatabaseSync): string {
  const row = database.prepare('SELECT state FROM recovery_cases WHERE id = ?').get(CASE_ID) as {
    state: string
  }
  return row.state
}
