import type { DatabaseSync } from 'node:sqlite'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../../src/server/app.js'
import { createDatabase } from '../../src/server/db/database.js'
import { migrate } from '../../src/server/db/migrations.js'

const SECRET = 'telegram-webhook-secret-at-least-32-characters'

describe('Telegram webhook', () => {
  let database: DatabaseSync

  beforeEach(() => {
    database = createDatabase(':memory:')
    migrate(database)
  })

  afterEach(() => database.close())

  it('accepts an authenticated update without returning bot content', async () => {
    const receive = vi.fn().mockResolvedValue(undefined)
    const app = buildApp({
      database,
      telegramWebhook: { secretToken: SECRET, receive },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/telegram/webhook',
      headers: { 'x-telegram-bot-api-secret-token': SECRET },
      payload: { update_id: 17, message: { text: 'hello' } },
    })

    expect(response.statusCode).toBe(204)
    expect(response.body).toBe('')
    expect(receive).toHaveBeenCalledWith({ update_id: 17, message: { text: 'hello' } })
    await app.close()
  })

  it('rejects a request with no matching Telegram secret before ingestion', async () => {
    const receive = vi.fn().mockResolvedValue(undefined)
    const app = buildApp({
      database,
      telegramWebhook: { secretToken: SECRET, receive },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/telegram/webhook',
      headers: { 'x-telegram-bot-api-secret-token': 'wrong-secret' },
      payload: { update_id: 18 },
    })

    expect(response.statusCode).toBe(401)
    expect(receive).not.toHaveBeenCalled()
    await app.close()
  })
})
