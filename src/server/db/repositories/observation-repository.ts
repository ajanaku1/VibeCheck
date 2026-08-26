import type { DatabaseSync } from 'node:sqlite'

import { transaction } from '../database.js'
import type { StoredIngestionCursor } from './ingestion-cursor-repository.js'

export interface NewObservation {
  id: string
  communityId: string
  source:
    | 'telegram_webhook_group'
    | 'telegram_webhook_creator'
    | 'minds_telegram_group'
    | 'minds_creator_chat'
    | 'scheduler'
  sourceFingerprint: string | null
  sessionRef: string
  memberRefId: string | null
  occurredAt: number
  ingestedAt: number
  evidenceExcerpt: string
  contentDigest: string
  visibility: 'internal' | 'case_evidence'
}

export interface HumanMemberActivity {
  id: string
  communityId: string
  externalRefHash: string
  displayLabel: string
  activeAt: number
}

export type StoredObservation = NewObservation

export type ObservationWorkKind = 'community' | 'creator'

interface ObservationRow {
  id: string
  community_id: string
  source: NewObservation['source']
  source_fingerprint: string | null
  session_ref: string
  member_ref_id: string | null
  occurred_at: number
  ingested_at: number
  evidence_excerpt: string
  content_digest: string
  visibility: NewObservation['visibility']
}

export class ObservationRepository {
  constructor(private readonly database: DatabaseSync) {}

  appendWithCursor(
    observation: NewObservation,
    cursor: StoredIngestionCursor,
  ): 'inserted' | 'duplicate' {
    return transaction(this.database, () => {
      if (this.hasFingerprint(observation.sourceFingerprint)) return 'duplicate'
      this.insert(observation)
      this.advanceCursor(cursor)
      return 'inserted'
    })
  }

  appendHumanWithCursor(
    observation: Omit<NewObservation, 'memberRefId'>,
    cursor: StoredIngestionCursor,
    member: HumanMemberActivity,
  ): 'inserted' | 'duplicate' {
    return transaction(this.database, () => {
      if (this.hasFingerprint(observation.sourceFingerprint)) return 'duplicate'
      const memberRefId = this.upsertMember(member)
      this.insert({ ...observation, memberRefId })
      this.advanceCursor(cursor)
      return 'inserted'
    })
  }

  appendWithWork(
    observation: NewObservation,
    workKind: ObservationWorkKind,
  ): 'inserted' | 'duplicate' {
    return transaction(this.database, () => {
      if (this.hasFingerprint(observation.sourceFingerprint)) return 'duplicate'
      this.insert(observation)
      this.enqueueWork(observation.id, workKind, observation.ingestedAt)
      return 'inserted'
    })
  }

  appendHumanWithWork(
    observation: Omit<NewObservation, 'memberRefId'>,
    member: HumanMemberActivity,
    workKind: ObservationWorkKind,
  ): 'inserted' | 'duplicate' {
    return transaction(this.database, () => {
      if (this.hasFingerprint(observation.sourceFingerprint)) return 'duplicate'
      const memberRefId = this.upsertMember(member)
      this.insert({ ...observation, memberRefId })
      this.enqueueWork(observation.id, workKind, observation.ingestedAt)
      return 'inserted'
    })
  }

  listRecentCommunityEvidence(communityId: string, limit: number): StoredObservation[] {
    const rows = this.database
      .prepare(
        `SELECT id, community_id, source, source_fingerprint, session_ref, member_ref_id,
                occurred_at, ingested_at, evidence_excerpt, content_digest, visibility
         FROM observations
         WHERE community_id = ?
           AND source IN ('telegram_webhook_group', 'minds_telegram_group')
           AND member_ref_id IS NOT NULL
         ORDER BY occurred_at DESC, id DESC
         LIMIT ?`,
      )
      .all(communityId, limit) as unknown as ObservationRow[]
    return rows.reverse().map(mapObservation)
  }

  findById(id: string): StoredObservation | null {
    const row = this.database
      .prepare(
        `SELECT id, community_id, source, source_fingerprint, session_ref, member_ref_id,
                occurred_at, ingested_at, evidence_excerpt, content_digest, visibility
         FROM observations WHERE id = ?`,
      )
      .get(id) as ObservationRow | undefined
    return row ? mapObservation(row) : null
  }

  private hasFingerprint(fingerprint: string | null): boolean {
    if (!fingerprint) return false
    const row = this.database
      .prepare('SELECT 1 AS found FROM observations WHERE source_fingerprint = ?')
      .get(fingerprint)
    return row !== undefined
  }

  private insert(observation: NewObservation): void {
    this.database
      .prepare(
        `INSERT INTO observations
         (id, community_id, source, source_fingerprint, session_ref, member_ref_id,
          occurred_at, ingested_at, evidence_excerpt, content_digest, visibility)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        observation.id,
        observation.communityId,
        observation.source,
        observation.sourceFingerprint,
        observation.sessionRef,
        observation.memberRefId,
        observation.occurredAt,
        observation.ingestedAt,
        observation.evidenceExcerpt,
        observation.contentDigest,
        observation.visibility,
      )
  }

  private upsertMember(member: HumanMemberActivity): string {
    const row = this.database
      .prepare(
        `INSERT INTO member_references
         (id, community_id, external_ref_hash, display_label, first_seen_at, last_active_at,
          activity_count)
         VALUES (?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(community_id, external_ref_hash) DO UPDATE SET
           display_label = excluded.display_label,
           last_active_at = MAX(member_references.last_active_at, excluded.last_active_at),
           activity_count = member_references.activity_count + 1
         RETURNING id`,
      )
      .get(
        member.id,
        member.communityId,
        member.externalRefHash,
        member.displayLabel,
        member.activeAt,
        member.activeAt,
      ) as { id: string }
    return row.id
  }

  private advanceCursor(cursor: StoredIngestionCursor): void {
    this.database
      .prepare(
        `INSERT INTO ingestion_cursors (alias, last_fingerprint, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(alias) DO UPDATE SET
           last_fingerprint = excluded.last_fingerprint,
           updated_at = excluded.updated_at`,
      )
      .run(cursor.alias, cursor.lastFingerprint, cursor.updatedAt)
  }

  private enqueueWork(observationId: string, kind: ObservationWorkKind, availableAt: number): void {
    this.database
      .prepare(
        `INSERT INTO observation_jobs
         (observation_id, kind, status, attempt_count, available_at)
         VALUES (?, ?, 'pending', 0, ?)`,
      )
      .run(observationId, kind, availableAt)
  }
}

function mapObservation(row: ObservationRow): StoredObservation {
  return {
    id: row.id,
    communityId: row.community_id,
    source: row.source,
    sourceFingerprint: row.source_fingerprint,
    sessionRef: row.session_ref,
    memberRefId: row.member_ref_id,
    occurredAt: row.occurred_at,
    ingestedAt: row.ingested_at,
    evidenceExcerpt: row.evidence_excerpt,
    contentDigest: row.content_digest,
    visibility: row.visibility,
  }
}
