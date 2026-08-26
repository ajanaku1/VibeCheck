import type { DatabaseSync } from 'node:sqlite'

import type { OpenOrUpdateCaseInput } from '../../src/server/services/case-service.js'

export const CANONICAL = {
  communityId: '10000000-0000-4000-8000-000000000001',
  caseId: '20000000-0000-4000-8000-000000000001',
  interventionId: '30000000-0000-4000-8000-000000000001',
  memberAlex: '40000000-0000-4000-8000-000000000001',
  memberSam: '40000000-0000-4000-8000-000000000002',
  normContext: '50000000-0000-4000-8000-000000000001',
  relationshipContext: '50000000-0000-4000-8000-000000000002',
  baselineNorm: '60000000-0000-4000-8000-000000000001',
  baselineRelationship: '60000000-0000-4000-8000-000000000002',
  conflictAlexOne: '60000000-0000-4000-8000-000000000003',
  conflictSam: '60000000-0000-4000-8000-000000000004',
  conflictAlexTwo: '60000000-0000-4000-8000-000000000005',
  returnSignal: '60000000-0000-4000-8000-000000000006',
  constructiveSignal: '60000000-0000-4000-8000-000000000007',
  baseTime: Date.parse('2026-08-26T12:00:00.000Z'),
} as const

interface ObservationSeed {
  id: string
  memberId: string
  session: string
  excerpt: string
  offsetMs: number
}

const OBSERVATIONS: ObservationSeed[] = [
  { id: CANONICAL.baselineNorm, memberId: CANONICAL.memberAlex, session: 'session-1', excerpt: 'We challenge ideas without making it personal.', offsetMs: 1_000 },
  { id: CANONICAL.baselineRelationship, memberId: CANONICAL.memberSam, session: 'session-1', excerpt: 'Alex and Sam paired successfully after their last disagreement.', offsetMs: 2_000 },
  { id: CANONICAL.conflictAlexOne, memberId: CANONICAL.memberAlex, session: 'session-2', excerpt: 'You ignored the tradeoffs again.', offsetMs: 10_000 },
  { id: CANONICAL.conflictSam, memberId: CANONICAL.memberSam, session: 'session-2', excerpt: 'That is dismissive. I tried to de-escalate this twice.', offsetMs: 11_000 },
  { id: CANONICAL.conflictAlexTwo, memberId: CANONICAL.memberAlex, session: 'session-2', excerpt: 'I am done contributing if this is how we work.', offsetMs: 12_000 },
  { id: CANONICAL.returnSignal, memberId: CANONICAL.memberAlex, session: 'session-3', excerpt: 'Alex returned to the project thread.', offsetMs: 20_000 },
  { id: CANONICAL.constructiveSignal, memberId: CANONICAL.memberSam, session: 'session-3', excerpt: 'Alex and Sam agreed on a smaller review step together.', offsetMs: 21_000 },
]

export function seedCanonicalFoundation(database: DatabaseSync): void {
  insertCommunity(database)
  insertMember(database, CANONICAL.memberAlex, 'alex-hash', 'Alex')
  insertMember(database, CANONICAL.memberSam, 'sam-hash', 'Sam')
  for (const observation of OBSERVATIONS) insertObservation(database, observation)
  insertCanonicalContexts(database)
}

function insertCanonicalContexts(database: DatabaseSync): void {
  insertContext(
    database,
    CANONICAL.normContext,
    'norm',
    'Members challenge ideas without making disagreement personal.',
    [CANONICAL.baselineNorm],
  )
  insertContext(
    database,
    CANONICAL.relationshipContext,
    'relationship',
    'Alex and Sam normally repair disagreements by pairing on a smaller next step.',
    [CANONICAL.baselineRelationship],
  )
}

export function canonicalFractureInput(): OpenOrUpdateCaseInput {
  return {
    caseId: CANONICAL.caseId,
    interventionId: CANONICAL.interventionId,
    communityId: CANONICAL.communityId,
    fractureKey: 'alex-sam-project-review',
    trigger: 'escalating_conflict',
    idempotencyKey: 'rehearsal:fracture',
    participants: [
      { memberRefId: CANONICAL.memberAlex, role: 'affected' },
      { memberRefId: CANONICAL.memberSam, role: 'counterparty' },
    ],
    messageEvidence: [
      { observationId: CANONICAL.conflictAlexOne, memberRefId: CANONICAL.memberAlex },
      { observationId: CANONICAL.conflictSam, memberRefId: CANONICAL.memberSam },
      { observationId: CANONICAL.conflictAlexTwo, memberRefId: CANONICAL.memberAlex },
    ],
    indicatorEvidence: [
      { type: 'contempt_or_dismissal', evidenceRefs: [CANONICAL.conflictSam] },
      { type: 'explicit_intent_to_disengage', evidenceRefs: [CANONICAL.conflictAlexTwo] },
    ],
    rememberedContextIds: [CANONICAL.normContext, CANONICAL.relationshipContext],
    observedChangeObservationIds: [CANONICAL.conflictAlexTwo],
    confidence: 0.86,
    uncertainty: 'The intent behind the final message still needs creator context.',
    suggestedOutreach: 'Check in privately, name the tension, and ask what would make collaboration feel workable again.',
  }
}

function insertCommunity(database: DatabaseSync): void {
  database.prepare(
    `INSERT INTO communities
     (id, telegram_chat_ref, display_name, minds_source_alias, observation_status, timing_profile)
     VALUES (?, '-1000000000001', 'Staged Creators', 'vibecheck-engine', 'observing', 'demo')`,
  ).run(CANONICAL.communityId)
}

function insertMember(database: DatabaseSync, id: string, hash: string, label: string): void {
  database.prepare(
    `INSERT INTO member_references
     (id, community_id, external_ref_hash, display_label, first_seen_at, last_active_at, activity_count)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
  ).run(id, CANONICAL.communityId, hash, label, CANONICAL.baseTime, CANONICAL.baseTime)
}

function insertObservation(database: DatabaseSync, observation: ObservationSeed): void {
  const timestamp = CANONICAL.baseTime + observation.offsetMs
  database.prepare(
    `INSERT INTO observations
     (id, community_id, source, source_fingerprint, session_ref, member_ref_id,
      occurred_at, ingested_at, evidence_excerpt, content_digest, visibility)
     VALUES (?, ?, 'telegram_webhook_group', ?, ?, ?, ?, ?, ?, ?, 'case_evidence')`,
  ).run(
    observation.id,
    CANONICAL.communityId,
    `rehearsal:${observation.id}`,
    observation.session,
    observation.memberId,
    timestamp,
    timestamp,
    observation.excerpt,
    `digest:${observation.id}`,
  )
}

function insertContext(
  database: DatabaseSync,
  id: string,
  kind: 'norm' | 'relationship',
  statement: string,
  evidenceIds: string[],
): void {
  database.prepare(
    `INSERT INTO community_context
     (id, community_id, kind, statement, member_refs_json, evidence_observation_ids_json,
      confidence, status, created_at, superseded_at)
     VALUES (?, ?, ?, ?, ?, ?, 0.9, 'active', ?, NULL)`,
  ).run(
    id,
    CANONICAL.communityId,
    kind,
    statement,
    JSON.stringify([CANONICAL.memberAlex, CANONICAL.memberSam]),
    JSON.stringify(evidenceIds),
    CANONICAL.baseTime,
  )
}
