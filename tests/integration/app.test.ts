import type { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/server/app.js'
import { createDatabase } from '../../src/server/db/database.js'
import { migrate } from '../../src/server/db/migrations.js'
import { OperationalError } from '../../src/server/errors.js'
import { StructuredLogger } from '../../src/server/logger.js'

let database: DatabaseSync

beforeEach(() => {
  database = createDatabase(':memory:')
  migrate(database)
})

afterEach(() => {
  database.close()
})

function createApp(): FastifyInstance {
  return buildApp({ database, logger: new StructuredLogger(() => undefined) })
}

describe('Fastify application shell', () => {
  it('reports database readiness without exposing configuration', async () => {
    const app = createApp()
    const response = await app.inject({ method: 'GET', url: '/api/health' })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ready', database: 'ready' })
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['content-security-policy']).toContain("default-src 'self'")
    expect(response.headers['content-security-policy']).toContain("script-src 'self' https://telegram.org")
    expect(response.headers['content-security-policy']).toContain('frame-src https://oauth.telegram.org https://t.me')
    expect(response.body).not.toMatch(/token|secret|community/i)
  })

  it('fails health closed when the database is unavailable', async () => {
    database.close()
    database = createDatabase(':memory:')
    const app = createApp()
    database.close()

    const response = await app.inject({ method: 'GET', url: '/api/health' })
    await app.close()
    database = createDatabase(':memory:')

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({ status: 'degraded', database: 'unavailable' })
    expect(response.headers['retry-after']).toBe('1')
  })

  it('renders operational failures as problem responses', async () => {
    const app = createApp()
    app.get('/failure', async () => {
      throw new OperationalError({
        code: 'mind_delayed',
        title: 'Analysis delayed',
        status: 503,
        detail: 'The case has not advanced.',
        retryable: true,
      })
    })

    const response = await app.inject({ method: 'GET', url: '/failure' })
    await app.close()

    expect(response.statusCode).toBe(503)
    expect(response.headers['content-type']).toContain('application/problem+json')
    expect(response.json()).toMatchObject({
      type: '/problems/mind_delayed',
      code: 'mind_delayed',
      detail: 'The case has not advanced.',
      retryable: true,
    })
  })

  it('uses a sanitized problem for unknown routes', async () => {
    const app = createApp()
    const response = await app.inject({ method: 'GET', url: '/not-present' })
    await app.close()

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ code: 'not_found', status: 404 })
  })

  it('serves the built dashboard and preserves API 404 responses', async () => {
    const app = buildApp({
      database,
      logger: new StructuredLogger(() => undefined),
      staticRoot: resolve('tests/fixtures/static-dashboard'),
    })

    const landing = await app.inject({ method: 'GET', url: '/' })
    const clientRoute = await app.inject({ method: 'GET', url: '/cases/example' })
    const missingApi = await app.inject({ method: 'GET', url: '/api/missing' })
    await app.close()

    expect(landing.statusCode).toBe(200)
    expect(landing.body).toContain('VibeCheck static fixture')
    expect(clientRoute.statusCode).toBe(200)
    expect(clientRoute.body).toContain('VibeCheck static fixture')
    expect(missingApi.statusCode).toBe(404)
    expect(missingApi.headers['content-type']).toContain('application/problem+json')
  })
})
