import { isAbsolute } from 'node:path'

import { z } from 'zod'

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_BASE_URL: z.url(),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_PATH: z.string().trim().min(1),
  SESSION_SECRET: z.string().min(32),
  VIBECHECK_TIMING_PROFILE: z.enum(['demo', 'standard']),
  TELEGRAM_BOT_TOKEN: z.string().trim().min(1),
  TELEGRAM_BOT_USERNAME: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{4,31}$/),
  TELEGRAM_COMMUNITY_CHAT_ID: z.string().regex(/^-[1-9]\d+$/),
  TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/),
  AUTHORIZED_TELEGRAM_USER_ID: z.string().regex(/^\d+$/),
  AUTHORIZED_TELEGRAM_CHAT_ID: z.string().regex(/^-?\d+$/),
  MINDS_BUILDER_API_KEY: z.string().trim().min(1),
  MINDS_MIND_ID: z.uuid(),
  MINDS_ENGINE_ALIAS: z.string().trim().min(1).default('vibecheck-engine'),
  MINDS_REPLY_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
})

const liveProbeEnvironmentSchema = environmentSchema.pick({
  APP_BASE_URL: true,
  TELEGRAM_BOT_TOKEN: true,
  TELEGRAM_COMMUNITY_CHAT_ID: true,
  TELEGRAM_WEBHOOK_SECRET: true,
  AUTHORIZED_TELEGRAM_USER_ID: true,
  AUTHORIZED_TELEGRAM_CHAT_ID: true,
  MINDS_BUILDER_API_KEY: true,
  MINDS_ENGINE_ALIAS: true,
  MINDS_REPLY_TIMEOUT_MS: true,
})

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production'
  appBaseUrl: string
  port: number
  databasePath: string
  sessionSecret: string
  timingProfile: 'demo' | 'standard'
  telegramBotToken: string
  telegramBotUsername: string
  telegramCommunityChatId: string
  telegramWebhookSecret: string
  authorizedTelegramUserId: string
  authorizedTelegramChatId: string
  mindsBuilderApiKey: string
  mindsMindId: string
  mindsEngineAlias: string
  mindsReplyTimeoutMs: number
}

export interface LiveProbeConfig {
  appBaseUrl: string
  telegramBotToken: string
  telegramCommunityChatId: string
  telegramWebhookSecret: string
  authorizedTelegramUserId: string
  authorizedTelegramChatId: string
  mindsBuilderApiKey: string
  mindsEngineAlias: string
  mindsReplyTimeoutMs: number
}

function isEphemeralPath(path: string): boolean {
  return path === '/tmp' || path.startsWith('/tmp/') || path.startsWith('/private/tmp/')
}

function validateProductionPaths(env: z.infer<typeof environmentSchema>): void {
  if (env.NODE_ENV !== 'production') return

  if (!env.APP_BASE_URL.startsWith('https://')) {
    throw new Error('APP_BASE_URL must use HTTPS in production')
  }
  if (!isAbsolute(env.DATABASE_PATH) || isEphemeralPath(env.DATABASE_PATH)) {
    throw new Error('DATABASE_PATH must point to durable absolute storage in production')
  }
}

function validateCreatorPrivateChat(userId: string, chatId: string): void {
  if (userId !== chatId) {
    throw new Error('AUTHORIZED_TELEGRAM_CHAT_ID must equal the creator private user ID')
  }
}

export function loadConfig(input: NodeJS.ProcessEnv): AppConfig {
  const env = environmentSchema.parse(input)
  validateProductionPaths(env)
  validateCreatorPrivateChat(env.AUTHORIZED_TELEGRAM_USER_ID, env.AUTHORIZED_TELEGRAM_CHAT_ID)

  return {
    nodeEnv: env.NODE_ENV,
    appBaseUrl: env.APP_BASE_URL,
    port: env.PORT,
    databasePath: env.DATABASE_PATH,
    sessionSecret: env.SESSION_SECRET,
    timingProfile: env.VIBECHECK_TIMING_PROFILE,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    telegramBotUsername: env.TELEGRAM_BOT_USERNAME,
    telegramCommunityChatId: env.TELEGRAM_COMMUNITY_CHAT_ID,
    telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
    authorizedTelegramUserId: env.AUTHORIZED_TELEGRAM_USER_ID,
    authorizedTelegramChatId: env.AUTHORIZED_TELEGRAM_CHAT_ID,
    mindsBuilderApiKey: env.MINDS_BUILDER_API_KEY,
    mindsMindId: env.MINDS_MIND_ID,
    mindsEngineAlias: env.MINDS_ENGINE_ALIAS,
    mindsReplyTimeoutMs: env.MINDS_REPLY_TIMEOUT_MS,
  }
}

export function loadLiveProbeConfig(input: NodeJS.ProcessEnv): LiveProbeConfig {
  const env = liveProbeEnvironmentSchema.parse(input)
  validateCreatorPrivateChat(env.AUTHORIZED_TELEGRAM_USER_ID, env.AUTHORIZED_TELEGRAM_CHAT_ID)
  return {
    appBaseUrl: env.APP_BASE_URL,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    telegramCommunityChatId: env.TELEGRAM_COMMUNITY_CHAT_ID,
    telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
    authorizedTelegramUserId: env.AUTHORIZED_TELEGRAM_USER_ID,
    authorizedTelegramChatId: env.AUTHORIZED_TELEGRAM_CHAT_ID,
    mindsBuilderApiKey: env.MINDS_BUILDER_API_KEY,
    mindsEngineAlias: env.MINDS_ENGINE_ALIAS,
    mindsReplyTimeoutMs: env.MINDS_REPLY_TIMEOUT_MS,
  }
}
