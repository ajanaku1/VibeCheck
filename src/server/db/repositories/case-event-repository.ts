import type { DatabaseSync } from 'node:sqlite'

import type { CaseState } from '../../../domain/case-state.js'
import type { Actor, Provenance } from '../../../domain/types.js'
import { assertCaseEvidenceRefs } from './evidence-reference-policy.js'

export interface StoredCaseEvent {
  id: string
  caseId: string
  idempotencyKey: string
  eventType: string
  actor: Actor
  provenance: Provenance
  summary: string
  evidenceRefs: string[]
  fromState: CaseState | null
  toState: CaseState
  occurredAt: number
}

interface CaseEventRow {
  id: string
  case_id: string
  idempotency_key: string
  event_type: string
  actor: Actor
  provenance: Provenance
  summary: string
  evidence_refs_json: string
  from_state: CaseState | null
  to_state: CaseState
  occurred_at: number
}

export class CaseEventRepository {
  constructor(private readonly database: DatabaseSync) {}

  append(event: StoredCaseEvent): void {
    assertCaseEvidenceRefs(this.database, event.caseId, event.evidenceRefs)
    this.database
      .prepare(
        `INSERT INTO case_events
         (id, case_id, idempotency_key, event_type, actor, provenance, summary,
          evidence_refs_json, from_state, to_state, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.caseId,
        event.idempotencyKey,
        event.eventType,
        event.actor,
        event.provenance,
        event.summary,
        JSON.stringify(event.evidenceRefs),
        event.fromState,
        event.toState,
        event.occurredAt,
      )
  }

  listForCase(caseId: string): StoredCaseEvent[] {
    const rows = this.database
      .prepare(
         `SELECT id, case_id, idempotency_key, event_type, actor, provenance, summary,
                evidence_refs_json, from_state, to_state, occurred_at
         FROM case_events WHERE case_id = ? ORDER BY occurred_at, rowid`,
      )
      .all(caseId) as unknown as CaseEventRow[]
    return rows.map(mapCaseEvent)
  }
}

function mapCaseEvent(row: CaseEventRow): StoredCaseEvent {
  return {
    id: row.id,
    caseId: row.case_id,
    idempotencyKey: row.idempotency_key,
    eventType: row.event_type,
    actor: row.actor,
    provenance: row.provenance,
    summary: row.summary,
    evidenceRefs: JSON.parse(row.evidence_refs_json) as string[],
    fromState: row.from_state,
    toState: row.to_state,
    occurredAt: row.occurred_at,
  }
}
