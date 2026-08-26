import { pathToFileURL } from 'node:url'

import { createDatabase } from '../src/server/db/database.js'
import { migrate } from '../src/server/db/migrations.js'
import { CaseEventRepository } from '../src/server/db/repositories/case-event-repository.js'
import { RecoveryCaseRepository } from '../src/server/db/repositories/recovery-case-repository.js'
import { CaseService } from '../src/server/services/case-service.js'
import {
  CANONICAL,
  canonicalFractureInput,
  seedCanonicalFoundation,
} from '../tests/fixtures/canonical-scenario.js'

export interface RehearsalResult {
  status: 'passed'
  mode: 'rehearsal'
  disclosure: string
  caseId: string
  finalState: 'resolved'
  eventTypes: string[]
  caseCount: number
}

const EVENT_IDS = [
  '70000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000002',
  '70000000-0000-4000-8000-000000000003',
  '70000000-0000-4000-8000-000000000004',
  '70000000-0000-4000-8000-000000000005',
  '70000000-0000-4000-8000-000000000006',
]

export async function runCanonicalRehearsal(databasePath = ':memory:'): Promise<RehearsalResult> {
  const database = createDatabase(databasePath)
  try {
    migrate(database)
    seedCanonicalFoundation(database)
    const service = createCaseService(database)
    await runCaseSequence(service)
    return collectResult(database)
  } finally {
    database.close()
  }
}

function createCaseService(database: ReturnType<typeof createDatabase>): CaseService {
  let eventIndex = 0
  let timestamp = CANONICAL.baseTime + 30_000
  return new CaseService({
    database,
    timingProfile: 'demo',
    idFactory: () => EVENT_IDS[eventIndex++] ?? crypto.randomUUID(),
    now: () => {
      timestamp += 1_000
      return timestamp
    },
  })
}

async function runCaseSequence(service: CaseService): Promise<void> {
  await service.openOrUpdateCase(canonicalFractureInput())
  await service.execute({ action: 'approve', caseId: CANONICAL.caseId })
  await service.execute({ action: 'sent', caseId: CANONICAL.caseId })
  await service.recordRecoveryEvidence({
    caseId: CANONICAL.caseId,
    idempotencyKey: 'rehearsal:return-only',
    affectedMemberRefId: CANONICAL.memberAlex,
    returnSignals: [returnSignal()],
    constructiveInteractions: [],
  })
  await service.recordRecoveryEvidence({
    caseId: CANONICAL.caseId,
    idempotencyKey: 'rehearsal:recovery',
    affectedMemberRefId: CANONICAL.memberAlex,
    returnSignals: [returnSignal()],
    constructiveInteractions: [{
      observationIds: [CANONICAL.constructiveSignal],
      memberRefIds: [CANONICAL.memberAlex, CANONICAL.memberSam],
      relatesToFracture: true,
    }],
  })
  await service.execute({ action: 'confirm_recovery', caseId: CANONICAL.caseId })
}

function returnSignal(): { observationId: string; memberRefId: string } {
  return {
    observationId: CANONICAL.returnSignal,
    memberRefId: CANONICAL.memberAlex,
  }
}

function collectResult(database: ReturnType<typeof createDatabase>): RehearsalResult {
  const recoveryCase = new RecoveryCaseRepository(database).findById(CANONICAL.caseId)
  if (recoveryCase?.state !== 'resolved') throw new Error('Canonical rehearsal did not resolve')
  const count = database.prepare('SELECT COUNT(*) AS count FROM recovery_cases').get() as { count: number }
  return {
    status: 'passed',
    mode: 'rehearsal',
    disclosure: 'No-network deterministic rehearsal; not evidence of live Minds behavior.',
    caseId: CANONICAL.caseId,
    finalState: recoveryCase.state,
    eventTypes: new CaseEventRepository(database)
      .listForCase(CANONICAL.caseId)
      .map(({ eventType }) => eventType),
    caseCount: count.count,
  }
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1]
  return entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href
}

if (isDirectExecution()) {
  runCanonicalRehearsal()
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown rehearsal failure'
      process.stderr.write(`Canonical rehearsal failed: ${message}\n`)
      process.exitCode = 1
    })
}
