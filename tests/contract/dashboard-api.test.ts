import { createHash, createHmac } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  recoveryCaseDetailSchema,
  recoveryOverviewSchema,
  sessionSchema,
} from '../../src/domain/validation.js'
import { buildApp } from '../../src/server/app.js'
import { createDatabase } from '../../src/server/db/database.js'
import { migrate } from '../../src/server/db/migrations.js'
import { StructuredLogger } from '../../src/server/logger.js'

const NOW = Date.parse('2026-08-17T12:00:00.000Z')
const BOT_TOKEN = '123456:telegram-test-secret'
const CREATOR_ID = '42'
const COMMUNITY_ID = '11111111-1111-4111-8111-111111111111'
const CASE_ID = '22222222-2222-4222-8222-222222222222'

let database: DatabaseSync
let app: FastifyInstance

beforeEach(() => {
  database = createDatabase(':memory:')
  migrate(database)
  seedRecoveryCase(database)
  app = createDashboardApp(database)
})

describe('dashboard API contract', () => {
  it('returns only the public Telegram bot username', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/auth/config' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ telegramBotUsername: 'VibeCheckBot' })
    expect(response.body).not.toContain(BOT_TOKEN)
  })

  it('distinguishes malformed, invalid, expired, and unauthorized Telegram payloads', async () => {
    const malformed = await app.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      payload: { id: '42' },
    })
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      payload: { ...signedLogin(CREATOR_ID), first_name: 'Tampered' },
    })
    const expired = await app.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      payload: signedLogin(CREATOR_ID, Math.floor(NOW / 1_000) - 301),
    })
    const unauthorized = await app.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      payload: signedLogin('43'),
    })

    expect(problem(malformed)).toMatchObject({ status: 400, code: 'invalid_auth_payload' })
    expect(problem(invalid)).toMatchObject({ status: 401, code: 'invalid_telegram_auth' })
    expect(problem(expired)).toMatchObject({ status: 401, code: 'expired_telegram_auth' })
    expect(problem(unauthorized)).toMatchObject({ status: 403, code: 'creator_not_authorized' })
  })

  it('creates an HttpOnly session cookie and returns the verified session contract', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      payload: signedLogin(CREATOR_ID),
    })

    expect(response.statusCode).toBe(200)
    expect(() => sessionSchema.parse(response.json())).not.toThrow()
    expect(response.headers['set-cookie']).toContain('vibecheck_session=')
    expect(response.headers['set-cookie']).toContain('HttpOnly')
    expect(response.headers['set-cookie']).toContain('SameSite=Lax')
  })

  it('retrieves, revokes, and then rejects the creator session', async () => {
    const cookie = await authenticate(app)
    const active = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } })
    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } })
    const revoked = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } })

    expect(active.statusCode).toBe(200)
    expect(() => sessionSchema.parse(active.json())).not.toThrow()
    expect(logout.statusCode).toBe(204)
    expect(logout.headers['set-cookie']).toContain('vibecheck_session=;')
    expect(problem(revoked)).toMatchObject({ status: 401, code: 'authentication_required' })
  })

  it('rejects logout without an active session', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/auth/logout' })

    expect(problem(response)).toMatchObject({ status: 401, code: 'authentication_required' })
  })

  it('returns the evidence-limited recovery overview only with an active session', async () => {
    const denied = await app.inject({ method: 'GET', url: '/api/recovery-overview' })
    const cookie = await authenticate(app)
    const response = await app.inject({
      method: 'GET',
      url: '/api/recovery-overview',
      headers: { cookie },
    })

    expect(problem(denied)).toMatchObject({ status: 401, code: 'authentication_required' })
    expect(response.statusCode).toBe(200)
    const overview = recoveryOverviewSchema.parse(response.json())
    expect(overview.community).toEqual({ displayName: 'Staged Creators' })
    expect(overview.counts).toEqual({ open: 1, resolved: 0, unresolved: 0, awaitingAction: 1 })
    expect(overview.cases).toHaveLength(1)
  })

  it('returns one chronological provenance timeline and a tenant-safe 404', async () => {
    const cookie = await authenticate(app)
    const response = await app.inject({
      method: 'GET',
      url: `/api/recovery-cases/${CASE_ID}`,
      headers: { cookie },
    })
    const missing = await app.inject({
      method: 'GET',
      url: '/api/recovery-cases/99999999-9999-4999-8999-999999999999',
      headers: { cookie },
    })

    expect(response.statusCode).toBe(200)
    const detail = recoveryCaseDetailSchema.parse(response.json())
    expect(detail.rememberedContext).toEqual(['Members usually repair disagreements quickly.'])
    expect(detail.timeline.map(({ eventType }) => eventType)).toEqual([
      'case_opened',
      'draft_approved',
    ])
    expect(detail.timeline[0]?.evidence).toEqual([
      { source: 'community message', excerpt: 'The exchange became personal.' },
      { source: 'remembered norm', excerpt: 'Members usually repair disagreements quickly.' },
    ])
    expect(problem(missing)).toMatchObject({ status: 404, code: 'recovery_case_not_found' })
  })

  it('maps authentication persistence and recovery read failures to retryable 503 responses', async () => {
    const unavailableDatabase = createDatabase(':memory:')
    migrate(unavailableDatabase)
    const unavailableApp = createDashboardApp(unavailableDatabase)
    unavailableDatabase.close()

    const authFailure = await unavailableApp.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      payload: signedLogin(CREATOR_ID),
    })

    expect(problem(authFailure)).toMatchObject({
      status: 503,
      code: 'service_unavailable',
      retryable: true,
    })
    expect(authFailure.headers['retry-after']).toBe('1')

    const emptyDatabase = createDatabase(':memory:')
    migrate(emptyDatabase)
    const emptyApp = createDashboardApp(emptyDatabase)
    const cookie = await authenticate(emptyApp)
    const readFailure = await emptyApp.inject({
      method: 'GET',
      url: '/api/recovery-overview',
      headers: { cookie },
    })

    expect(problem(readFailure)).toMatchObject({
      status: 503,
      code: 'recovery_data_unavailable',
      retryable: true,
    })
    expect(readFailure.headers['retry-after']).toBe('1')
    await emptyApp.close()
    emptyDatabase.close()
  })
})

function createDashboardApp(database: DatabaseSync): FastifyInstance {
  return buildApp({
    database,
    logger: new StructuredLogger(() => undefined),
    dashboard: {
      telegramBotToken: BOT_TOKEN,
      telegramBotUsername: 'VibeCheckBot',
      authorizedTelegramUserId: CREATOR_ID,
      nodeEnv: 'test',
      communityId: COMMUNITY_ID,
      now: () => NOW,
    },
  })
}

async function authenticate(target: FastifyInstance): Promise<string> {
  const response = await target.inject({
    method: 'POST',
    url: '/api/auth/telegram',
    payload: signedLogin(CREATOR_ID),
  })
  const header = response.headers['set-cookie']
  if (typeof header !== 'string') throw new Error('Session cookie was not set')
  return header.split(';', 1)[0]!
}

function signedLogin(id: string, authDate = Math.floor(NOW / 1_000)): Record<string, unknown> {
  const payload = { id, first_name: 'Ada', username: 'ada', auth_date: authDate }
  const checkString = Object.entries(payload)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secret = createHash('sha256').update(BOT_TOKEN).digest()
  const hash = createHmac('sha256', secret).update(checkString).digest('hex')
  return { ...payload, hash }
}

function problem(response: { statusCode: number; json(): unknown }): Record<string, unknown> {
  return { status: response.statusCode, ...(response.json() as Record<string, unknown>) }
}

function seedRecoveryCase(target: DatabaseSync): void {
  target.exec(`
    INSERT INTO communities
      (id, telegram_chat_ref, display_name, minds_source_alias, observation_status, timing_profile)
    VALUES ('${COMMUNITY_ID}', '-100-secret-chat', 'Staged Creators', 'source-alias', 'observing', 'demo');
    INSERT INTO member_references
      (id, community_id, external_ref_hash, display_label, first_seen_at, last_active_at, activity_count)
    VALUES
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${COMMUNITY_ID}', 'private-member-hash-a', 'Alex', 1, 2, 2),
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '${COMMUNITY_ID}', 'private-member-hash-b', 'Sam', 1, 2, 2);
    INSERT INTO observations
      (id, community_id, source, source_fingerprint, session_ref, member_ref_id, occurred_at,
       ingested_at, evidence_excerpt, content_digest, visibility)
    VALUES
      ('33333333-3333-4333-8333-333333333333', '${COMMUNITY_ID}', 'minds_telegram_group',
       'private-fingerprint', 'session-2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1000, 1001,
       'The exchange became personal.', 'private-content-digest', 'case_evidence');
    INSERT INTO community_context
      (id, community_id, kind, statement, member_refs_json, evidence_observation_ids_json,
       confidence, status, created_at, superseded_at)
    VALUES
      ('44444444-4444-4444-8444-444444444444', '${COMMUNITY_ID}', 'norm',
       'Members usually repair disagreements quickly.', '[]',
       '["33333333-3333-4333-8333-333333333333"]', 0.8, 'active', 900, NULL);
    INSERT INTO recovery_cases
      (id, community_id, fracture_key, trigger, state, confidence, uncertainty, opened_at,
       updated_at, monitoring_started_at, resolution_due_at, dismissed_until, outcome_summary, version)
    VALUES
      ('${CASE_ID}', '${COMMUNITY_ID}', 'fracture-key', 'escalating_conflict', 'needs_review',
       0.82, 'Intent remains uncertain.', 2000, 3000, NULL, NULL, NULL, NULL, 2);
    INSERT INTO case_participants (case_id, member_ref_id, role) VALUES
      ('${CASE_ID}', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'affected'),
      ('${CASE_ID}', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'counterparty');
    INSERT INTO case_evidence (case_id, evidence_id, evidence_type, role) VALUES
      ('${CASE_ID}', '33333333-3333-4333-8333-333333333333', 'observation', 'observed_change'),
      ('${CASE_ID}', '44444444-4444-4444-8444-444444444444', 'community_context', 'remembered_context');
    INSERT INTO intervention_plans
      (id, case_id, suggested_text, final_text, finalized_by, finalized_at, sent_confirmed_at)
    VALUES
      ('55555555-5555-4555-8555-555555555555', '${CASE_ID}', 'Check in privately.',
       'Check in privately.', 'approve', 2500, NULL);
    INSERT INTO case_events
      (id, case_id, idempotency_key, event_type, actor, provenance, summary,
       evidence_refs_json, from_state, to_state, occurred_at)
    VALUES
      ('66666666-6666-4666-8666-666666666666', '${CASE_ID}', 'open', 'case_opened', 'mind',
       'mind_inference', 'Mind analysis met the deterministic fracture gate.',
       '["33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444"]',
       NULL, 'needs_review', 2000),
      ('77777777-7777-4777-8777-777777777777', '${CASE_ID}', 'approve', 'draft_approved',
       'creator', 'creator_decision', 'Creator approved the suggested outreach.', '[]',
       'needs_review', 'needs_review', 2500);
  `)
}
