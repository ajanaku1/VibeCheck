import type { Conversation } from '@animocabrands/minds-client-lib'
import { z } from 'zod'

import { OperationalError } from './errors.js'

export interface LiveProbeMinds {
  getConversation(alias: string): Promise<Conversation>
}

export interface TelegramVerification {
  botUsername: string
  webhookUrl: string
  groupStatus: string
  creatorMessageId: string
}

export interface LiveProbeTelegram {
  verify(expectedWebhookUrl: string): Promise<TelegramVerification>
}

export interface LiveProbeConfig {
  engineAlias: string
  expectedWebhookUrl: string
}

export interface LiveProbeResult extends TelegramVerification {
  engineAlias: string
}

interface TelegramProbeConfig {
  botToken: string
  communityChatId: string
  authorizedUserId: string
  authorizedChatId: string
}

type FetchProbe = (url: string, init?: RequestInit) => Promise<Response>

const getMeSchema = z.object({
  ok: z.literal(true),
  result: z.object({
    id: z.number().int().safe(),
    username: z.string().min(1),
    can_read_all_group_messages: z.literal(true),
  }),
})

const webhookInfoSchema = z.object({
  ok: z.literal(true),
  result: z.object({ url: z.string() }),
})

const chatMemberSchema = z.object({
  ok: z.literal(true),
  result: z.object({ status: z.enum(['creator', 'administrator', 'member']) }),
})

const sentMessageSchema = z.object({
  ok: z.literal(true),
  result: z.object({ message_id: z.number().int() }),
})

export async function runLivePrerequisiteProbe(
  config: LiveProbeConfig,
  minds: LiveProbeMinds,
  telegram: LiveProbeTelegram,
): Promise<LiveProbeResult> {
  await minds.getConversation(config.engineAlias)
  const verification = await telegram.verify(config.expectedWebhookUrl)
  return { engineAlias: config.engineAlias, ...verification }
}

export class TelegramIntegrationProbe implements LiveProbeTelegram {
  constructor(
    private readonly config: TelegramProbeConfig,
    private readonly fetchProbe: FetchProbe = fetch,
  ) {
    if (config.authorizedChatId !== config.authorizedUserId) {
      throw new Error('The Telegram probe target must be the authorized creator private chat')
    }
  }

  async verify(expectedWebhookUrl: string): Promise<TelegramVerification> {
    const bot = await this.getBot()
    const webhook = await this.getWebhook()
    assertWebhookUrl(webhook.result.url, expectedWebhookUrl)
    const member = await this.getGroupMember(bot.result.id)
    const delivery = await this.sendCreatorProbe()
    return {
      botUsername: bot.result.username,
      webhookUrl: webhook.result.url,
      groupStatus: member.result.status,
      creatorMessageId: String(delivery.result.message_id),
    }
  }

  private getBot(): Promise<z.infer<typeof getMeSchema>> {
    return this.request('getMe', undefined, getMeSchema, 'telegram_privacy_mode_enabled')
  }

  private getWebhook(): Promise<z.infer<typeof webhookInfoSchema>> {
    return this.request(
      'getWebhookInfo', undefined, webhookInfoSchema, 'telegram_webhook_unavailable',
    )
  }

  private getGroupMember(botId: number): Promise<z.infer<typeof chatMemberSchema>> {
    return this.request(
      'getChatMember',
      { chat_id: this.config.communityChatId, user_id: botId },
      chatMemberSchema,
      'telegram_group_access_failed',
    )
  }

  private sendCreatorProbe(): Promise<z.infer<typeof sentMessageSchema>> {
    return this.request(
      'sendMessage',
      {
        chat_id: this.config.authorizedChatId,
        text: 'VibeCheck app-owned Telegram webhook probe passed. Group ingestion remains silent.',
        disable_notification: true,
      },
      sentMessageSchema,
      'telegram_creator_delivery_failed',
    )
  }

  private async request<T>(
    method: string,
    body: Record<string, unknown> | undefined,
    schema: z.ZodType<T>,
    errorCode: string,
  ): Promise<T> {
    const response = await this.fetchProbe(
      `https://api.telegram.org/bot${this.config.botToken}/${method}`,
      body
        ? {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }
        : undefined,
    )
    if (!response.ok) throw probeFailure(errorCode, `Telegram ${method} returned ${response.status}`)
    const result = schema.safeParse(await response.json())
    if (!result.success) {
      const detail =
        errorCode === 'telegram_privacy_mode_enabled'
          ? 'Telegram privacy mode must be disabled so the bot can read ordinary group messages'
          : `Telegram ${method} returned an invalid response`
      throw probeFailure(errorCode, detail)
    }
    return result.data
  }
}

function assertWebhookUrl(actual: string, expected: string): void {
  if (actual === expected) return
  throw probeFailure(
    'telegram_webhook_mismatch',
    `Telegram is configured for ${actual || 'no webhook'} instead of ${expected}`,
  )
}

function probeFailure(code: string, detail: string): OperationalError {
  return new OperationalError({
    code,
    title: 'Live integration probe failed',
    status: 503,
    detail,
    retryable: true,
  })
}
