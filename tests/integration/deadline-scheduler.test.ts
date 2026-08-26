import type { DatabaseSync } from 'node:sqlite'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDatabase } from '../../src/server/db/database.js'
import { migrate } from '../../src/server/db/migrations.js'
import { CaseEventRepository } from '../../src/server/db/repositories/case-event-repository.js'
import { RecoveryCaseRepository } from '../../src/server/db/repositories/recovery-case-repository.js'
import { CaseService } from '../../src/server/services/case-service.js'
import {
  DeadlineScheduler,
  type DeadlineHandlers,
} from '../../src/server/services/deadline-scheduler.js'

const COMMUNITY_ID = '11111111-1111-4111-8111-111111111111'
const CASE_ID = '22222222-2222-4222-8222-222222222222'
const NOW = Date.parse('2026-08-17T12:00:00.000Z')

describe('DeadlineScheduler', () => {
  let database: DatabaseSync

  beforeEach(() => {
    database = createDatabase(':memory:')
    migrate(database)
    seedCase(database)
  })

  afterEach(() => database.close())

  it('fires a persisted silence deadline exactly at the boundary after restart', async () => {
    const calls: string[] = []
    const scheduler = createScheduler(database, NOW - 1, {
      onSilenceDue: async ({ id }) => {
        calls.push(id)
      },
    })
    scheduler.schedule({
      id: 'silence-deadline',
      kind: 'silence',
      caseId: null,
      dueAt: NOW,
      idempotencyKey: 'silence:fracture-key',
    })

    await expect(scheduler.reconcile()).resolves.toEqual({ completed: 0, failed: 0 })
    const restarted = createScheduler(database, NOW, {
      onSilenceDue: async ({ id }) => {
        calls.push(id)
      },
    })
    await expect(restarted.reconcile()).resolves.toEqual({ completed: 1, failed: 0 })
    await expect(restarted.reconcile()).resolves.toEqual({ completed: 0, failed: 0 })
    expect(calls).toEqual(['silence-deadline'])
  })

  it('leaves failed work pending so a restarted scheduler can retry it', async () => {
    let attempts = 0
    const deadline = {
      id: 'retry-deadline',
      kind: 'silence' as const,
      caseId: null,
      dueAt: NOW,
      idempotencyKey: 'silence:retry',
    }
    const failing = createScheduler(database, NOW, {
      onSilenceDue: async () => {
        attempts += 1
        throw new Error('temporary failure')
      },
    })
    failing.schedule(deadline)

    await expect(failing.reconcile()).resolves.toEqual({ completed: 0, failed: 1 })
    const restarted = createScheduler(database, NOW, {
      onSilenceDue: async () => {
        attempts += 1
      },
    })
    await expect(restarted.reconcile()).resolves.toEqual({ completed: 1, failed: 0 })
    expect(attempts).toBe(2)
  })

  it('persists Sent unresolved work and expires the case once at its exact deadline', async () => {
    finalizeIntervention(database)
    const cases = createCaseService(database)
    await cases.execute({ action: 'sent', caseId: CASE_ID })

    const scheduler = createScheduler(database, NOW + 600_000, {
      onUnresolvedDue: async (deadline) => {
        await cases.expireCase(deadline.caseId!, deadline.idempotencyKey)
      },
    })
    await expect(scheduler.reconcile()).resolves.toEqual({ completed: 1, failed: 0 })
    await expect(scheduler.reconcile()).resolves.toEqual({ completed: 0, failed: 0 })

    expect(new RecoveryCaseRepository(database).findById(CASE_ID)).toMatchObject({
      state: 'unresolved',
      outcomeSummary: 'Recovery window expired without creator-confirmed recovery.',
    })
    expect(new CaseEventRepository(database).listForCase(CASE_ID).map(({ actor, eventType }) => ({ actor, eventType }))).toEqual([
      { actor: 'creator', eventType: 'outreach_sent_confirmed' },
      { actor: 'system', eventType: 'case_expired' },
    ])
  })

  it('persists dismissal cooling work and emits it only once at the boundary', async () => {
    const cases = createCaseService(database)
    await cases.execute({ action: 'dismiss', caseId: CASE_ID })
    const calls: string[] = []
    const scheduler = createScheduler(database, NOW + 180_000, {
      onCoolingExpired: async ({ caseId }) => {
        calls.push(caseId!)
      },
    })

    await expect(scheduler.reconcile()).resolves.toEqual({ completed: 1, failed: 0 })
    await expect(scheduler.reconcile()).resolves.toEqual({ completed: 0, failed: 0 })
    expect(calls).toEqual([CASE_ID])
    expect(new RecoveryCaseRepository(database).findById(CASE_ID)?.state).toBe('dismissed')
  })

  it('completes a stale unresolved deadline without changing an already resolved case', async () => {
    finalizeIntervention(database)
    const cases = createCaseService(database)
    await cases.execute({ action: 'sent', caseId: CASE_ID })
    database.prepare("UPDATE recovery_cases SET state = 'resolved' WHERE id = ?").run(CASE_ID)
    const scheduler = createScheduler(database, NOW + 600_000, {
      onUnresolvedDue: async (deadline) => {
        await cases.expireCase(deadline.caseId!, deadline.idempotencyKey)
      },
    })

    await expect(scheduler.reconcile()).resolves.toEqual({ completed: 1, failed: 0 })
    expect(new RecoveryCaseRepository(database).findById(CASE_ID)?.state).toBe('resolved')
  })
})

function createScheduler(
  database: DatabaseSync,
  now: number,
  handlers: Partial<DeadlineHandlers>,
): DeadlineScheduler {
  return new DeadlineScheduler({ database, now: () => now, handlers })
}

function createCaseService(database: DatabaseSync): CaseService {
  return new CaseService({
    database,
    timingProfile: 'demo',
    now: () => NOW,
    idFactory: () => crypto.randomUUID(),
  })
}

function seedCase(database: DatabaseSync): void {
  database
    .prepare(
      `INSERT INTO communities
       (id, telegram_chat_ref, display_name, minds_source_alias, observation_status, timing_profile)
       VALUES (?, 'group-ref', 'Staged Creators', 'vibecheck-community-source', 'observing', 'demo')`,
    )
    .run(COMMUNITY_ID)
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
      `INSERT INTO intervention_plans (id, case_id, suggested_text)
       VALUES ('33333333-3333-4333-8333-333333333333', ?, 'Suggested outreach.')`,
    )
    .run(CASE_ID)
}

function finalizeIntervention(database: DatabaseSync): void {
  database
    .prepare(
      `UPDATE intervention_plans
       SET final_text = suggested_text, finalized_by = 'approve', finalized_at = ?
       WHERE case_id = ?`,
    )
    .run(NOW - 1, CASE_ID)
}
