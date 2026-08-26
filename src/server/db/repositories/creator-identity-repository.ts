import type { DatabaseSync } from 'node:sqlite'

export interface StoredCreatorIdentity {
  telegramUserId: string
  displayName: string
  username: string | null
  photoUrl: string | null
  lastAuthenticatedAt: number
}

export class CreatorIdentityRepository {
  constructor(private readonly database: DatabaseSync) {}

  upsert(identity: StoredCreatorIdentity): void {
    this.database
      .prepare(
        `INSERT INTO creator_identities
         (telegram_user_id, display_name, username, photo_url, last_authenticated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(telegram_user_id) DO UPDATE SET
           display_name = excluded.display_name,
           username = excluded.username,
           photo_url = excluded.photo_url,
           last_authenticated_at = excluded.last_authenticated_at`,
      )
      .run(
        identity.telegramUserId,
        identity.displayName,
        identity.username,
        identity.photoUrl,
        identity.lastAuthenticatedAt,
      )
  }

  findById(telegramUserId: string): StoredCreatorIdentity | null {
    const row = this.database
      .prepare(
        `SELECT telegram_user_id, display_name, username, photo_url, last_authenticated_at
         FROM creator_identities WHERE telegram_user_id = ?`,
      )
      .get(telegramUserId) as
      | {
          telegram_user_id: string
          display_name: string
          username: string | null
          photo_url: string | null
          last_authenticated_at: number
        }
      | undefined
    return row
      ? {
          telegramUserId: row.telegram_user_id,
          displayName: row.display_name,
          username: row.username,
          photoUrl: row.photo_url,
          lastAuthenticatedAt: row.last_authenticated_at,
        }
      : null
  }
}
