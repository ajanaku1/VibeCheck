import { createHash, createHmac, randomUUID } from 'node:crypto'

import { z } from 'zod'

import type { ObservationRepository } from '../db/repositories/observation-repository.js'

const telegramMessageSchema = z.object({
  message_id: z.number().int().nonnegative(),
  date: z.number().int().nonnegative(),
  chat: z.object({
    id: z.number().int().safe(),
    type: z.enum(['private', 'group', 'supergroup', 'channel']),
  }),
  from: z.object({
    id: z.number().int().safe(),
    is_bot: z.boolean(),
    first_name: z.string().max(256),
    last_name: z.string().max(256).optional(),
    username: z.string().max(64).optional(),
  }),
  text: z.string().max(4_096),
})

const telegramUpdateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: telegramMessageSchema.optional(),
})

interface TelegramWebhookReceiverDependencies {
  observations: ObservationRepository
  status?: { markObserving(communityId: string, observedAt: number): void }
  communityId: string
  communityChatId: string
  authorizedCreatorUserId: string
  authorizedCreatorChatId: string
  memberHashKey: string
  now?: () => number
  idFactory?: () => string
}

export type TelegramReceiveResult = { status: 'inserted' | 'duplicate' | 'ignored' }

export class TelegramWebhookReceiver {
  private readonly now: () => number
  private readonly idFactory: () => string

  constructor(private readonly dependencies: TelegramWebhookReceiverDependencies) {
    this.now = dependencies.now ?? Date.now
    this.idFactory = dependencies.idFactory ?? randomUUID
  }

  async receive(input: unknown): Promise<TelegramReceiveResult> {
    const parsed = telegramUpdateSchema.safeParse(input)
    if (!parsed.success || !parsed.data.message) return { status: 'ignored' }
    const message = parsed.data.message
    const text = message.text.trim()
    if (message.from.is_bot || text.length === 0) return { status: 'ignored' }

    const chatId = String(message.chat.id)
    if (isCommunityMessage(chatId, message.chat.type, this.dependencies.communityChatId)) {
      return { status: this.persistCommunityMessage(message, text, chatId) }
    }
    if (isCreatorMessage(message, chatId, this.dependencies)) {
      return { status: this.persistCreatorMessage(message, text, chatId) }
    }
    return { status: 'ignored' }
  }

  private persistCommunityMessage(
    message: z.infer<typeof telegramMessageSchema>,
    text: string,
    chatId: string,
  ): 'inserted' | 'duplicate' {
    const ingestedAt = this.now()
    const disposition = this.dependencies.observations.appendHumanWithWork(
      this.observation(message, text, chatId, 'telegram_webhook_group', ingestedAt),
      {
        id: this.idFactory(),
        communityId: this.dependencies.communityId,
        externalRefHash: createHmac('sha256', this.dependencies.memberHashKey)
          .update(String(message.from.id))
          .digest('hex'),
        displayLabel: displayName(message.from),
        activeAt: message.date * 1_000,
      },
      'community',
    )
    this.dependencies.status?.markObserving(
      this.dependencies.communityId,
      message.date * 1_000,
    )
    return disposition
  }

  private persistCreatorMessage(
    message: z.infer<typeof telegramMessageSchema>,
    text: string,
    chatId: string,
  ): 'inserted' | 'duplicate' {
    const ingestedAt = this.now()
    return this.dependencies.observations.appendWithWork(
      {
        ...this.observation(message, text, chatId, 'telegram_webhook_creator', ingestedAt),
        memberRefId: null,
      },
      'creator',
    )
  }

  private observation(
    message: z.infer<typeof telegramMessageSchema>,
    text: string,
    chatId: string,
    source: 'telegram_webhook_group' | 'telegram_webhook_creator',
    ingestedAt: number,
  ) {
    return {
      id: this.idFactory(),
      communityId: this.dependencies.communityId,
      source,
      sourceFingerprint: `telegram:${chatId}:${message.message_id}`,
      sessionRef: `telegram:${chatId}`,
      occurredAt: message.date * 1_000,
      ingestedAt,
      evidenceExcerpt: text.slice(0, 500),
      contentDigest: createHash('sha256').update(text).digest('hex'),
      visibility: 'internal' as const,
    }
  }
}

function isCommunityMessage(chatId: string, chatType: string, configuredChatId: string): boolean {
  return (chatType === 'group' || chatType === 'supergroup') && chatId === configuredChatId
}

function isCreatorMessage(
  message: z.infer<typeof telegramMessageSchema>,
  chatId: string,
  config: Pick<
    TelegramWebhookReceiverDependencies,
    'authorizedCreatorChatId' | 'authorizedCreatorUserId'
  >,
): boolean {
  return (
    message.chat.type === 'private' &&
    chatId === config.authorizedCreatorChatId &&
    String(message.from.id) === config.authorizedCreatorUserId
  )
}

function displayName(sender: z.infer<typeof telegramMessageSchema>['from']): string {
  return [sender.first_name, sender.last_name].filter(Boolean).join(' ').slice(0, 256)
}
