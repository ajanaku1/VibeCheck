import type { DatabaseSync } from 'node:sqlite'

export type DeadlineKind = 'silence' | 'cooling' | 'unresolved'

export interface ScheduledDeadline {
  id: string
  kind: DeadlineKind
  caseId: string | null
  dueAt: number
  idempotencyKey: string
}

export interface DeadlineHandlers {
  onSilenceDue(deadline: ScheduledDeadline): Promise<void>
  onCoolingExpired(deadline: ScheduledDeadline): Promise<void>
  onUnresolvedDue(deadline: ScheduledDeadline): Promise<void>
}

interface DeadlineSchedulerDependencies {
  database: DatabaseSync
  handlers: Partial<DeadlineHandlers>
  now?: () => number
}

interface DeadlineRow {
  id: string
  kind: DeadlineKind
  case_id: string | null
  due_at: number
  idempotency_key: string
}

export class DeadlineScheduler {
  private readonly now: () => number

  constructor(private readonly dependencies: DeadlineSchedulerDependencies) {
    this.now = dependencies.now ?? Date.now
  }

  schedule(deadline: ScheduledDeadline): 'inserted' | 'duplicate' {
    const result = this.dependencies.database
      .prepare(
        `INSERT INTO scheduled_deadlines
         (id, kind, case_id, due_at, idempotency_key, status)
         VALUES (?, ?, ?, ?, ?, 'pending')
         ON CONFLICT(idempotency_key) DO NOTHING`,
      )
      .run(
        deadline.id,
        deadline.kind,
        deadline.caseId,
        deadline.dueAt,
        deadline.idempotencyKey,
      )
    return Number(result.changes) === 1 ? 'inserted' : 'duplicate'
  }

  async reconcile(): Promise<{ completed: number; failed: number }> {
    const now = this.now()
    this.releaseStaleClaims(now)
    const due = this.listDue(now)
    const summary = { completed: 0, failed: 0 }
    for (const deadline of due) {
      if (!this.claim(deadline.id, now)) continue
      try {
        await this.dispatch(deadline)
        this.complete(deadline.id, now)
        summary.completed += 1
      } catch {
        this.release(deadline.id)
        summary.failed += 1
      }
    }
    return summary
  }

  private listDue(now: number): ScheduledDeadline[] {
    const rows = this.dependencies.database
      .prepare(
        `SELECT id, kind, case_id, due_at, idempotency_key
         FROM scheduled_deadlines
         WHERE status = 'pending' AND due_at <= ?
         ORDER BY due_at, rowid`,
      )
      .all(now) as unknown as DeadlineRow[]
    return rows.map(mapDeadline)
  }

  private claim(id: string, now: number): boolean {
    const result = this.dependencies.database
      .prepare(
        `UPDATE scheduled_deadlines
         SET status = 'processing', attempt_count = attempt_count + 1,
             last_attempt_at = ?, last_error_code = NULL
         WHERE id = ? AND status = 'pending'`,
      )
      .run(now, id)
    return Number(result.changes) === 1
  }

  private async dispatch(deadline: ScheduledDeadline): Promise<void> {
    const handler = handlerFor(this.dependencies.handlers, deadline.kind)
    if (!handler) throw new Error(`No handler configured for ${deadline.kind}`)
    await handler(deadline)
  }

  private complete(id: string, now: number): void {
    this.dependencies.database
      .prepare(
        `UPDATE scheduled_deadlines
         SET status = 'completed', completed_at = ?, last_error_code = NULL
         WHERE id = ? AND status = 'processing'`,
      )
      .run(now, id)
  }

  private release(id: string): void {
    this.dependencies.database
      .prepare(
        `UPDATE scheduled_deadlines
         SET status = 'pending', last_error_code = 'deadline_handler_failed'
         WHERE id = ? AND status = 'processing'`,
      )
      .run(id)
  }

  private releaseStaleClaims(now: number): void {
    this.dependencies.database
      .prepare(
        `UPDATE scheduled_deadlines
         SET status = 'pending', last_error_code = 'deadline_claim_expired'
         WHERE status = 'processing' AND last_attempt_at <= ?`,
      )
      .run(now - 60_000)
  }
}

function handlerFor(
  handlers: Partial<DeadlineHandlers>,
  kind: DeadlineKind,
): DeadlineHandlers[keyof DeadlineHandlers] | undefined {
  if (kind === 'silence') return handlers.onSilenceDue
  if (kind === 'cooling') return handlers.onCoolingExpired
  return handlers.onUnresolvedDue
}

function mapDeadline(row: DeadlineRow): ScheduledDeadline {
  return {
    id: row.id,
    kind: row.kind,
    caseId: row.case_id,
    dueAt: row.due_at,
    idempotencyKey: row.idempotency_key,
  }
}
