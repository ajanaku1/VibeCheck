import type { DatabaseSync } from 'node:sqlite'

interface CommunityRow {
  community_id: string
}

export function assertObservationRefs(
  database: DatabaseSync,
  observationIds: string[],
  expectedCommunityId?: string,
): void {
  if (observationIds.length === 0) throw new Error('At least one observation reference is required')
  const statement = database.prepare('SELECT community_id FROM observations WHERE id = ?')
  for (const observationId of observationIds) {
    const row = statement.get(observationId) as CommunityRow | undefined
    if (!row) throw new Error(`Unknown observation reference: ${observationId}`)
    if (expectedCommunityId && row.community_id !== expectedCommunityId) {
      throw new Error(`Observation ${observationId} belongs to a different community`)
    }
  }
}

export function assertCaseEvidenceRefs(
  database: DatabaseSync,
  caseId: string,
  evidenceIds: string[],
): void {
  if (evidenceIds.length === 0) return
  const recoveryCase = database
    .prepare('SELECT community_id FROM recovery_cases WHERE id = ?')
    .get(caseId) as CommunityRow | undefined
  if (!recoveryCase) throw new Error(`Unknown recovery case: ${caseId}`)

  const statement = database.prepare(
    `SELECT community_id FROM observations WHERE id = ?
     UNION ALL
     SELECT community_id FROM community_context WHERE id = ?`,
  )
  for (const evidenceId of evidenceIds) {
    const row = statement.get(evidenceId, evidenceId) as CommunityRow | undefined
    if (!row) throw new Error(`Unknown evidence reference: ${evidenceId}`)
    if (row.community_id !== recoveryCase.community_id) {
      throw new Error(`Evidence ${evidenceId} belongs to a different community`)
    }
  }
}
