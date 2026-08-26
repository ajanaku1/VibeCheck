import { createHash, createHmac } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

import { beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/server/app.js'
import { createDatabase } from '../../src/server/db/database.js'
import { migrate } from '../../src/server/db/migrations.js'
import { StructuredLogger } from '../../src/server/logger.js'

const FORBIDDEN_VALUES = [
  'Private Community Name',
  'Private Member Label',
  'private evidence excerpt',
  'private-case-id',
  'internal prompt instructions',
  'builder-api-secret',
  'telegram-bot-secret',
]

let database: DatabaseSync

beforeEach(() => {
  database = createDatabase(':memory:')
  migrate(database)
  database.exec(`
    INSERT INTO communities
      (id, telegram_chat_ref, display_name, minds_source_alias, observation_status, timing_profile,
       last_error)
    VALUES
      ('11111111-1111-4111-8111-111111111111', '-100-private', 'Private Community Name',
       'private-source', 'error', 'demo', 'internal prompt instructions');
  `)
})

describe('protected-data denial', () => {
  it('returns no protected or secret values to unauthenticated overview/detail requests', async () => {
    const app = protectedApp()
    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/api/recovery-overview' }),
      app.inject({
        method: 'GET',
        url: '/api/recovery-cases/22222222-2222-4222-8222-222222222222',
      }),
    ])

    for (const response of responses) {
      expect(response.statusCode).toBe(401)
      assertNoProtectedData(response.body)
    }
  })

  it('returns no protected or secret values when valid Telegram identity is unauthorized', async () => {
    const app = protectedApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      payload: unauthorizedLogin(),
    })

    expect(response.statusCode).toBe(403)
    assertNoProtectedData(response.body)
  })

  it('returns no protected or secret values when local persistence is unavailable', async () => {
    const app = protectedApp()
    database.close()
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      payload: authorizedLogin(),
    })

    expect(response.statusCode).toBe(503)
    assertNoProtectedData(response.body)
    database = createDatabase(':memory:')
  })
})

function protectedApp() {
  return buildApp({
    database,
    logger: new StructuredLogger(() => undefined),
    dashboard: {
      telegramBotToken: '123456:telegram-bot-secret',
      telegramBotUsername: 'VibeCheckBot',
      authorizedTelegramUserId: '42',
      nodeEnv: 'test',
      communityId: '11111111-1111-4111-8111-111111111111',
      now: () => Date.parse('2026-08-17T12:00:00.000Z'),
    },
  })
}

function unauthorizedLogin(): Record<string, unknown> {
  return signedLogin('43')
}

function authorizedLogin(): Record<string, unknown> {
  return signedLogin('42')
}

function signedLogin(id: string): Record<string, unknown> {
  const payload = {
    id,
    first_name: 'Other',
    auth_date: Math.floor(Date.parse('2026-08-17T12:00:00.000Z') / 1_000),
  }
  const checkString = Object.entries(payload)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secret = createHash('sha256').update('123456:telegram-bot-secret').digest()
  return {
    ...payload,
    hash: createHmac('sha256', secret).update(checkString).digest('hex'),
  }
}

function assertNoProtectedData(body: string): void {
  for (const value of FORBIDDEN_VALUES) expect(body).not.toContain(value)
  expect(body).not.toMatch(/telegram_chat_ref|evidence_excerpt|member_ref|prompt|secret/i)
}
