import type { DatabaseSync } from 'node:sqlite'

import { transaction } from '../database.js'
import type { ObservationWorkKind } from './observation-repository.js'

export interface ClaimedObservationWork {
  observationId: string
  kind: ObservationWorkKind
  attemptCount: number
}

interface ObservationWorkRow {
  observation_id: string
  kind: ObservationWorkKind
  attempt_count: number
}

export class ObservationWorkRepository {
  constructor(private readonly database: DatabaseSync) {}

  claimNext(now: number, staleAfterMs = 300_000): ClaimedObservationWork | null {
    return transaction(this.database, () => {
      this.database
        .prepare(
          `UPDATE observation_jobs
           SET status = 'pending', claimed_at = NULL
           WHERE status = 'processing' AND claimed_at <= ?`,
        )
        .run(now - staleAfterMs)
      const row = this.database
        .prepare(
          `UPDATE observation_jobs
           SET status = 'processing', attempt_count = attempt_count + 1, claimed_at = ?
           WHERE observation_id = (
             SELECT observation_id FROM observation_jobs
             WHERE status = 'pending' AND available_at <= ?
             ORDER BY available_at, observation_id LIMIT 1
           )
           RETURNING observation_id, kind, attempt_count`,
        )
        .get(now, now) as ObservationWorkRow | undefined
      return row ? mapWork(row) : null
    })
  }

  complete(observationId: string, completedAt: number): void {
    this.database
      .prepare(
        `UPDATE observation_jobs
         SET status = 'completed', completed_at = ?, claimed_at = NULL, last_error_code = NULL
         WHERE observation_id = ? AND status = 'processing'`,
      )
      .run(completedAt, observationId)
  }

  retry(observationId: string, availableAt: number, errorCode: string): void {
    this.database
      .prepare(
        `UPDATE observation_jobs
         SET status = 'pending', available_at = ?, claimed_at = NULL, last_error_code = ?
         WHERE observation_id = ? AND status = 'processing'`,
      )
      .run(availableAt, errorCode, observationId)
  }
}

function mapWork(row: ObservationWorkRow): ClaimedObservationWork {
  return {
    observationId: row.observation_id,
    kind: row.kind,
    attemptCount: row.attempt_count,
  }
}
