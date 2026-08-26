import type { DatabaseSync } from 'node:sqlite'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDatabase } from '../../src/server/db/database.js'
import { migrate } from '../../src/server/db/migrations.js'
import { NotificationDeliveryRepository } from '../../src/server/db/repositories/notification-delivery-repository.js'
import { OperationalError } from '../../src/server/errors.js'
import {
  TelegramAdapter,
  type TelegramFetch,
} from '../../src/server/integrations/telegram-adapter.js'
import {
  NotificationService,
  type CreatorMessenger,
} from '../../src/server/services/notification-service.js'

const BOT_TOKEN = '8074844678:test-token-value'
const CREATOR_ID = '123456789'
const DELIVERY_ID = '55555555-5555-4555-8555-555555555555'
const EVENT_ID = '44444444-4444-4444-8444-444444444444'

describe('TelegramAdapter creator-only delivery boundary', () => {
  it('rejects a configuration where the private chat does not belong to the creator', () => {
    expect(
      () =>
        new TelegramAdapter({
          botToken: BOT_TOKEN,
          authorizedTelegramUserId: CREATOR_ID,
          authorizedTelegramChatId: '-100987654321',
          fetch: unusedFetch,
        }),
    ).toThrow(/creator private chat/i)
  })

  it('posts only to the configured creator chat through sendMessage', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const fetch: TelegramFetch = async (input, init) => {
      requests.push({ url: String(input), init })
      return Response.json({ ok: true, result: { message_id: 42 } })
    }
    const adapter = createAdapter(fetch)

    await expect(
      adapter.sendCreatorMessage({ recipientTelegramId: CREATOR_ID, text: 'Recovery case ready.' }),
    ).resolves.toEqual({ messageId: '42' })

    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`)
    expect(requests[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      chat_id: CREATOR_ID,
      text: 'Recovery case ready.',
      disable_web_page_preview: true,
    })
  })

  it.each(['-100987654321', '987654321'])(
    'rejects group or member recipient %s without making a request',
    async (recipientTelegramId) => {
      let requestCount = 0
      const adapter = createAdapter(async () => {
        requestCount += 1
        return Response.json({ ok: true, result: { message_id: 42 } })
      })

      await expect(
        adapter.sendCreatorMessage({ recipientTelegramId, text: 'Do not send this.' }),
      ).rejects.toMatchObject({ code: 'telegram_recipient_forbidden', retryable: false })
      expect(requestCount).toBe(0)
    },
  )

  it('reports Bot API rejection without leaking the bot token', async () => {
    const adapter = createAdapter(async () =>
      Response.json(
        { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' },
        { status: 403 },
      ),
    )

    const error = await adapter
      .sendCreatorMessage({ recipientTelegramId: CREATOR_ID, text: 'Recovery case ready.' })
      .catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'telegram_delivery_failed', retryable: false })
    expect(String(error)).not.toContain(BOT_TOKEN)
  })
})

describe('NotificationService durable delivery', () => {
  let database: DatabaseSync

  beforeEach(() => {
    database = createDatabase(':memory:')
    migrate(database)
    insertCaseEvent(database)
  })

  afterEach(() => database.close())

  it('stores only one semantic notification for an event and kind', () => {
    const repository = new NotificationDeliveryRepository(database)
    const service = createNotificationService(repository, successfulMessenger())
    const notification = initialAlert()

    expect(service.enqueue(notification)).toBe('inserted')
    expect(service.enqueue({ ...notification, id: crypto.randomUUID() })).toBe('duplicate')

    const count = database
      .prepare('SELECT COUNT(*) AS count FROM notification_deliveries')
      .get() as { count: number }
    expect(count.count).toBe(1)
  })

  it('retries a known failure on the same delivery record and stores the receipt', async () => {
    const repository = new NotificationDeliveryRepository(database)
    let attempts = 0
    const messenger: CreatorMessenger = {
      sendCreatorMessage: async () => {
        attempts += 1
        if (attempts === 1) {
          throw new OperationalError({
            code: 'telegram_delivery_failed',
            title: 'Telegram rejected delivery',
            status: 502,
            retryable: true,
          })
        }
        return { messageId: 'telegram-42' }
      },
    }
    const service = createNotificationService(repository, messenger)
    service.enqueue(initialAlert())

    await expect(service.deliver(DELIVERY_ID, initialAlert().text)).resolves.toEqual({
      status: 'failed',
      errorCode: 'telegram_delivery_failed',
    })
    await expect(service.deliver(DELIVERY_ID, initialAlert().text)).resolves.toEqual({
      status: 'sent',
      messageId: 'telegram-42',
    })

    expect(repository.findById(DELIVERY_ID)).toMatchObject({
      id: DELIVERY_ID,
      status: 'sent',
      attemptCount: 2,
      telegramMessageId: 'telegram-42',
      lastErrorCode: null,
    })
  })

  it('does not blindly retry an ambiguous delivery result', async () => {
    const repository = new NotificationDeliveryRepository(database)
    let attempts = 0
    const messenger: CreatorMessenger = {
      sendCreatorMessage: async () => {
        attempts += 1
        throw new OperationalError({
          code: 'telegram_delivery_unknown',
          title: 'Telegram result unknown',
          status: 502,
          retryable: false,
        })
      },
    }
    const service = createNotificationService(repository, messenger)
    service.enqueue(initialAlert())

    await expect(service.deliver(DELIVERY_ID, initialAlert().text)).resolves.toEqual({
      status: 'unknown',
      errorCode: 'telegram_delivery_unknown',
    })
    await expect(service.deliver(DELIVERY_ID, initialAlert().text)).resolves.toEqual({
      status: 'unknown',
      errorCode: 'telegram_delivery_unknown',
    })
    expect(attempts).toBe(1)
    expect(repository.findById(DELIVERY_ID)).toMatchObject({
      status: 'unknown',
      attemptCount: 1,
    })
  })

  it('rejects a changed payload before delivery', async () => {
    const repository = new NotificationDeliveryRepository(database)
    let attempts = 0
    const service = createNotificationService(repository, {
      sendCreatorMessage: async () => {
        attempts += 1
        return { messageId: 'should-not-send' }
      },
    })
    service.enqueue(initialAlert())

    await expect(service.deliver(DELIVERY_ID, 'Changed content')).rejects.toMatchObject({
      code: 'notification_payload_mismatch',
    })
    expect(attempts).toBe(0)
  })

  it('persists a provenance-labeled Mind payload and drains it after service restart', async () => {
    const repository = new NotificationDeliveryRepository(database)
    const sent: string[] = []
    const first = createNotificationService(repository, successfulMessenger())

    expect(
      first.enqueueMindNotification({
        id: DELIVERY_ID,
        caseEventId: EVENT_ID,
        kind: 'initial_alert',
        recipientTelegramId: CREATOR_ID,
        text: 'Recovery Case 22222222 · Needs Review',
      }),
    ).toBe('inserted')

    const restarted = createNotificationService(repository, {
      sendCreatorMessage: async ({ text }) => {
        sent.push(text)
        return { messageId: 'telegram-after-restart' }
      },
    })
    await expect(restarted.drain()).resolves.toEqual({ sent: 1, failed: 0, unknown: 0 })
    expect(sent).toEqual(['Mind inference · Recovery Case 22222222 · Needs Review'])
    expect(repository.findById(DELIVERY_ID)).toMatchObject({
      status: 'sent',
      telegramMessageId: 'telegram-after-restart',
      payloadText: 'Mind inference · Recovery Case 22222222 · Needs Review',
    })
  })

  it('keeps an ambiguous outbox result out of later drains', async () => {
    const repository = new NotificationDeliveryRepository(database)
    let attempts = 0
    const service = createNotificationService(repository, {
      sendCreatorMessage: async () => {
        attempts += 1
        throw new OperationalError({
          code: 'telegram_delivery_unknown',
          title: 'Telegram result unknown',
          status: 502,
          retryable: false,
        })
      },
    })
    service.enqueueMindNotification({
      id: DELIVERY_ID,
      caseEventId: EVENT_ID,
      kind: 'initial_alert',
      recipientTelegramId: CREATOR_ID,
      text: 'Recovery Case 22222222 · Needs Review',
    })

    await expect(service.drain()).resolves.toEqual({ sent: 0, failed: 0, unknown: 1 })
    await expect(service.drain()).resolves.toEqual({ sent: 0, failed: 0, unknown: 0 })
    expect(attempts).toBe(1)
  })

  it('claims an outbox row so concurrent drains send it only once', async () => {
    const repository = new NotificationDeliveryRepository(database)
    let attempts = 0
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const service = createNotificationService(repository, {
      sendCreatorMessage: async () => {
        attempts += 1
        await gate
        return { messageId: 'telegram-once' }
      },
    })
    service.enqueueMindNotification({
      id: DELIVERY_ID,
      caseEventId: EVENT_ID,
      kind: 'initial_alert',
      recipientTelegramId: CREATOR_ID,
      text: 'Recovery Case 22222222 · Needs Review',
    })

    const first = service.drain()
    const second = service.drain()
    release?.()
    await Promise.all([first, second])

    expect(attempts).toBe(1)
  })
})

function createAdapter(fetch: TelegramFetch): TelegramAdapter {
  return new TelegramAdapter({
    botToken: BOT_TOKEN,
    authorizedTelegramUserId: CREATOR_ID,
    authorizedTelegramChatId: CREATOR_ID,
    fetch,
  })
}

async function unusedFetch(): Promise<Response> {
  throw new Error('Unexpected Telegram request')
}

function initialAlert() {
  return {
    id: DELIVERY_ID,
    caseEventId: EVENT_ID,
    kind: 'initial_alert' as const,
    recipientTelegramId: CREATOR_ID,
    text: 'Mind inference · Recovery Case 44444444 · Needs Review',
  }
}

function createNotificationService(
  repository: NotificationDeliveryRepository,
  messenger: CreatorMessenger,
): NotificationService {
  return new NotificationService({ repository, messenger, now: () => 1_000 })
}

function successfulMessenger(): CreatorMessenger {
  return {
    sendCreatorMessage: async () => ({ messageId: 'telegram-42' }),
  }
}

function insertCaseEvent(database: DatabaseSync): void {
  const communityId = '11111111-1111-4111-8111-111111111111'
  const caseId = '22222222-2222-4222-8222-222222222222'
  database
    .prepare(
      `INSERT INTO communities
       (id, telegram_chat_ref, display_name, minds_source_alias, observation_status, timing_profile)
       VALUES (?, ?, ?, ?, 'observing', 'demo')`,
    )
    .run(communityId, 'group-ref', 'Staged Creators', 'vibecheck-community-source')
  database
    .prepare(
      `INSERT INTO recovery_cases
       (id, community_id, fracture_key, trigger, state, confidence, uncertainty, opened_at, updated_at, version)
       VALUES (?, ?, ?, 'escalating_conflict', 'needs_review', 0.82, 'Uncertain intent.', 1, 1, 1)`,
    )
    .run(caseId, communityId, 'fracture-one')
  database
    .prepare(
      `INSERT INTO case_events
       (id, case_id, idempotency_key, event_type, actor, provenance, summary,
        evidence_refs_json, from_state, to_state, occurred_at)
       VALUES (?, ?, 'case-opened', 'case_opened', 'mind', 'mind_inference', ?, '[]', NULL,
               'needs_review', 1)`,
    )
    .run(EVENT_ID, caseId, 'Mind analysis met the deterministic gate.')
}
