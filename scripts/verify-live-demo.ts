import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'

import type { CaseState } from '../src/domain/case-state.js'
import { loadConfig } from '../src/server/config.js'

const EXPECTED_EVENTS = [
  'case_opened',
  'draft_approved',
  'outreach_sent_confirmed',
  'evidence_appended',
  'recovery_detected',
  'recovery_confirmed',
]
const EXPECTED_REASONING = ['baseline', 'fracture', 'recovery']
const EXPECTED_NOTIFICATIONS = ['initial_alert', 'recovery_confirmation']
const EXPECTED_CONTEXT = ['norm', 'relationship']

export interface LiveDemoVerification {
  status: 'passed'
  mode: 'live'
  caseId: string
  finalState: 'resolved'
  sessionCount: number
  reasoningKinds: string[]
  notificationKinds: string[]
  eventTypes: string[]
  contextKinds: string[]
}

interface CaseRow {
  id: string
  state: CaseState
}

interface LiveEvidenceSnapshot {
  reasoningKinds: string[]
  notificationKinds: string[]
  eventTypes: string[]
  contextKinds: string[]
}

export function verifyLiveDemoDatabase(
  databasePath: string,
  authorizedCreatorId: string,
): LiveDemoVerification {
  if (!existsSync(databasePath)) throw new Error(`Live database does not exist: ${databasePath}`)
  const database = new DatabaseSync(databasePath, { readOnly: true })
  try {
    const recoveryCase = requireResolvedCase(database)
    const evidence = readLiveEvidence(database, recoveryCase.id, authorizedCreatorId)
    assertLiveObservations(database)
    assertCanonicalEvidence(evidence)
    return {
      status: 'passed',
      mode: 'live',
      caseId: recoveryCase.id,
      finalState: 'resolved',
      sessionCount: evidence.reasoningKinds.length,
      ...evidence,
    }
  } finally {
    database.close()
  }
}

function readLiveEvidence(
  database: DatabaseSync,
  caseId: string,
  creatorId: string,
): LiveEvidenceSnapshot {
  return {
    reasoningKinds: stringColumn(
      database,
      "SELECT DISTINCT analysis_kind AS value FROM reasoning_runs WHERE status = 'succeeded' ORDER BY started_at",
    ),
    notificationKinds: stringColumn(
      database,
      "SELECT DISTINCT kind AS value FROM notification_deliveries WHERE status = 'sent' AND recipient_telegram_id = ? ORDER BY rowid",
      creatorId,
    ),
    eventTypes: stringColumn(
      database,
      'SELECT event_type AS value FROM case_events WHERE case_id = ? ORDER BY occurred_at, rowid',
      caseId,
    ),
    contextKinds: stringColumn(
      database,
      "SELECT DISTINCT kind AS value FROM community_context WHERE status = 'active' ORDER BY CASE kind WHEN 'norm' THEN 0 ELSE 1 END",
    ),
  }
}

function requireResolvedCase(database: DatabaseSync): CaseRow & { state: 'resolved' } {
  const rows = database.prepare('SELECT id, state FROM recovery_cases ORDER BY opened_at').all() as unknown as CaseRow[]
  if (rows.length !== 1 || rows[0]?.state !== 'resolved') {
    throw new Error('Live demo must contain exactly one creator-confirmed resolved case')
  }
  return rows[0] as CaseRow & { state: 'resolved' }
}

function assertLiveObservations(database: DatabaseSync): void {
  const rehearsal = database
    .prepare("SELECT 1 FROM observations WHERE source_fingerprint LIKE 'rehearsal:%' LIMIT 1")
    .get()
  if (rehearsal) throw new Error('Rehearsal observations cannot satisfy the live demo gate')
  const nonTelegram = database
    .prepare(
      "SELECT 1 FROM observations WHERE source NOT IN ('telegram_webhook_group', 'telegram_webhook_creator') LIMIT 1",
    )
    .get()
  if (nonTelegram) throw new Error('Live demo observations must come from the app-owned Telegram webhook')
  requireObservationCount(database, 'telegram_webhook_group', 7)
  requireObservationCount(database, 'telegram_webhook_creator', 3)
}

function requireObservationCount(database: DatabaseSync, source: string, minimum: number): void {
  const row = database
    .prepare('SELECT COUNT(*) AS count FROM observations WHERE source = ?')
    .get(source) as { count: number }
  if (row.count < minimum) throw new Error(`Live demo needs at least ${minimum} ${source} observations`)
}

function assertCanonicalEvidence(evidence: LiveEvidenceSnapshot): void {
  assertExact('reasoning kinds', evidence.reasoningKinds, EXPECTED_REASONING)
  assertExact('creator notifications', evidence.notificationKinds, EXPECTED_NOTIFICATIONS)
  assertExact('case events', evidence.eventTypes, EXPECTED_EVENTS)
  assertExact('remembered context', evidence.contextKinds, EXPECTED_CONTEXT)
}

function stringColumn(
  database: DatabaseSync,
  sql: string,
  ...parameters: string[]
): string[] {
  const rows = database.prepare(sql).all(...parameters) as unknown as Array<{ value: string }>
  return rows.map(({ value }) => value)
}

function assertExact(label: string, actual: string[], expected: string[]): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} did not match the canonical live sequence`)
  }
}

function main(): void {
  const config = loadConfig(process.env)
  const result = verifyLiveDemoDatabase(config.databasePath, config.authorizedTelegramUserId)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1]
  return entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href
}

if (isDirectExecution()) {
  try {
    main()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown live demo verification failure'
    process.stderr.write(`Live demo verification failed: ${message}\n`)
    process.exitCode = 1
  }
}
