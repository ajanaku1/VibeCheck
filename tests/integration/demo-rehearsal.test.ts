import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { describe, expect, it } from 'vitest'

interface RehearsalResult {
  status: string
  mode: string
  caseId: string
  finalState: string
  eventTypes: string[]
  caseCount: number
}

interface LiveDemoResult {
  status: string
  mode: string
  caseId: string
  finalState: string
  sessionCount: number
  reasoningKinds: string[]
  notificationKinds: string[]
}

describe('canonical demo rehearsal', () => {
  it('rehearses one disclosed case through creator-confirmed recovery', async () => {
    const modulePath = '../../scripts/rehearse-demo.js'
    const { runCanonicalRehearsal } = await import(modulePath) as {
      runCanonicalRehearsal(): Promise<RehearsalResult>
    }

    await expect(runCanonicalRehearsal()).resolves.toMatchObject({
      status: 'passed',
      mode: 'rehearsal',
      finalState: 'resolved',
      caseCount: 1,
      eventTypes: [
        'case_opened',
        'draft_approved',
        'outreach_sent_confirmed',
        'evidence_appended',
        'recovery_detected',
        'recovery_confirmed',
      ],
    })
  })

  it('seeds a disclosed dashboard database without external calls', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vibecheck-seed-'))
    const databasePath = join(directory, 'demo.sqlite')
    try {
      const modulePath = '../../scripts/seed-demo.js'
      const { seedCanonicalDatabase } = await import(modulePath) as {
        seedCanonicalDatabase(path: string): Promise<RehearsalResult>
      }

      await expect(seedCanonicalDatabase(databasePath)).resolves.toMatchObject({
        status: 'passed',
        mode: 'rehearsal',
        finalState: 'resolved',
        caseCount: 1,
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('accepts a completed three-session live evidence record', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vibecheck-live-'))
    const databasePath = join(directory, 'live.sqlite')
    try {
      const seedModulePath = '../../scripts/seed-demo.js'
      const { seedCanonicalDatabase } = await import(seedModulePath) as {
        seedCanonicalDatabase(path: string): Promise<RehearsalResult>
      }
      await seedCanonicalDatabase(databasePath)
      promoteRehearsalToLiveEvidence(databasePath)

      const verifierModulePath = '../../scripts/verify-live-demo.js'
      const { verifyLiveDemoDatabase } = await import(verifierModulePath) as {
        verifyLiveDemoDatabase(path: string, creatorId: string): LiveDemoResult
      }
      expect(verifyLiveDemoDatabase(databasePath, '42')).toMatchObject({
        status: 'passed',
        mode: 'live',
        finalState: 'resolved',
        sessionCount: 3,
        reasoningKinds: ['baseline', 'fracture', 'recovery'],
        notificationKinds: ['initial_alert', 'recovery_confirmation'],
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

function promoteRehearsalToLiveEvidence(databasePath: string): void {
  const database = new DatabaseSync(databasePath)
  try {
    database.prepare(
      "UPDATE observations SET source_fingerprint = 'telegram:' || id, session_ref = 'telegram:-1000000000001'",
    ).run()
    insertCreatorObservation(database, '91000000-0000-4000-8000-000000000001', 'Approve')
    insertCreatorObservation(database, '91000000-0000-4000-8000-000000000002', 'Sent')
    insertCreatorObservation(database, '91000000-0000-4000-8000-000000000003', 'Confirm recovery')
    insertReasoningRun(database, '80000000-0000-4000-8000-000000000001', 'baseline')
    insertReasoningRun(database, '80000000-0000-4000-8000-000000000002', 'fracture')
    insertReasoningRun(database, '80000000-0000-4000-8000-000000000003', 'recovery')
    insertNotification(database, '90000000-0000-4000-8000-000000000001', 'case_opened', 'initial_alert')
    insertNotification(database, '90000000-0000-4000-8000-000000000002', 'recovery_detected', 'recovery_confirmation')
  } finally {
    database.close()
  }
}

function insertCreatorObservation(database: DatabaseSync, id: string, excerpt: string): void {
  database.prepare(
    `INSERT INTO observations
     (id, community_id, source, source_fingerprint, session_ref, member_ref_id,
      occurred_at, ingested_at, evidence_excerpt, content_digest, visibility)
     VALUES (?, '10000000-0000-4000-8000-000000000001', 'telegram_webhook_creator', ?,
             'telegram:42', NULL, 3, 3, ?, ?, 'internal')`,
  ).run(id, `telegram:${id}`, excerpt, `digest:${id}`)
}

function insertReasoningRun(
  database: DatabaseSync,
  id: string,
  kind: 'baseline' | 'fracture' | 'recovery',
): void {
  database.prepare(
    `INSERT INTO reasoning_runs
     (id, input_digest, analysis_kind, engine_alias, input_observation_ids_json,
      status, response_json, error_code, started_at, completed_at)
     VALUES (?, ?, ?, 'vibecheck-engine', '[]', 'succeeded', '{}', NULL, 1, 2)`,
  ).run(id, `digest:${kind}`, kind)
}

function insertNotification(
  database: DatabaseSync,
  id: string,
  eventType: string,
  kind: 'initial_alert' | 'recovery_confirmation',
): void {
  const event = database.prepare(
    'SELECT id FROM case_events WHERE event_type = ?',
  ).get(eventType) as { id: string }
  database.prepare(
    `INSERT INTO notification_deliveries
     (id, case_event_id, kind, recipient_telegram_id, payload_digest, payload_text,
      status, attempt_count, telegram_message_id, last_attempt_at, last_error_code)
     VALUES (?, ?, ?, '42', ?, 'Private creator message', 'sent', 1, ?, 2, NULL)`,
  ).run(id, event.id, kind, `payload:${kind}`, `telegram:${kind}`)
}
