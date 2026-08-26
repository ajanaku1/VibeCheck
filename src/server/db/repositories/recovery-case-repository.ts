import type { DatabaseSync } from 'node:sqlite'

import type { CaseState } from '../../../domain/case-state.js'

export interface StoredRecoveryCase {
  id: string
  communityId: string
  fractureKey: string
  trigger: 'escalating_conflict' | 'post_conflict_silence'
  state: CaseState
  confidence: number
  uncertainty: string
  openedAt: number
  updatedAt: number
  monitoringStartedAt: number | null
  resolutionDueAt: number | null
  dismissedUntil: number | null
  outcomeSummary: string | null
  version: number
}

interface RecoveryCaseRow {
  id: string
  community_id: string
  fracture_key: string
  trigger: StoredRecoveryCase['trigger']
  state: CaseState
  confidence: number
  uncertainty: string
  opened_at: number
  updated_at: number
  monitoring_started_at: number | null
  resolution_due_at: number | null
  dismissed_until: number | null
  outcome_summary: string | null
  version: number
}

export class RecoveryCaseRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(recoveryCase: StoredRecoveryCase): void {
    if (recoveryCase.state !== 'needs_review') {
      throw new Error('A recovery case must be created in needs_review')
    }
    this.database
      .prepare(
        `INSERT INTO recovery_cases
         (id, community_id, fracture_key, trigger, state, confidence, uncertainty,
          opened_at, updated_at, monitoring_started_at, resolution_due_at,
          dismissed_until, outcome_summary, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        recoveryCase.id,
        recoveryCase.communityId,
        recoveryCase.fractureKey,
        recoveryCase.trigger,
        recoveryCase.state,
        recoveryCase.confidence,
        recoveryCase.uncertainty,
        recoveryCase.openedAt,
        recoveryCase.updatedAt,
        recoveryCase.monitoringStartedAt,
        recoveryCase.resolutionDueAt,
        recoveryCase.dismissedUntil,
        recoveryCase.outcomeSummary,
        recoveryCase.version,
      )
  }

  findById(id: string): StoredRecoveryCase | null {
    const row = this.database
      .prepare(
        `SELECT id, community_id, fracture_key, trigger, state, confidence, uncertainty,
                opened_at, updated_at, monitoring_started_at, resolution_due_at,
                dismissed_until, outcome_summary, version
         FROM recovery_cases WHERE id = ?`,
      )
      .get(id) as RecoveryCaseRow | undefined
    return row ? mapRecoveryCase(row) : null
  }

  findActiveByFracture(communityId: string, fractureKey: string): StoredRecoveryCase | null {
    const row = this.database
      .prepare(
        `SELECT id, community_id, fracture_key, trigger, state, confidence, uncertainty,
                opened_at, updated_at, monitoring_started_at, resolution_due_at,
                dismissed_until, outcome_summary, version
         FROM recovery_cases
         WHERE community_id = ? AND fracture_key = ?
           AND state IN ('needs_review', 'monitoring', 'recovery_detected')`,
      )
      .get(communityId, fractureKey) as RecoveryCaseRow | undefined
    return row ? mapRecoveryCase(row) : null
  }
}

function mapRecoveryCase(row: RecoveryCaseRow): StoredRecoveryCase {
  return {
    id: row.id,
    communityId: row.community_id,
    fractureKey: row.fracture_key,
    trigger: row.trigger,
    state: row.state,
    confidence: row.confidence,
    uncertainty: row.uncertainty,
    openedAt: row.opened_at,
    updatedAt: row.updated_at,
    monitoringStartedAt: row.monitoring_started_at,
    resolutionDueAt: row.resolution_due_at,
    dismissedUntil: row.dismissed_until,
    outcomeSummary: row.outcome_summary,
    version: row.version,
  }
}
