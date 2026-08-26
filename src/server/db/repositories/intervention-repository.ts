import type { DatabaseSync } from 'node:sqlite'

export interface NewIntervention {
  id: string
  caseId: string
  suggestedText: string
}

export interface StoredIntervention extends NewIntervention {
  finalText: string | null
  finalizedBy: 'approve' | 'edit' | null
  finalizedAt: number | null
  sentConfirmedAt: number | null
}

interface InterventionRow {
  id: string
  case_id: string
  suggested_text: string
  final_text: string | null
  finalized_by: 'approve' | 'edit' | null
  finalized_at: number | null
  sent_confirmed_at: number | null
}

export class InterventionRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(intervention: NewIntervention): void {
    this.database
      .prepare(
        `INSERT INTO intervention_plans (id, case_id, suggested_text)
         VALUES (?, ?, ?)`,
      )
      .run(intervention.id, intervention.caseId, intervention.suggestedText)
  }

  finalize(
    caseId: string,
    finalizedBy: 'approve' | 'edit',
    finalText: string,
    finalizedAt: number,
  ): void {
    this.database
      .prepare(
        `UPDATE intervention_plans
         SET final_text = ?, finalized_by = ?, finalized_at = ?
         WHERE case_id = ?`,
      )
      .run(finalText, finalizedBy, finalizedAt, caseId)
  }

  confirmSent(caseId: string, sentConfirmedAt: number): void {
    const result = this.database
      .prepare(
        `UPDATE intervention_plans
         SET sent_confirmed_at = ?
         WHERE case_id = ? AND final_text IS NOT NULL`,
      )
      .run(sentConfirmedAt, caseId)
    if (Number(result.changes) !== 1) {
      throw new Error('Finalize outreach before confirming Sent')
    }
  }

  findByCaseId(caseId: string): StoredIntervention | null {
    const row = this.database
      .prepare(
        `SELECT id, case_id, suggested_text, final_text, finalized_by,
                finalized_at, sent_confirmed_at
         FROM intervention_plans WHERE case_id = ?`,
      )
      .get(caseId) as InterventionRow | undefined
    return row ? mapIntervention(row) : null
  }
}

function mapIntervention(row: InterventionRow): StoredIntervention {
  return {
    id: row.id,
    caseId: row.case_id,
    suggestedText: row.suggested_text,
    finalText: row.final_text,
    finalizedBy: row.finalized_by,
    finalizedAt: row.finalized_at,
    sentConfirmedAt: row.sent_confirmed_at,
  }
}
