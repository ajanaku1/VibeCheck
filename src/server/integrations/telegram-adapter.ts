import { z } from 'zod'

import { OperationalError } from '../errors.js'

export type TelegramFetch = typeof fetch

interface TelegramAdapterConfig {
  botToken: string
  authorizedTelegramUserId: string
  authorizedTelegramChatId: string
  fetch?: TelegramFetch
}

export interface CreatorMessage {
  recipientTelegramId: string
  text: string
}

export interface TelegramDeliveryReceipt {
  messageId: string
}

const telegramResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), result: z.object({ message_id: z.number().int() }) }),
  z.object({
    ok: z.literal(false),
    error_code: z.number().int(),
    description: z.string(),
  }),
])

export class TelegramAdapter {
  private readonly fetch: TelegramFetch

  constructor(private readonly config: TelegramAdapterConfig) {
    if (config.authorizedTelegramUserId !== config.authorizedTelegramChatId) {
      throw new Error('AUTHORIZED_TELEGRAM_CHAT_ID must be the creator private chat')
    }
    this.fetch = config.fetch ?? globalThis.fetch
  }

  async sendCreatorMessage(message: CreatorMessage): Promise<TelegramDeliveryReceipt> {
    this.assertCreatorRecipient(message.recipientTelegramId)

    let response: Response
    try {
      response = await this.fetch(this.sendMessageUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.config.authorizedTelegramChatId,
          text: message.text,
          disable_web_page_preview: true,
        }),
      })
    } catch (cause) {
      throw telegramError('telegram_delivery_unknown', true, cause)
    }

    return parseDeliveryResponse(response)
  }

  private assertCreatorRecipient(recipientTelegramId: string): void {
    if (recipientTelegramId === this.config.authorizedTelegramUserId) return
    throw telegramError('telegram_recipient_forbidden', false)
  }

  private sendMessageUrl(): string {
    return `https://api.telegram.org/bot${this.config.botToken}/sendMessage`
  }
}

async function parseDeliveryResponse(response: Response): Promise<TelegramDeliveryReceipt> {
  let body: unknown
  try {
    body = await response.json()
  } catch (cause) {
    throw telegramError('telegram_invalid_response', true, cause)
  }

  const parsed = telegramResponseSchema.safeParse(body)
  if (!parsed.success) throw telegramError('telegram_invalid_response', true)
  if (!parsed.data.ok) {
    throw telegramError('telegram_delivery_failed', parsed.data.error_code === 429)
  }
  return { messageId: String(parsed.data.result.message_id) }
}

function telegramError(code: string, retryable: boolean, cause?: unknown): OperationalError {
  return new OperationalError({
    code,
    title: 'Telegram delivery failed',
    status: code === 'telegram_recipient_forbidden' ? 403 : 502,
    retryable,
    cause,
  })
}
