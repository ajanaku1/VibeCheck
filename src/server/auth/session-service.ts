import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

import { transaction } from '../db/database.js'
import { CreatorIdentityRepository } from '../db/repositories/creator-identity-repository.js'
import { SessionRepository } from '../db/repositories/session-repository.js'
import type { VerifiedTelegramIdentity } from './telegram-auth.js'

const SESSION_DURATION_MS = 8 * 60 * 60 * 1_000

interface SessionServiceDependencies {
  database: DatabaseSync
  authorizedTelegramUserId: string
  nodeEnv: 'development' | 'test' | 'production'
  now?: () => number
  tokenFactory?: () => string
  idFactory?: () => string
}

export interface CreatorSessionView {
  creator: VerifiedTelegramIdentity
  expiresAt: string
}

export interface CreatedSession {
  token: string
  session: CreatorSessionView
}

interface SessionCookiePolicy {
  name: 'vibecheck_session'
  options: {
    httpOnly: true
    sameSite: 'lax'
    secure: boolean
    path: '/'
    maxAge: number
  }
}

export class SessionService {
  readonly cookie: SessionCookiePolicy
  private readonly sessions: SessionRepository
  private readonly creators: CreatorIdentityRepository
  private readonly now: () => number
  private readonly tokenFactory: () => string
  private readonly idFactory: () => string

  constructor(private readonly dependencies: SessionServiceDependencies) {
    this.sessions = new SessionRepository(dependencies.database)
    this.creators = new CreatorIdentityRepository(dependencies.database)
    this.now = dependencies.now ?? Date.now
    this.tokenFactory = dependencies.tokenFactory ?? (() => randomBytes(32).toString('base64url'))
    this.idFactory = dependencies.idFactory ?? randomUUID
    this.cookie = {
      name: 'vibecheck_session',
      options: {
        httpOnly: true as const,
        sameSite: 'lax' as const,
        secure: dependencies.nodeEnv === 'production',
        path: '/' as const,
        maxAge: SESSION_DURATION_MS / 1_000,
      },
    }
  }

  create(identity: VerifiedTelegramIdentity): CreatedSession {
    this.assertAuthorized(identity.telegramUserId)
    const now = this.now()
    const expiresAt = now + SESSION_DURATION_MS
    const token = this.tokenFactory()
    transaction(this.dependencies.database, () => {
      this.creators.upsert({ ...identity, lastAuthenticatedAt: now })
      this.sessions.create({
        id: this.idFactory(),
        tokenHash: hashToken(token),
        telegramUserId: identity.telegramUserId,
        createdAt: now,
        expiresAt,
      })
    })
    return { token, session: toSessionView(identity, expiresAt) }
  }

  find(token: string): CreatorSessionView | null {
    const session = this.sessions.findActive(
      hashToken(token),
      this.dependencies.authorizedTelegramUserId,
      this.now(),
    )
    if (!session) return null
    const creator = this.creators.findById(session.telegramUserId)
    if (!creator) return null
    return {
      creator: {
        telegramUserId: creator.telegramUserId,
        displayName: creator.displayName,
        username: creator.username,
        photoUrl: creator.photoUrl,
      },
      expiresAt: new Date(session.expiresAt).toISOString(),
    }
  }

  revoke(token: string): void {
    this.sessions.revoke(hashToken(token), this.now())
  }

  private assertAuthorized(telegramUserId: string): void {
    if (telegramUserId !== this.dependencies.authorizedTelegramUserId) {
      throw new Error('Session identity is not the configured creator')
    }
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function toSessionView(
  creator: VerifiedTelegramIdentity,
  expiresAt: number,
): CreatorSessionView {
  return { creator, expiresAt: new Date(expiresAt).toISOString() }
}
