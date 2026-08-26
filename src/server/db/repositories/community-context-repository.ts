import type { DatabaseSync } from 'node:sqlite'

import { assertObservationRefs } from './evidence-reference-policy.js'

export interface NewCommunityContext {
  id: string
  communityId: string
  kind: 'norm' | 'relationship'
  statement: string
  memberRefs: string[]
  evidenceObservationIds: string[]
  confidence: number
  status: 'active' | 'superseded'
  createdAt: number
  supersededAt: number | null
}

interface ContextRow {
  id: string
  community_id: string
  kind: 'norm' | 'relationship'
  statement: string
  member_refs_json: string
  evidence_observation_ids_json: string
  confidence: number
  status: 'active' | 'superseded'
  created_at: number
  superseded_at: number | null
}

export class CommunityContextRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(context: NewCommunityContext): void {
    assertObservationRefs(
      this.database,
      context.evidenceObservationIds,
      context.communityId,
    )
    this.database
      .prepare(
        `INSERT INTO community_context
         (id, community_id, kind, statement, member_refs_json,
          evidence_observation_ids_json, confidence, status, created_at, superseded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        context.id,
        context.communityId,
        context.kind,
        context.statement,
        JSON.stringify(context.memberRefs),
        JSON.stringify(context.evidenceObservationIds),
        context.confidence,
        context.status,
        context.createdAt,
        context.supersededAt,
      )
  }

  listActive(communityId: string): NewCommunityContext[] {
    const rows = this.database
      .prepare(
        `SELECT id, community_id, kind, statement, member_refs_json,
                evidence_observation_ids_json, confidence, status, created_at, superseded_at
         FROM community_context WHERE community_id = ? AND status = 'active'
         ORDER BY created_at`,
      )
      .all(communityId) as unknown as ContextRow[]
    return rows.map(mapContext)
  }
}

function mapContext(row: ContextRow): NewCommunityContext {
  return {
    id: row.id,
    communityId: row.community_id,
    kind: row.kind,
    statement: row.statement,
    memberRefs: JSON.parse(row.member_refs_json) as string[],
    evidenceObservationIds: JSON.parse(row.evidence_observation_ids_json) as string[],
    confidence: row.confidence,
    status: row.status,
    createdAt: row.created_at,
    supersededAt: row.superseded_at,
  }
}
