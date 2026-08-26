import type { DatabaseSync } from 'node:sqlite'

import { beforeEach, describe, expect, it } from 'vitest'

import { createDatabase } from '../../src/server/db/database.js'
import { migrate } from '../../src/server/db/migrations.js'
import { SessionService } from '../../src/server/auth/session-service.js'

const NOW = Date.parse('2026-08-17T12:00:00.000Z')
const EIGHT_HOURS = 8 * 60 * 60 * 1_000

let database: DatabaseSync

beforeEach(() => {
  database = createDatabase(':memory:')
  migrate(database)
})

describe('creator session lifecycle', () => {
  it('creates an opaque eight-hour session and stores only its SHA-256 token hash', () => {
    const service = createService()

    const created = service.create({
      telegramUserId: '42',
      displayName: 'Ada Lovelace',
      username: 'ada',
      photoUrl: null,
    })
    const row = database
      .prepare('SELECT token_hash, telegram_user_id, created_at, expires_at FROM auth_sessions')
      .get() as Record<string, unknown>

    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(row.token_hash).not.toBe(created.token)
    expect(row).toMatchObject({
      telegram_user_id: '42',
      created_at: NOW,
      expires_at: NOW + EIGHT_HOURS,
    })
    expect(created.session.expiresAt).toBe(new Date(NOW + EIGHT_HOURS).toISOString())
  })

  it('looks up an active session, rejects it at the exact expiry boundary, and honors revocation', () => {
    let now = NOW
    const service = createService(() => now)
    const created = service.create(identity())

    expect(service.find(created.token)).toMatchObject({
      creator: { telegramUserId: '42', displayName: 'Ada' },
    })
    now = NOW + EIGHT_HOURS
    expect(service.find(created.token)).toBeNull()

    now = NOW
    service.revoke(created.token)
    expect(service.find(created.token)).toBeNull()
  })

  it('invalidates existing sessions when the configured creator ID changes', () => {
    const created = createService().create(identity())
    const reconfigured = new SessionService({
      database,
      authorizedTelegramUserId: '43',
      nodeEnv: 'production',
      now: () => NOW,
    })

    expect(reconfigured.find(created.token)).toBeNull()
  })

  it('rejects session creation for an identity other than the configured creator', () => {
    expect(() =>
      createService().create({ ...identity(), telegramUserId: '43' }),
    ).toThrow(/configured creator/)
    expect(database.prepare('SELECT id FROM auth_sessions').get()).toBeUndefined()
  })

  it('returns an HttpOnly SameSite cookie policy with Secure required in production', () => {
    expect(createService().cookie).toEqual({
      name: 'vibecheck_session',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        path: '/',
        maxAge: 28_800,
      },
    })
    const development = new SessionService({
      database,
      authorizedTelegramUserId: '42',
      nodeEnv: 'development',
      now: () => NOW,
    })
    expect(development.cookie.options.secure).toBe(false)
  })
})

function createService(now: () => number = () => NOW): SessionService {
  return new SessionService({
    database,
    authorizedTelegramUserId: '42',
    nodeEnv: 'production',
    now,
  })
}

function identity() {
  return {
    telegramUserId: '42',
    displayName: 'Ada',
    username: null,
    photoUrl: null,
  }
}
