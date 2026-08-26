import { describe, expect, it, vi } from 'vitest'

import { setTelegramWebhook } from '../../scripts/configure-telegram-webhook.js'

describe('Telegram webhook configuration', () => {
  it('registers the authenticated message-only webhook without discarding pending updates', async () => {
    const fetchProbe = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await setTelegramWebhook(
      {
        botToken: '123456:secret-token',
        appBaseUrl: 'https://vibecheck.example/',
        webhookSecret: 'telegram-webhook-secret-at-least-32-characters',
      },
      fetchProbe,
    )

    expect(fetchProbe).toHaveBeenCalledOnce()
    const [url, init] = fetchProbe.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.telegram.org/bot123456:secret-token/setWebhook')
    expect(JSON.parse(String(init.body))).toEqual({
      url: 'https://vibecheck.example/api/telegram/webhook',
      secret_token: 'telegram-webhook-secret-at-least-32-characters',
      allowed_updates: ['message'],
      drop_pending_updates: false,
    })
  })

  it('fails closed on an unsuccessful Telegram response', async () => {
    const fetchProbe = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, description: 'Bad Request' }), { status: 400 }),
    )

    await expect(
      setTelegramWebhook(
        {
          botToken: '123456:secret-token',
          appBaseUrl: 'https://vibecheck.example',
          webhookSecret: 'telegram-webhook-secret-at-least-32-characters',
        },
        fetchProbe,
      ),
    ).rejects.toThrow(/setWebhook.*400/i)
  })
})
