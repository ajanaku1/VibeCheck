import type { DatabaseSync } from 'node:sqlite'

export interface StoredIngestionCursor {
  alias: string
  lastFingerprint: string
  updatedAt: number
}

interface CursorRow {
  alias: string
  last_fingerprint: string
  updated_at: number
}

export class IngestionCursorRepository {
  constructor(private readonly database: DatabaseSync) {}

  findByAlias(alias: string): StoredIngestionCursor | null {
    const row = this.database
      .prepare(
        `SELECT alias, last_fingerprint, updated_at
         FROM ingestion_cursors WHERE alias = ?`,
      )
      .get(alias) as CursorRow | undefined
    if (!row) return null
    return {
      alias: row.alias,
      lastFingerprint: row.last_fingerprint,
      updatedAt: row.updated_at,
    }
  }
}
