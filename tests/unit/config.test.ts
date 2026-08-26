import { describe, expect, it } from 'vitest'

import { loadConfig, loadLiveProbeConfig } from '../../src/server/config.js'

const VALID_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  APP_BASE_URL: 'https://vibecheck.example',
  PORT: '3000',
  DATABASE_PATH: '/var/lib/vibecheck/vibecheck.sqlite',
  SESSION_SECRET: 'a-secure-random-session-secret-with-32-chars',
  VIBECHECK_TIMING_PROFILE: 'demo',
  TELEGRAM_BOT_TOKEN: '123456:telegram-secret',
  TELEGRAM_BOT_USERNAME: 'VibeCheckBot',
  TELEGRAM_COMMUNITY_CHAT_ID: '-1001234567890',
  TELEGRAM_WEBHOOK_SECRET: 'telegram-webhook-secret-at-least-32-characters',
  AUTHORIZED_TELEGRAM_USER_ID: '123456789',
  AUTHORIZED_TELEGRAM_CHAT_ID: '123456789',
  MINDS_BUILDER_API_KEY: 'minds-builder-key',
  MINDS_MIND_ID: '7b2a503e-f36b-1410-8465-00039ce7df11',
  MINDS_ENGINE_ALIAS: 'vibecheck-engine',
  MINDS_REPLY_TIMEOUT_MS: '180000',
}

function environment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...VALID_ENV, ...overrides }
}

describe('loadConfig', () => {
  it('returns typed settings for a valid production environment', () => {
    const config = loadConfig(environment())

    expect(config.port).toBe(3000)
    expect(config.timingProfile).toBe('demo')
    expect(config.authorizedTelegramUserId).toBe('123456789')
    expect(config.telegramCommunityChatId).toBe('-1001234567890')
    expect(config.mindsReplyTimeoutMs).toBe(180000)
  })

  it('names every missing integration credential', () => {
    expect(() => loadConfig(environment({ TELEGRAM_BOT_TOKEN: '' }))).toThrow(
      /TELEGRAM_BOT_TOKEN/,
    )
    expect(() => loadConfig(environment({ MINDS_BUILDER_API_KEY: '' }))).toThrow(
      /MINDS_BUILDER_API_KEY/,
    )
  })

  it('requires numeric creator user and chat allowlists', () => {
    expect(() =>
      loadConfig(environment({ AUTHORIZED_TELEGRAM_USER_ID: '@creator' })),
    ).toThrow(/AUTHORIZED_TELEGRAM_USER_ID/)
    expect(() =>
      loadConfig(environment({ AUTHORIZED_TELEGRAM_CHAT_ID: 'chat-one' })),
    ).toThrow(/AUTHORIZED_TELEGRAM_CHAT_ID/)
    expect(() =>
      loadConfig(environment({ AUTHORIZED_TELEGRAM_CHAT_ID: '987654321' })),
    ).toThrow(/AUTHORIZED_TELEGRAM_CHAT_ID/)
  })

  it('requires a distinct Telegram group and a strong webhook secret', () => {
    expect(() =>
      loadConfig(environment({ TELEGRAM_COMMUNITY_CHAT_ID: '123456789' })),
    ).toThrow(/TELEGRAM_COMMUNITY_CHAT_ID/)
    expect(() =>
      loadConfig(environment({ TELEGRAM_WEBHOOK_SECRET: 'too-short' })),
    ).toThrow(/TELEGRAM_WEBHOOK_SECRET/)
  })

  it('rejects an unknown timing profile', () => {
    expect(() =>
      loadConfig(environment({ VIBECHECK_TIMING_PROFILE: 'fast' })),
    ).toThrow(/VIBECHECK_TIMING_PROFILE/)
  })

  it('requires HTTPS for a production public origin', () => {
    expect(() =>
      loadConfig(environment({ APP_BASE_URL: 'http://vibecheck.example' })),
    ).toThrow(/APP_BASE_URL/)
  })

  it.each(['/tmp/vibecheck.sqlite', 'relative/vibecheck.sqlite']) (
    'rejects non-durable production database path %s',
    (databasePath) => {
      expect(() =>
        loadConfig(environment({ DATABASE_PATH: databasePath })),
      ).toThrow(/DATABASE_PATH/)
    },
  )
})

describe('loadLiveProbeConfig', () => {
  it('requires only live integration and creator-target settings', () => {
    expect(
      loadLiveProbeConfig({
        TELEGRAM_BOT_TOKEN: '123456:telegram-secret',
        APP_BASE_URL: 'https://vibecheck.example',
        TELEGRAM_COMMUNITY_CHAT_ID: '-1001234567890',
        TELEGRAM_WEBHOOK_SECRET: 'telegram-webhook-secret-at-least-32-characters',
        AUTHORIZED_TELEGRAM_USER_ID: '123456789',
        AUTHORIZED_TELEGRAM_CHAT_ID: '123456789',
        MINDS_BUILDER_API_KEY: 'minds-builder-key',
        MINDS_ENGINE_ALIAS: 'vibecheck-engine',
        MINDS_REPLY_TIMEOUT_MS: '30000',
      }),
    ).toEqual({
      telegramBotToken: '123456:telegram-secret',
      appBaseUrl: 'https://vibecheck.example',
      telegramCommunityChatId: '-1001234567890',
      telegramWebhookSecret: 'telegram-webhook-secret-at-least-32-characters',
      authorizedTelegramUserId: '123456789',
      authorizedTelegramChatId: '123456789',
      mindsBuilderApiKey: 'minds-builder-key',
      mindsEngineAlias: 'vibecheck-engine',
      mindsReplyTimeoutMs: 30_000,
    })
  })
})
