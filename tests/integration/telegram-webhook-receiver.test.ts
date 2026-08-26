import type { DatabaseSync } from 'node:sqlite'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDatabase } from '../../src/server/db/database.js'
import { migrate } from '../../src/server/db/migrations.js'
import { ObservationRepository } from '../../src/server/db/repositories/observation-repository.js'
import { CommunityStatusRepository } from '../../src/server/db/repositories/community-status-repository.js'
import { TelegramWebhookReceiver } from '../../src/server/services/telegram-webhook-receiver.js'

const COMMUNITY_ID = '11111111-1111-4111-8111-111111111111'
const GROUP_ID = '-1001234567890'
const CREATOR_ID = '123456789'
const NOW = Date.parse('2026-08-19T12:00:00.000Z')

describe('TelegramWebhookReceiver', () => {
  let database: DatabaseSync
  let receiver: TelegramWebhookReceiver

  beforeEach(() => {
    database = createDatabase(':memory:')
    migrate(database)
    database
      .prepare(
        `INSERT INTO communities
         (id, telegram_chat_ref, display_name, minds_source_alias, observation_status,
          timing_profile)
         VALUES (?, ?, 'Staged Creators', 'vibecheck-engine', 'learning', 'demo')`,
      )
      .run(COMMUNITY_ID, GROUP_ID)
    receiver = new TelegramWebhookReceiver({
      observations: new ObservationRepository(database),
      status: new CommunityStatusRepository(database),
      communityId: COMMUNITY_ID,
      communityChatId: GROUP_ID,
      authorizedCreatorUserId: CREATOR_ID,
      authorizedCreatorChatId: CREATOR_ID,
      memberHashKey: 'test-member-hash-key-with-at-least-32-chars',
      now: () => NOW,
    })
  })

  afterEach(() => database.close())

  it('persists one group message and durable community job without exposing raw member ids', async () => {
    const update = groupUpdate(41)

    await expect(receiver.receive(update)).resolves.toEqual({ status: 'inserted' })
    await expect(receiver.receive(update)).resolves.toEqual({ status: 'duplicate' })

    const observation = database
      .prepare(
        `SELECT source, source_fingerprint, member_ref_id, evidence_excerpt
         FROM observations`,
      )
      .get() as Record<string, unknown>
    const member = database
      .prepare('SELECT external_ref_hash, display_label, activity_count FROM member_references')
      .get() as Record<string, unknown>
    const job = database
      .prepare('SELECT kind, status, attempt_count FROM observation_jobs')
      .get() as Record<string, unknown>

    expect(observation).toMatchObject({
      source: 'telegram_webhook_group',
      source_fingerprint: `telegram:${GROUP_ID}:41`,
      evidence_excerpt: 'We should talk this through.',
    })
    expect(member).toMatchObject({ display_label: 'Alex Morgan', activity_count: 1 })
    expect(member.external_ref_hash).not.toBe('987654321')
    expect(job).toEqual({ kind: 'community', status: 'pending', attempt_count: 0 })
    expect(
      database
        .prepare('SELECT observation_status, last_observed_at FROM communities WHERE id = ?')
        .get(COMMUNITY_ID),
    ).toEqual({ observation_status: 'observing', last_observed_at: 1_776_672_000_000 })
  })

  it('persists an authorized private creator command as private durable work', async () => {
    await expect(receiver.receive(creatorUpdate())).resolves.toEqual({ status: 'inserted' })

    const observation = database
      .prepare('SELECT source, member_ref_id, evidence_excerpt FROM observations')
      .get() as Record<string, unknown>
    const job = database.prepare('SELECT kind, status FROM observation_jobs').get()

    expect(observation).toEqual({
      source: 'telegram_webhook_creator',
      member_ref_id: null,
      evidence_excerpt: 'Approve 12345678',
    })
    expect(job).toEqual({ kind: 'creator', status: 'pending' })
  })

  it.each([
    ['another group', groupUpdate(42, { chatId: '-1009999999999' })],
    ['a bot-authored message', groupUpdate(43, { isBot: true })],
    ['an unauthorized private sender', creatorUpdate({ senderId: 555 })],
    ['a non-text update', { update_id: 44, message: { message_id: 44, date: 1 } }],
  ])('ignores %s without storing work', async (_label, update) => {
    await expect(receiver.receive(update)).resolves.toEqual({ status: 'ignored' })

    expect(count(database, 'observations')).toBe(0)
    expect(count(database, 'observation_jobs')).toBe(0)
  })
})

function groupUpdate(
  messageId: number,
  overrides: { chatId?: string; isBot?: boolean } = {},
): object {
  return {
    update_id: messageId,
    message: {
      message_id: messageId,
      date: 1_776_672_000,
      chat: { id: Number(overrides.chatId ?? GROUP_ID), type: 'supergroup' },
      from: {
        id: 987654321,
        is_bot: overrides.isBot ?? false,
        first_name: 'Alex',
        last_name: 'Morgan',
      },
      text: 'We should talk this through.',
    },
  }
}

function creatorUpdate(overrides: { senderId?: number } = {}): object {
  return {
    update_id: 50,
    message: {
      message_id: 50,
      date: 1_776_672_000,
      chat: { id: Number(CREATOR_ID), type: 'private' },
      from: {
        id: overrides.senderId ?? Number(CREATOR_ID),
        is_bot: false,
        first_name: 'Creator',
      },
      text: 'Approve 12345678',
    },
  }
}

function count(database: DatabaseSync, table: 'observations' | 'observation_jobs'): number {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }
  return row.count
}
