import type { DatabaseSync } from 'node:sqlite'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MindAnalysis } from '../../src/domain/types.js'
import { createDatabase } from '../../src/server/db/database.js'
import { migrate } from '../../src/server/db/migrations.js'
import { CommunityContextRepository } from '../../src/server/db/repositories/community-context-repository.js'
import { NotificationDeliveryRepository } from '../../src/server/db/repositories/notification-delivery-repository.js'
import { ObservationRepository } from '../../src/server/db/repositories/observation-repository.js'
import { CaseService } from '../../src/server/services/case-service.js'
import {
  CommunityObservationCoordinator,
  CreatorObservationCoordinator,
} from '../../src/server/services/runtime-coordinator.js'

const COMMUNITY_ID = '11111111-1111-4111-8111-111111111111'
const MEMBER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const MEMBER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const OBS_1 = '10000000-0000-4000-8000-000000000001'
const OBS_2 = '10000000-0000-4000-8000-000000000002'
const OBS_3 = '10000000-0000-4000-8000-000000000003'
const CONTEXT_ID = '20000000-0000-4000-8000-000000000001'

let database: DatabaseSync
let observations: ObservationRepository

beforeEach(() => {
  database = createDatabase(':memory:')
  migrate(database)
  database
    .prepare(
      `INSERT INTO communities
       (id, telegram_chat_ref, display_name, minds_source_alias, observation_status,
        timing_profile)
       VALUES (?, '-1001', 'Test community', 'source', 'observing', 'demo')`,
    )
    .run(COMMUNITY_ID)
  seedMember(MEMBER_A, 'A')
  seedMember(MEMBER_B, 'B')
  seedObservation(OBS_1, MEMBER_A, 1_000, 'First message')
  seedObservation(OBS_2, MEMBER_B, 2_000, 'Second message')
  seedObservation(OBS_3, MEMBER_A, 3_000, 'Third message')
  observations = new ObservationRepository(database)
})

describe('community observation coordination', () => {
  it('retains evidence-backed baseline context before looking for fractures', async () => {
    const reasoning = fakeReasoning(analysis({
      analysisKind: 'baseline',
      recommendedAction: 'retain_context',
      involvedMemberRefs: [MEMBER_A, MEMBER_B],
      context: [
        {
          kind: 'norm',
          statement: 'Members normally challenge ideas without attacking people.',
          evidenceRefs: [OBS_1, OBS_2],
          confidence: 0.8,
        },
      ],
    }))
    const coordinator = makeCoordinator(reasoning)

    const result = await coordinator.handle(OBS_3)

    expect(result).toEqual({ status: 'context_retained', count: 1 })
    expect(reasoning.analyze).toHaveBeenCalledWith(
      expect.objectContaining({ analysisKind: 'baseline' }),
    )
    expect(new CommunityContextRepository(database).listActive(COMMUNITY_ID)).toHaveLength(1)
  })

  it('opens one eligible fracture case and queues a provenance-labelled creator alert', async () => {
    seedContext()
    const reasoning = fakeReasoning(analysis({
      analysisKind: 'fracture',
      recommendedAction: 'open_or_update_case',
      involvedMemberRefs: [MEMBER_A, MEMBER_B],
      suggestedOutreach: 'Check in privately and acknowledge the impact.',
      escalationIndicators: [
        { type: 'direct_personal_criticism', evidenceRefs: [OBS_1], explanation: 'Personal' },
        { type: 'contempt_or_dismissal', evidenceRefs: [OBS_2], explanation: 'Dismissive' },
      ],
    }))
    const coordinator = makeCoordinator(reasoning)

    const result = await coordinator.handle(OBS_3)

    expect(result.status).toBe('case_opened')
    const recoveryCase = database.prepare('SELECT state FROM recovery_cases').get()
    const delivery = database
      .prepare('SELECT kind, payload_text, status FROM notification_deliveries')
      .get() as Record<string, unknown>
    expect(recoveryCase).toEqual({ state: 'needs_review' })
    expect(delivery).toMatchObject({ kind: 'initial_alert', status: 'pending' })
    expect(delivery.payload_text).toContain('Mind inference ·')
    expect(delivery.payload_text).toContain('Check in privately')
  })

  it('ignores a Mind fracture recommendation that fails deterministic eligibility', async () => {
    seedContext()
    const reasoning = fakeReasoning(analysis({
      analysisKind: 'fracture',
      recommendedAction: 'open_or_update_case',
      involvedMemberRefs: [MEMBER_A, MEMBER_B],
      suggestedOutreach: 'Premature suggestion',
      escalationIndicators: [
        { type: 'direct_personal_criticism', evidenceRefs: [OBS_1], explanation: 'Only one' },
      ],
    }))

    await expect(makeCoordinator(reasoning).handle(OBS_3)).resolves.toEqual({
      status: 'no_action',
    })
    expect(database.prepare('SELECT id FROM recovery_cases').get()).toBeUndefined()
  })

  it('ignores involved member references that do not resolve to stored observations', async () => {
    seedContext()
    const reasoning = fakeReasoning(analysis({
      analysisKind: 'fracture',
      recommendedAction: 'open_or_update_case',
      involvedMemberRefs: [MEMBER_A, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'],
      suggestedOutreach: 'Unsafe suggestion',
      escalationIndicators: [
        { type: 'direct_personal_criticism', evidenceRefs: [OBS_1], explanation: 'Personal' },
        { type: 'contempt_or_dismissal', evidenceRefs: [OBS_2], explanation: 'Dismissive' },
      ],
    }))

    await expect(makeCoordinator(reasoning).handle(OBS_3)).resolves.toEqual({
      status: 'no_action',
    })
    expect(database.prepare('SELECT id FROM recovery_cases').get()).toBeUndefined()
  })

  it('records both recovery signals and queues creator confirmation', async () => {
    seedMonitoringCase()
    const reasoning = fakeReasoning(analysis({
      analysisKind: 'recovery',
      recommendedAction: 'request_recovery_confirmation',
      involvedMemberRefs: [MEMBER_A, MEMBER_B],
      recoverySignals: {
        affectedMemberReturned: {
          present: true,
          evidenceRefs: [OBS_3],
          explanation: 'Affected member returned.',
        },
        relevantConstructiveInteraction: {
          present: true,
          evidenceRefs: [OBS_2, OBS_3],
          explanation: 'They interacted constructively.',
        },
      },
    }))
    const coordinator = makeCoordinator(reasoning)

    const result = await coordinator.handle(OBS_3)

    expect(result.status).toBe('recovery_detected')
    expect(database.prepare('SELECT state FROM recovery_cases').get()).toEqual({
      state: 'recovery_detected',
    })
    expect(database.prepare('SELECT kind FROM notification_deliveries').get()).toEqual({
      kind: 'recovery_confirmation',
    })
  })
})

describe('creator observation coordination', () => {
  it('loads the committed private message, applies it as the allowlisted creator, and replies privately', async () => {
    const creatorObservationId = '30000000-0000-4000-8000-000000000001'
    seedObservation(creatorObservationId, null, 4_000, 'Approve', 'minds_creator_chat')
    const commandService = {
      handle: vi.fn().mockResolvedValue({
        status: 'applied',
        caseId: 'case-12345678',
        state: 'needs_review',
        finalText: 'Approved outreach',
      }),
    }
    const messenger = { sendCreatorMessage: vi.fn().mockResolvedValue({ messageId: '7' }) }
    const coordinator = new CreatorObservationCoordinator({
      observations,
      commands: commandService,
      messenger,
      authorizedTelegramUserId: '42',
    })

    await coordinator.handle(creatorObservationId)

    expect(commandService.handle).toHaveBeenCalledWith({
      senderTelegramUserId: '42',
      text: 'Approve',
    })
    expect(messenger.sendCreatorMessage).toHaveBeenCalledWith({
      recipientTelegramId: '42',
      text: expect.stringContaining('Approved outreach'),
    })
  })
})

function makeCoordinator(reasoning: ReturnType<typeof fakeReasoning>) {
  const ids = [
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000003',
  ]
  return new CommunityObservationCoordinator({
    database,
    communityId: COMMUNITY_ID,
    analysisBatch: () => observations.listRecentCommunityEvidence(COMMUNITY_ID, 50).map((row) => ({
      id: row.id,
      memberRefId: row.memberRefId,
      senderType: 1,
      occurredAt: new Date(row.occurredAt).toISOString(),
      evidenceExcerpt: row.evidenceExcerpt,
    })),
    reasoning,
    cases: new CaseService({ database, timingProfile: 'demo' }),
    contexts: new CommunityContextRepository(database),
    notifications: {
      enqueueMindNotification: (notification) => {
        const repository = new NotificationDeliveryRepository(database)
        return repository.enqueue({
          ...notification,
          payloadDigest: 'test-digest',
          payloadText: `Mind inference · ${notification.text}`,
        })
      },
    },
    recipientTelegramId: '42',
    replyTimeoutMs: 1_000,
    idFactory: () => ids.shift()!,
  })
}

function fakeReasoning(value: MindAnalysis) {
  return {
    analyze: vi.fn().mockResolvedValue({
      status: 'succeeded',
      runId: 'run',
      inputDigest: 'digest',
      analysis: value,
      replyFingerprint: 'reply',
    }),
  }
}

function analysis(overrides: Partial<MindAnalysis>): MindAnalysis {
  return {
    schemaVersion: 'vibecheck.analysis.v1',
    analysisKind: 'fracture',
    observationRefs: [OBS_1, OBS_2, OBS_3],
    involvedMemberRefs: [MEMBER_A, MEMBER_B],
    context: [],
    escalationIndicators: [],
    recoverySignals: {
      affectedMemberReturned: { present: false, evidenceRefs: [], explanation: '' },
      relevantConstructiveInteraction: { present: false, evidenceRefs: [], explanation: '' },
    },
    confidence: 0.8,
    uncertainty: 'This remains an inference for creator review.',
    observedChange: 'The exchange became personal.',
    suggestedOutreach: null,
    recommendedAction: 'observe_only',
    ...overrides,
  }
}

function seedMember(id: string, label: string): void {
  database
    .prepare(
      `INSERT INTO member_references
       (id, community_id, external_ref_hash, display_label, first_seen_at, last_active_at,
        activity_count)
       VALUES (?, ?, ?, ?, 0, 0, 1)`,
    )
    .run(id, COMMUNITY_ID, `hash-${id}`, label)
}

function seedObservation(
  id: string,
  memberRefId: string | null,
  occurredAt: number,
  text: string,
  source: 'minds_telegram_group' | 'minds_creator_chat' = 'minds_telegram_group',
): void {
  database
    .prepare(
      `INSERT INTO observations
       (id, community_id, source, source_fingerprint, session_ref, member_ref_id,
        occurred_at, ingested_at, evidence_excerpt, content_digest, visibility)
       VALUES (?, ?, ?, ?, 'session', ?, ?, ?, ?, ?, 'internal')`,
    )
    .run(id, COMMUNITY_ID, source, `fingerprint-${id}`, memberRefId, occurredAt, occurredAt, text, `digest-${id}`)
}

function seedContext(): void {
  new CommunityContextRepository(database).create({
    id: CONTEXT_ID,
    communityId: COMMUNITY_ID,
    kind: 'norm',
    statement: 'Members normally disagree constructively.',
    memberRefs: [MEMBER_A, MEMBER_B],
    evidenceObservationIds: [OBS_1],
    confidence: 0.8,
    status: 'active',
    createdAt: 1_000,
    supersededAt: null,
  })
}

function seedMonitoringCase(): void {
  seedContext()
  database
    .prepare(
      `INSERT INTO recovery_cases
       (id, community_id, fracture_key, trigger, state, confidence, uncertainty,
        opened_at, updated_at, monitoring_started_at, resolution_due_at, version)
       VALUES ('case-1', ?, 'fracture-1', 'escalating_conflict', 'monitoring', 0.8,
               'Uncertain', 1, 1, 1, 999999, 1)`,
    )
    .run(COMMUNITY_ID)
  database
    .prepare("INSERT INTO case_participants (case_id, member_ref_id, role) VALUES ('case-1', ?, 'affected')")
    .run(MEMBER_A)
  database
    .prepare("INSERT INTO case_participants (case_id, member_ref_id, role) VALUES ('case-1', ?, 'counterparty')")
    .run(MEMBER_B)
}
