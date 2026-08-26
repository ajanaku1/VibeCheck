import { describe, expect, it, vi } from 'vitest'

import { createDatabase } from '../../src/server/db/database.js'
import { migrate } from '../../src/server/db/migrations.js'
import { ensureCommunity } from '../../src/server/index.js'
import { ServerRuntime } from '../../src/server/runtime.js'

describe('server runtime', () => {
  it('idempotently bootstraps one configured community', () => {
    const database = createDatabase(':memory:')
    migrate(database)

    const firstId = ensureCommunity(database, {
      telegramChatRef: '-100123',
      engineAlias: 'vibecheck-engine',
      timingProfile: 'demo',
    })
    const secondId = ensureCommunity(database, {
      telegramChatRef: '-100123',
      engineAlias: 'vibecheck-engine',
      timingProfile: 'standard',
    })
    const row = database.prepare('SELECT * FROM communities').get() as Record<string, unknown>

    expect(secondId).toBe(firstId)
    expect(row).toMatchObject({
      telegram_chat_ref: '-100123',
      minds_source_alias: 'vibecheck-engine',
      timing_profile: 'standard',
    })
    database.close()
  })

  it('runs all persisted work immediately without starting chat consumers', async () => {
    const drainObservations = vi.fn().mockResolvedValue(undefined)
    const reconcileDeadlines = vi.fn().mockResolvedValue(undefined)
    const drainNotifications = vi.fn().mockResolvedValue(undefined)
    const runtime = new ServerRuntime({
      drainObservations,
      reconcileDeadlines,
      drainNotifications,
      app: fakeApp(),
      database: fakeDatabase(),
      pollIntervalMs: 60_000,
    })

    await runtime.start({ port: 3000 })

    expect(drainObservations).toHaveBeenCalledOnce()
    expect(reconcileDeadlines).toHaveBeenCalledOnce()
    expect(drainNotifications).toHaveBeenCalledOnce()
    await runtime.stop()
  })

  it('closes the app before its database', async () => {
    const order: string[] = []
    const app = fakeApp(() => order.push('app-closed'))
    const database = fakeDatabase(() => order.push('database-closed'))
    const runtime = new ServerRuntime({
      drainObservations: vi.fn().mockResolvedValue(undefined),
      reconcileDeadlines: vi.fn().mockResolvedValue(undefined),
      drainNotifications: vi.fn().mockResolvedValue(undefined),
      app,
      database,
      pollIntervalMs: 60_000,
    })
    await runtime.start({ port: 3000 })

    await runtime.stop()

    expect(order).toEqual(['app-closed', 'database-closed'])
  })

  it('reports background failures without turning cancellation into an error', async () => {
    const onBackgroundError = vi.fn()
    const runtime = new ServerRuntime({
      drainObservations: vi.fn().mockRejectedValue(new Error('observation drain failed')),
      reconcileDeadlines: vi.fn().mockRejectedValue(new Error('deadline failed')),
      drainNotifications: vi.fn().mockResolvedValue(undefined),
      app: fakeApp(),
      database: fakeDatabase(),
      pollIntervalMs: 60_000,
      onBackgroundError,
    })

    await runtime.start({ port: 3000 })
    await vi.waitFor(() => expect(onBackgroundError).toHaveBeenCalledTimes(2))
    await runtime.stop()
  })
})

function fakeApp(onClose: () => void = () => undefined) {
  return {
    listen: vi.fn().mockResolvedValue('http://127.0.0.1:3000'),
    close: vi.fn(async () => onClose()),
  }
}

function fakeDatabase(onClose: () => void = () => undefined) {
  return { close: vi.fn(() => onClose()) }
}
