import { createHash } from 'node:crypto'

import type { NotificationKind } from '../../domain/types.js'
import type {
  NotificationDeliveryRepository,
  StoredNotificationDelivery,
} from '../db/repositories/notification-delivery-repository.js'
import { OperationalError } from '../errors.js'
import type { CreatorMessage, TelegramDeliveryReceipt } from '../integrations/telegram-adapter.js'

export interface CreatorMessenger {
  sendCreatorMessage(message: CreatorMessage): Promise<TelegramDeliveryReceipt>
}

interface NotificationServiceDependencies {
  repository: NotificationDeliveryRepository
  messenger: CreatorMessenger
  now?: () => number
}

export interface QueuedNotification {
  id: string
  caseEventId: string
  kind: NotificationKind
  recipientTelegramId: string
  text: string
}

export type DeliveryOutcome =
  | { status: 'sent'; messageId: string }
  | { status: 'unknown' | 'failed'; errorCode: string }

export class NotificationService {
  private readonly now: () => number

  constructor(private readonly dependencies: NotificationServiceDependencies) {
    this.now = dependencies.now ?? Date.now
  }

  enqueue(notification: QueuedNotification): 'inserted' | 'duplicate' {
    const payloadDigest = digestPayload(notification.text)
    const result = this.dependencies.repository.enqueue({
      id: notification.id,
      caseEventId: notification.caseEventId,
      kind: notification.kind,
      recipientTelegramId: notification.recipientTelegramId,
      payloadDigest,
      payloadText: notification.text,
    })
    if (result === 'duplicate') this.assertDuplicateMatches(notification, payloadDigest)
    return result
  }

  enqueueMindNotification(notification: QueuedNotification): 'inserted' | 'duplicate' {
    return this.enqueue({
      ...notification,
      text: `Mind inference · ${notification.text}`,
    })
  }

  async drain(limit = 10): Promise<{ sent: number; failed: number; unknown: number }> {
    const deliveries = this.dependencies.repository.listDeliverable(limit)
    const summary = { sent: 0, failed: 0, unknown: 0 }
    for (const delivery of deliveries) {
      const outcome = await this.deliver(delivery.id, delivery.payloadText)
      summary[outcome.status] += 1
    }
    return summary
  }

  async deliver(deliveryId: string, text: string): Promise<DeliveryOutcome> {
    const delivery = this.requireDelivery(deliveryId)
    this.assertPayload(delivery, text)
    const settled = settledOutcome(delivery)
    if (settled) return settled

    if (!this.dependencies.repository.claimAttempt(deliveryId, this.now())) {
      return { status: 'failed', errorCode: 'notification_already_claimed' }
    }
    try {
      const receipt = await this.dependencies.messenger.sendCreatorMessage({
        recipientTelegramId: delivery.recipientTelegramId,
        text,
      })
      this.recordSent(deliveryId, receipt.messageId)
      return { status: 'sent', messageId: receipt.messageId }
    } catch (error) {
      return this.recordFailure(deliveryId, error)
    }
  }

  private requireDelivery(id: string): StoredNotificationDelivery {
    const delivery = this.dependencies.repository.findById(id)
    if (delivery) return delivery
    throw notificationError('notification_not_found', 404)
  }

  private assertPayload(delivery: StoredNotificationDelivery, text: string): void {
    if (delivery.payloadDigest === digestPayload(text)) return
    throw notificationError('notification_payload_mismatch', 409)
  }

  private assertDuplicateMatches(notification: QueuedNotification, payloadDigest: string): void {
    const existing = this.dependencies.repository.findByEventAndKind(
      notification.caseEventId,
      notification.kind,
    )
    if (
      existing?.payloadDigest === payloadDigest &&
      existing.recipientTelegramId === notification.recipientTelegramId
    ) {
      return
    }
    throw notificationError('notification_semantic_conflict', 409)
  }

  private recordSent(deliveryId: string, messageId: string): void {
    this.dependencies.repository.recordResult(deliveryId, {
      status: 'sent',
      telegramMessageId: messageId,
      errorCode: null,
    })
  }

  private recordFailure(deliveryId: string, error: unknown): DeliveryOutcome {
    const errorCode = error instanceof OperationalError ? error.code : 'telegram_delivery_failed'
    const status = errorCode === 'telegram_delivery_unknown' ? 'unknown' : 'failed'
    this.dependencies.repository.recordResult(deliveryId, {
      status,
      telegramMessageId: null,
      errorCode,
    })
    return { status, errorCode }
  }
}

function digestPayload(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function settledOutcome(delivery: StoredNotificationDelivery): DeliveryOutcome | null {
  if (delivery.status === 'sent' && delivery.telegramMessageId) {
    return { status: 'sent', messageId: delivery.telegramMessageId }
  }
  if (delivery.status === 'unknown') {
    return {
      status: 'unknown',
      errorCode: delivery.lastErrorCode ?? 'telegram_delivery_unknown',
    }
  }
  return null
}

function notificationError(code: string, status: number): OperationalError {
  return new OperationalError({
    code,
    title: 'Notification delivery rejected',
    status,
    retryable: false,
  })
}
