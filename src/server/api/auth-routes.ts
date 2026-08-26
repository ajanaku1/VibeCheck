import type { FastifyInstance, FastifyRequest } from 'fastify'

import { OperationalError } from '../errors.js'
import { SessionService, type CreatorSessionView } from '../auth/session-service.js'
import { verifyTelegramAuth } from '../auth/telegram-auth.js'

export interface AuthRouteConfig {
  telegramBotToken: string
  telegramBotUsername: string
  authorizedTelegramUserId: string
  now?: () => number
}

export function registerAuthRoutes(
  app: FastifyInstance,
  config: AuthRouteConfig,
  sessions: SessionService,
): void {
  app.get('/api/auth/config', async () => ({
    telegramBotUsername: config.telegramBotUsername,
  }))

  app.post('/api/auth/telegram', async (request, reply) => {
    const result = verifyTelegramAuth(request.body, {
      botToken: config.telegramBotToken,
      authorizedTelegramUserId: config.authorizedTelegramUserId,
      maxAgeSeconds: 300,
      maxFutureSkewSeconds: 30,
      now: config.now,
    })
    if (result.status === 'invalid') throw invalidAuthError(result.reason)
    if (result.status === 'unauthorized') {
      throw authError('creator_not_authorized', 'Creator access denied', 403)
    }
    const created = sessions.create(result.identity)
    reply.header('set-cookie', serializeSessionCookie(created.token, sessions, false))
    return created.session
  })

  app.get('/api/auth/session', async (request) => requireCreatorSession(request, sessions))

  app.post('/api/auth/logout', async (request, reply) => {
    const token = requireSessionToken(request)
    if (!sessions.find(token)) throw authenticationRequired()
    sessions.revoke(token)
    reply.header('set-cookie', serializeSessionCookie('', sessions, true))
    return reply.status(204).send()
  })
}

export function requireCreatorSession(
  request: FastifyRequest,
  sessions: SessionService,
): CreatorSessionView {
  const token = requireSessionToken(request)
  const session = sessions.find(token)
  if (!session) throw authenticationRequired()
  return session
}

function requireSessionToken(request: FastifyRequest): string {
  const token = parseCookies(request.headers.cookie)[SESSION_COOKIE_NAME]
  if (!token) throw authenticationRequired()
  return token
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {}
  return Object.fromEntries(
    header.split(';').flatMap((part) => {
      const separator = part.indexOf('=')
      if (separator < 1) return []
      const key = part.slice(0, separator).trim()
      const value = part.slice(separator + 1).trim()
      return [[key, value]]
    }),
  )
}

function serializeSessionCookie(
  token: string,
  sessions: SessionService,
  clear: boolean,
): string {
  const { options } = sessions.cookie
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    `Max-Age=${clear ? 0 : options.maxAge}`,
    `Path=${options.path}`,
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (options.secure) parts.push('Secure')
  return parts.join('; ')
}

function invalidAuthError(
  reason: 'malformed_payload' | 'invalid_signature' | 'expired_payload' | 'future_payload',
): OperationalError {
  if (reason === 'malformed_payload') {
    return authError('invalid_auth_payload', 'Invalid authentication payload', 400)
  }
  if (reason === 'expired_payload') {
    return authError('expired_telegram_auth', 'Telegram authentication expired', 401)
  }
  return authError('invalid_telegram_auth', 'Invalid Telegram authentication', 401)
}

function authenticationRequired(): OperationalError {
  return authError('authentication_required', 'Authentication required', 401)
}

function authError(code: string, title: string, status: number): OperationalError {
  return new OperationalError({ code, title, status, retryable: false })
}

const SESSION_COOKIE_NAME = 'vibecheck_session'
