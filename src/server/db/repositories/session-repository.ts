import type { DatabaseSync } from 'node:sqlite'

export interface NewSession {
  id: string
  tokenHash: string
  telegramUserId: string
  createdAt: number
  expiresAt: number
}

export interface StoredSession extends NewSession {
  revokedAt: number | null
}

interface SessionRow {
  id: string
  token_hash: string
  telegram_user_id: string
  created_at: number
  expires_at: number
  revoked_at: number | null
}

export class SessionRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(session: NewSession): void {
    this.database
      .prepare(
        `INSERT INTO auth_sessions
         (id, token_hash, telegram_user_id, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        session.id,
        session.tokenHash,
        session.telegramUserId,
        session.createdAt,
        session.expiresAt,
      )
  }

  findActive(tokenHash: string, authorizedUserId: string, now: number): StoredSession | null {
    const row = this.database
      .prepare(
        `SELECT id, token_hash, telegram_user_id, created_at, expires_at, revoked_at
         FROM auth_sessions
         WHERE token_hash = ? AND telegram_user_id = ?
           AND revoked_at IS NULL AND expires_at > ?`,
      )
      .get(tokenHash, authorizedUserId, now) as SessionRow | undefined
    return row ? mapSession(row) : null
  }

  revoke(tokenHash: string, revokedAt: number): void {
    this.database
      .prepare(
        `UPDATE auth_sessions SET revoked_at = ?
         WHERE token_hash = ? AND revoked_at IS NULL`,
      )
      .run(revokedAt, tokenHash)
  }
}

function mapSession(row: SessionRow): StoredSession {
  return {
    id: row.id,
    tokenHash: row.token_hash,
    telegramUserId: row.telegram_user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  }
}
