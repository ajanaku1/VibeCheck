import type { DatabaseSync } from 'node:sqlite'
import { timingSafeEqual } from 'node:crypto'

import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify'

import { OperationalError, toProblem } from './errors.js'
import { StructuredLogger } from './logger.js'
import { SessionService } from './auth/session-service.js'
import { registerAuthRoutes } from './api/auth-routes.js'
import { registerRecoveryRoutes } from './api/recovery-routes.js'
import { RecoveryReadService } from './services/recovery-read-service.js'

export interface DashboardConfig {
  telegramBotToken: string
  telegramBotUsername: string
  authorizedTelegramUserId: string
  nodeEnv: 'development' | 'test' | 'production'
  communityId: string
  now?: () => number
}

export interface AppDependencies {
  database: DatabaseSync
  logger?: StructuredLogger
  staticRoot?: string
  dashboard?: DashboardConfig
  telegramWebhook?: TelegramWebhookConfig
}

export interface TelegramWebhookConfig {
  secretToken: string
  receive(update: unknown): Promise<void>
}

const SECURITY_HEADERS = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self' https://telegram.org",
    'frame-src https://oauth.telegram.org https://t.me',
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join('; '),
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
} as const

export function buildApp(dependencies: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: false })
  const logger = dependencies.logger ?? new StructuredLogger()

  app.addHook('onSend', async (_request, reply) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) reply.header(name, value)
  })

  app.get('/api/health', async (_request, reply) => {
    try {
      dependencies.database.prepare('SELECT 1 AS ready').get()
      return { status: 'ready', database: 'ready' }
    } catch (error) {
      logger.error('health_database_unavailable', { error })
      return reply
        .header('retry-after', '1')
        .status(503)
        .send({ status: 'degraded', database: 'unavailable' })
    }
  })

  if (dependencies.telegramWebhook) {
    const webhook = dependencies.telegramWebhook
    app.post('/api/telegram/webhook', async (request, reply) => {
      const providedSecret = request.headers['x-telegram-bot-api-secret-token']
      if (!matchesSecret(providedSecret, webhook.secretToken)) {
        return reply.status(401).send()
      }
      await webhook.receive(request.body)
      return reply.status(204).send()
    })
  }

  if (dependencies.dashboard) {
    const dashboard = dependencies.dashboard
    const sessions = new SessionService({
      database: dependencies.database,
      authorizedTelegramUserId: dashboard.authorizedTelegramUserId,
      nodeEnv: dashboard.nodeEnv,
      now: dashboard.now,
    })
    registerAuthRoutes(app, dashboard, sessions)
    registerRecoveryRoutes(
      app,
      sessions,
      new RecoveryReadService(dependencies.database, dashboard.communityId),
    )
  }

  if (dependencies.staticRoot) {
    app.register(fastifyStatic, {
      root: dependencies.staticRoot,
      wildcard: false,
    })
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (dependencies.staticRoot && !request.url.startsWith('/api/')) {
      return reply.sendFile('index.html')
    }
    sendProblem(
      reply,
      new OperationalError({ code: 'not_found', title: 'Not found', status: 404 }),
      request.id,
    )
  })

  app.setErrorHandler(async (error, request, reply) => {
    const operationalError = toOperationalError(error)
    logger.error('request_failed', {
      correlationId: request.id,
      code: operationalError.code,
      error,
    })
    if (operationalError.status === 503 && operationalError.retryable) {
      reply.header('retry-after', '1')
    }
    sendProblem(reply, operationalError, request.id)
  })

  return app
}

function matchesSecret(provided: string | string[] | undefined, expected: string): boolean {
  if (typeof provided !== 'string') return false
  const actualBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

function toOperationalError(error: unknown): OperationalError {
  if (error instanceof OperationalError) return error
  if (isDatabaseUnavailable(error)) {
    return new OperationalError({
      code: 'service_unavailable',
      title: 'Service unavailable',
      status: 503,
      retryable: true,
      cause: error,
    })
  }
  return new OperationalError({
    code: 'internal_error',
    title: 'Internal server error',
    status: 500,
    retryable: true,
    cause: error,
  })
}

function isDatabaseUnavailable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false
  const code = String(error.code)
  return code.startsWith('ERR_SQLITE') || code === 'ERR_INVALID_STATE'
}

function sendProblem(
  reply: FastifyReply,
  error: OperationalError,
  correlationId: string,
): void {
  reply
    .status(error.status)
    .type('application/problem+json')
    .send(toProblem(error, correlationId))
}
