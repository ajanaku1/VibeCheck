import type { DatabaseSync } from 'node:sqlite'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDatabase } from '../../src/server/db/database.js'
import { migrate } from '../../src/server/db/migrations.js'
import { CaseEventRepository } from '../../src/server/db/repositories/case-event-repository.js'
import { InterventionRepository } from '../../src/server/db/repositories/intervention-repository.js'
import { RecoveryCaseRepository } from '../../src/server/db/repositories/recovery-case-repository.js'
import { CaseService } from '../../src/server/services/case-service.js'

const COMMUNITY_ID = '11111111-1111-4111-8111-111111111111'
const CASE_ID = '22222222-2222-4222-8222-222222222222'
const INTERVENTION_ID = '33333333-3333-4333-8333-333333333333'
const MEMBER_A = '44444444-4444-4444-8444-444444444444'
const MEMBER_B = '55555555-5555-4555-8555-555555555555'
const RETURN_OBSERVATION = '66666666-6666-4666-8666-666666666666'
const CONSTRUCTIVE_OBSERVATION = '77777777-7777-4777-8777-777777777777'
const EVENT_ID = '88888888-8888-4888-8888-888888888888'
const THIRD_OBSERVATION = '99999999-9999-4999-8999-999999999999'
const CONTEXT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NOW = Date.parse('2026-08-17T12:00:00.000Z')

describe('CaseService creator actions', () => {
  let database: DatabaseSync

  beforeEach(() => {
    database = createDatabase(':memory:')
    migrate(database)
    seedCase(database)
  })

  afterEach(() => database.close())

  it('lists affected labels and only currently allowed actions', async () => {
    const service = createService(database)

    await expect(service.listCases()).resolves.toEqual([
      {
        id: CASE_ID,
        state: 'needs_review',
        affectedLabels: ['Alex', 'Sam'],
        allowedActions: ['approve', 'edit', 'dismiss'],
      },
    ])
  })

  it('persists Approve and Sent as separate events and starts the monitoring deadline', async () => {
    const service = createService(database)

    await expect(service.execute({ action: 'approve', caseId: CASE_ID })).resolves.toEqual({
      state: 'needs_review',
      finalText: 'Suggested private outreach.',
    })
    await expect(service.execute({ action: 'sent', caseId: CASE_ID })).resolves.toEqual({
      state: 'monitoring',
      finalText: 'Suggested private outreach.',
    })

    expect(new InterventionRepository(database).findByCaseId(CASE_ID)).toMatchObject({
      finalizedBy: 'approve',
      finalText: 'Suggested private outreach.',
      finalizedAt: NOW,
      sentConfirmedAt: NOW,
    })
    expect(new RecoveryCaseRepository(database).findById(CASE_ID)).toMatchObject({
      state: 'monitoring',
      monitoringStartedAt: NOW,
      resolutionDueAt: NOW + 600_000,
      version: 3,
    })
    expect(new CaseEventRepository(database).listForCase(CASE_ID).map(({ eventType }) => eventType)).toEqual([
      'draft_approved',
      'outreach_sent_confirmed',
    ])
  })

  it('persists edited outreach without changing state', async () => {
    const service = createService(database)

    await expect(
      service.execute({ action: 'edit', caseId: CASE_ID, replacement: 'Revised outreach.' }),
    ).resolves.toEqual({ state: 'needs_review', finalText: 'Revised outreach.' })

    expect(new InterventionRepository(database).findByCaseId(CASE_ID)).toMatchObject({
      finalizedBy: 'edit',
      finalText: 'Revised outreach.',
    })
    expect(new RecoveryCaseRepository(database).findById(CASE_ID)?.state).toBe('needs_review')
  })

  it('sets the Demo dismissal cooling deadline', async () => {
    const service = createService(database)

    await expect(service.execute({ action: 'dismiss', caseId: CASE_ID })).resolves.toEqual({
      state: 'dismissed',
    })
    expect(new RecoveryCaseRepository(database).findById(CASE_ID)).toMatchObject({
      state: 'dismissed',
      dismissedUntil: NOW + 180_000,
    })
  })

  it('requires both stored recovery evidence roles before confirmation', async () => {
    setCaseState(database, 'recovery_detected')
    const service = createService(database)

    await expect(
      service.execute({ action: 'confirm_recovery', caseId: CASE_ID }),
    ).rejects.toThrow(/recovery evidence/i)
    linkRecoveryEvidence(database, 'return_signal')
    await expect(
      service.execute({ action: 'confirm_recovery', caseId: CASE_ID }),
    ).rejects.toThrow(/recovery evidence/i)
    linkRecoveryEvidence(database, 'constructive_interaction')
    await expect(
      service.execute({ action: 'confirm_recovery', caseId: CASE_ID }),
    ).resolves.toEqual({ state: 'resolved' })

    expect(new RecoveryCaseRepository(database).findById(CASE_ID)).toMatchObject({
      state: 'resolved',
      outcomeSummary: 'Creator confirmed recovery.',
    })
  })

  it('records rejection and unresolved outcomes without losing history', async () => {
    setCaseState(database, 'recovery_detected')
    const service = createService(database)

    await expect(service.execute({ action: 'not_recovered', caseId: CASE_ID })).resolves.toEqual({
      state: 'monitoring',
    })
    await expect(
      service.execute({ action: 'still_unresolved', caseId: CASE_ID }),
    ).resolves.toEqual({ state: 'unresolved' })

    expect(new RecoveryCaseRepository(database).findById(CASE_ID)).toMatchObject({
      state: 'unresolved',
      outcomeSummary: 'Creator confirmed the fracture remains unresolved.',
    })
    expect(new CaseEventRepository(database).listForCase(CASE_ID).map(({ eventType }) => eventType)).toEqual([
      'recovery_rejected',
      'case_expired',
    ])
  })

  it('rolls back intervention and case changes when event persistence fails', async () => {
    new CaseEventRepository(database).append({
      id: EVENT_ID,
      caseId: CASE_ID,
      idempotencyKey: 'existing-event',
      eventType: 'existing_event',
      actor: 'creator',
      provenance: 'creator_decision',
      summary: 'Existing event reserves the injected event ID.',
      evidenceRefs: [],
      fromState: 'needs_review',
      toState: 'needs_review',
      occurredAt: NOW - 1,
    })
    const service = createService(database, () => EVENT_ID)

    await expect(service.execute({ action: 'approve', caseId: CASE_ID })).rejects.toThrow(/UNIQUE/)

    expect(new InterventionRepository(database).findByCaseId(CASE_ID)?.finalText).toBeNull()
    expect(new RecoveryCaseRepository(database).findById(CASE_ID)).toMatchObject({
      state: 'needs_review',
      version: 1,
    })
  })

  it('opens one evidence-backed case with participants, context, intervention, and event', async () => {
    clearCase(database)
    const service = createService(database)

    await expect(service.openOrUpdateCase(eligibleFracture())).resolves.toEqual({
      status: 'opened',
      caseId: CASE_ID,
    })

    expect(tableCount(database, 'recovery_cases')).toBe(1)
    expect(tableCount(database, 'case_participants')).toBe(2)
    expect(tableCount(database, 'case_evidence')).toBe(6)
    expect(tableCount(database, 'intervention_plans')).toBe(1)
    expect(new CaseEventRepository(database).listForCase(CASE_ID)).toMatchObject([
      {
        eventType: 'case_opened',
        actor: 'mind',
        provenance: 'mind_inference',
        toState: 'needs_review',
      },
    ])
  })

  it('deduplicates the same analysis and updates an existing fracture without reopening it', async () => {
    clearCase(database)
    const service = createService(database)
    const input = eligibleFracture()

    await service.openOrUpdateCase(input)
    await expect(service.openOrUpdateCase(input)).resolves.toEqual({
      status: 'duplicate',
      caseId: CASE_ID,
    })
    await expect(
      service.openOrUpdateCase({ ...input, idempotencyKey: 'analysis-run-2', confidence: 0.9 }),
    ).resolves.toEqual({ status: 'updated', caseId: CASE_ID })

    expect(tableCount(database, 'recovery_cases')).toBe(1)
    expect(tableCount(database, 'intervention_plans')).toBe(1)
    expect(new CaseEventRepository(database).listForCase(CASE_ID).map(({ eventType }) => eventType)).toEqual([
      'case_opened',
      'evidence_appended',
    ])
  })

  it('rejects an ineligible fracture and rolls back all case artifacts', async () => {
    clearCase(database)
    const service = createService(database)

    await expect(
      service.openOrUpdateCase({ ...eligibleFracture(), rememberedContextIds: [] }),
    ).rejects.toThrow(/baseline/i)

    expect(tableCount(database, 'recovery_cases')).toBe(0)
    expect(tableCount(database, 'case_events')).toBe(0)
    expect(tableCount(database, 'intervention_plans')).toBe(0)
  })

  it('accumulates recovery evidence and transitions only after both signals', async () => {
    setCaseState(database, 'monitoring')
    const service = createService(database)

    await expect(
      service.recordRecoveryEvidence({
        caseId: CASE_ID,
        idempotencyKey: 'return-only',
        affectedMemberRefId: MEMBER_A,
        returnSignals: [{ observationId: RETURN_OBSERVATION, memberRefId: MEMBER_A }],
        constructiveInteractions: [],
      }),
    ).resolves.toEqual({ status: 'evidence_appended', state: 'monitoring' })
    await expect(
      service.recordRecoveryEvidence({
        caseId: CASE_ID,
        idempotencyKey: 'both-signals',
        affectedMemberRefId: MEMBER_A,
        returnSignals: [{ observationId: RETURN_OBSERVATION, memberRefId: MEMBER_A }],
        constructiveInteractions: [
          {
            observationIds: [CONSTRUCTIVE_OBSERVATION],
            memberRefIds: [MEMBER_A, MEMBER_B],
            relatesToFracture: true,
          },
        ],
      }),
    ).resolves.toEqual({ status: 'recovery_detected', state: 'recovery_detected' })

    expect(new RecoveryCaseRepository(database).findById(CASE_ID)?.state).toBe('recovery_detected')
    expect(new CaseEventRepository(database).listForCase(CASE_ID).map(({ eventType }) => eventType)).toEqual([
      'evidence_appended',
      'recovery_detected',
    ])
  })
})

function createService(database: DatabaseSync, idFactory = () => crypto.randomUUID()): CaseService {
  return new CaseService({ database, timingProfile: 'demo', now: () => NOW, idFactory })
}

function seedCase(database: DatabaseSync): void {
  database
    .prepare(
      `INSERT INTO communities
       (id, telegram_chat_ref, display_name, minds_source_alias, observation_status, timing_profile)
       VALUES (?, 'group-ref', 'Staged Creators', 'vibecheck-community-source', 'observing', 'demo')`,
    )
    .run(COMMUNITY_ID)
  insertMember(database, MEMBER_A, 'member-a-hash', 'Alex')
  insertMember(database, MEMBER_B, 'member-b-hash', 'Sam')
  insertObservation(database, RETURN_OBSERVATION, MEMBER_A, 'Affected member returned.')
  insertObservation(database, CONSTRUCTIVE_OBSERVATION, MEMBER_B, 'Constructive interaction.')
  insertObservation(database, THIRD_OBSERVATION, MEMBER_A, 'A third relevant exchange message.')
  database
    .prepare(
      `INSERT INTO community_context
       (id, community_id, kind, statement, member_refs_json, evidence_observation_ids_json,
        confidence, status, created_at)
       VALUES (?, ?, 'relationship', 'Alex and Sam normally repair disagreements directly.', ?, ?,
               0.85, 'active', ?)`,
    )
    .run(
      CONTEXT_ID,
      COMMUNITY_ID,
      JSON.stringify([MEMBER_A, MEMBER_B]),
      JSON.stringify([RETURN_OBSERVATION]),
      NOW - 5_000,
    )
  new RecoveryCaseRepository(database).create({
    id: CASE_ID,
    communityId: COMMUNITY_ID,
    fractureKey: 'stable-fracture-key',
    trigger: 'escalating_conflict',
    state: 'needs_review',
    confidence: 0.82,
    uncertainty: 'Intent remains uncertain.',
    openedAt: NOW - 1_000,
    updatedAt: NOW - 1_000,
    monitoringStartedAt: null,
    resolutionDueAt: null,
    dismissedUntil: null,
    outcomeSummary: null,
    version: 1,
  })
  database
    .prepare(
      `INSERT INTO case_participants (case_id, member_ref_id, role)
       VALUES (?, ?, 'affected'), (?, ?, 'counterparty')`,
    )
    .run(CASE_ID, MEMBER_A, CASE_ID, MEMBER_B)
  new InterventionRepository(database).create({
    id: INTERVENTION_ID,
    caseId: CASE_ID,
    suggestedText: 'Suggested private outreach.',
  })
}

function insertMember(database: DatabaseSync, id: string, hash: string, label: string): void {
  database
    .prepare(
      `INSERT INTO member_references
       (id, community_id, external_ref_hash, display_label, first_seen_at, last_active_at, activity_count)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
    )
    .run(id, COMMUNITY_ID, hash, label, NOW - 2_000, NOW - 1_000)
}

function insertObservation(
  database: DatabaseSync,
  id: string,
  memberRefId: string,
  excerpt: string,
): void {
  database
    .prepare(
      `INSERT INTO observations
       (id, community_id, source, source_fingerprint, session_ref, member_ref_id,
        occurred_at, ingested_at, evidence_excerpt, content_digest, visibility)
       VALUES (?, ?, 'minds_telegram_group', ?, 'session-3', ?, ?, ?, ?, ?, 'case_evidence')`,
    )
    .run(id, COMMUNITY_ID, `fingerprint-${id}`, memberRefId, NOW - 500, NOW - 400, excerpt, `digest-${id}`)
}

function setCaseState(
  database: DatabaseSync,
  state: 'monitoring' | 'recovery_detected',
): void {
  database.prepare('UPDATE recovery_cases SET state = ? WHERE id = ?').run(state, CASE_ID)
}

function linkRecoveryEvidence(
  database: DatabaseSync,
  role: 'return_signal' | 'constructive_interaction',
): void {
  const observationId = role === 'return_signal' ? RETURN_OBSERVATION : CONSTRUCTIVE_OBSERVATION
  database
    .prepare(
      `INSERT INTO case_evidence (case_id, evidence_id, evidence_type, role)
       VALUES (?, ?, 'observation', ?)`,
    )
    .run(CASE_ID, observationId, role)
}

function clearCase(database: DatabaseSync): void {
  database.prepare('DELETE FROM intervention_plans').run()
  database.prepare('DELETE FROM case_participants').run()
  database.prepare('DELETE FROM recovery_cases').run()
}

function eligibleFracture() {
  return {
    caseId: CASE_ID,
    interventionId: INTERVENTION_ID,
    communityId: COMMUNITY_ID,
    fractureKey: 'stable-fracture-key',
    trigger: 'escalating_conflict' as const,
    idempotencyKey: 'analysis-run-1',
    participants: [
      { memberRefId: MEMBER_A, role: 'affected' as const },
      { memberRefId: MEMBER_B, role: 'counterparty' as const },
    ],
    messageEvidence: [
      { observationId: RETURN_OBSERVATION, memberRefId: MEMBER_A },
      { observationId: CONSTRUCTIVE_OBSERVATION, memberRefId: MEMBER_B },
      { observationId: THIRD_OBSERVATION, memberRefId: MEMBER_A },
    ],
    indicatorEvidence: [
      {
        type: 'contempt_or_dismissal' as const,
        evidenceRefs: [RETURN_OBSERVATION],
      },
      {
        type: 'explicit_intent_to_disengage' as const,
        evidenceRefs: [CONSTRUCTIVE_OBSERVATION],
      },
    ],
    rememberedContextIds: [CONTEXT_ID],
    observedChangeObservationIds: [THIRD_OBSERVATION],
    confidence: 0.82,
    uncertainty: 'Intent remains uncertain.',
    suggestedOutreach: 'Suggested private outreach.',
  }
}

function tableCount(
  database: DatabaseSync,
  table:
    | 'recovery_cases'
    | 'case_participants'
    | 'case_evidence'
    | 'intervention_plans'
    | 'case_events',
): number {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }
  return row.count
}
