import { describe, expect, it, vi } from 'vitest'

import {
  runLivePrerequisiteProbe,
  TelegramIntegrationProbe,
  type LiveProbeMinds,
  type LiveProbeTelegram,
} from '../../src/server/live-probe.js'

describe('live prerequisite probe', () => {
  it('checks only the stable Minds engine and the app-owned Telegram webhook', async () => {
    const minds: LiveProbeMinds = {
      getConversation: vi.fn().mockResolvedValue({
        conversationId: 'engine-conversation',
        alias: 'vibecheck-engine',
      }),
    }
    const telegram: LiveProbeTelegram = {
      verify: vi.fn().mockResolvedValue({
        botUsername: 'VibeCheckBot',
        webhookUrl: 'https://vibecheck.example/api/telegram/webhook',
        groupStatus: 'member',
        creatorMessageId: '42',
      }),
    }

    await expect(
      runLivePrerequisiteProbe(
        {
          engineAlias: 'vibecheck-engine',
          expectedWebhookUrl: 'https://vibecheck.example/api/telegram/webhook',
        },
        minds,
        telegram,
      ),
    ).resolves.toMatchObject({ engineAlias: 'vibecheck-engine', creatorMessageId: '42' })
    expect(minds.getConversation).toHaveBeenCalledWith('vibecheck-engine')
    expect(telegram.verify).toHaveBeenCalledWith(
      'https://vibecheck.example/api/telegram/webhook',
    )
  })

  it('verifies group read access and sends only to the creator private chat', async () => {
    const requests: Array<{ url: string; body?: Record<string, unknown> }> = []
    const responses = [
      { ok: true, result: { id: 777, username: 'VibeCheckBot', can_read_all_group_messages: true } },
      { ok: true, result: { url: 'https://vibecheck.example/api/telegram/webhook', pending_update_count: 0 } },
      { ok: true, result: { status: 'member' } },
      { ok: true, result: { message_id: 42 } },
    ]
    const fetchProbe = vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({
        url,
        ...(init?.body ? { body: JSON.parse(String(init.body)) as Record<string, unknown> } : {}),
      })
      return new Response(JSON.stringify(responses.shift()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    const telegram = new TelegramIntegrationProbe(
      {
        botToken: '123456:secret-token',
        communityChatId: '-1001234567890',
        authorizedUserId: '123456789',
        authorizedChatId: '123456789',
      },
      fetchProbe,
    )

    await expect(
      telegram.verify('https://vibecheck.example/api/telegram/webhook'),
    ).resolves.toEqual({
      botUsername: 'VibeCheckBot',
      webhookUrl: 'https://vibecheck.example/api/telegram/webhook',
      groupStatus: 'member',
      creatorMessageId: '42',
    })
    expect(requests[2]?.body).toEqual({ chat_id: '-1001234567890', user_id: 777 })
    expect(requests[3]?.body).toMatchObject({ chat_id: '123456789' })
    expect(requests.filter(({ body }) => body?.chat_id === '-1001234567890')).toHaveLength(1)
  })

  it('fails when BotFather privacy mode prevents reading ordinary group messages', async () => {
    const fetchProbe = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, result: { id: 777, username: 'VibeCheckBot' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const telegram = new TelegramIntegrationProbe(
      {
        botToken: '123456:secret-token',
        communityChatId: '-1001234567890',
        authorizedUserId: '123456789',
        authorizedChatId: '123456789',
      },
      fetchProbe,
    )

    await expect(
      telegram.verify('https://vibecheck.example/api/telegram/webhook'),
    ).rejects.toThrow(/privacy mode/i)
    expect(fetchProbe).toHaveBeenCalledOnce()
  })
})
