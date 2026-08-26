import type { DatabaseSync } from 'node:sqlite'

import type { DeliveryStatus, NotificationKind } from '../../../domain/types.js'

export interface NewNotificationDelivery {
  id: string
  caseEventId: string
  kind: NotificationKind
  recipientTelegramId: string
  payloadDigest: string
  payloadText?: string
}

export interface StoredNotificationDelivery extends NewNotificationDelivery {
  payloadText: string
  status: DeliveryStatus
  attemptCount: number
  telegramMessageId: string | null
  lastAttemptAt: number | null
  lastErrorCode: string | null
}

export interface DeliveryResultUpdate {
  status: Exclude<DeliveryStatus, 'pending' | 'processing'>
  telegramMessageId: string | null
  errorCode: string | null
}

interface DeliveryRow {
  id: string
  case_event_id: string
  kind: NotificationKind
  recipient_telegram_id: string
  payload_digest: string
  payload_text: string
  status: DeliveryStatus
  attempt_count: number
  telegram_message_id: string | null
  last_attempt_at: number | null
  last_error_code: string | null
}

export class NotificationDeliveryRepository {
  constructor(private readonly database: DatabaseSync) {}

  enqueue(delivery: NewNotificationDelivery): 'inserted' | 'duplicate' {
    const result = this.database
      .prepare(
        `INSERT INTO notification_deliveries
         (id, case_event_id, kind, recipient_telegram_id, payload_digest, payload_text,
          status, attempt_count)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', 0)
         ON CONFLICT(case_event_id, kind) DO NOTHING`,
      )
      .run(
        delivery.id,
        delivery.caseEventId,
        delivery.kind,
        delivery.recipientTelegramId,
        delivery.payloadDigest,
        delivery.payloadText ?? '',
      )
    return Number(result.changes) === 0 ? 'duplicate' : 'inserted'
  }

  findById(id: string): StoredNotificationDelivery | null {
    const row = this.database
      .prepare(`${DELIVERY_SELECT} WHERE id = ?`)
      .get(id) as DeliveryRow | undefined
    return row ? mapDelivery(row) : null
  }

  findByEventAndKind(
    caseEventId: string,
    kind: NotificationKind,
  ): StoredNotificationDelivery | null {
    const row = this.database
      .prepare(`${DELIVERY_SELECT} WHERE case_event_id = ? AND kind = ?`)
      .get(caseEventId, kind) as DeliveryRow | undefined
    return row ? mapDelivery(row) : null
  }

  listDeliverable(limit: number): StoredNotificationDelivery[] {
    const rows = this.database
      .prepare(
        `${DELIVERY_SELECT}
         WHERE status IN ('pending', 'failed')
         ORDER BY rowid
         LIMIT ?`,
      )
      .all(limit) as unknown as DeliveryRow[]
    return rows.map(mapDelivery)
  }

  claimAttempt(id: string, attemptedAt: number): boolean {
    const result = this.database
      .prepare(
        `UPDATE notification_deliveries
         SET status = 'processing', attempt_count = attempt_count + 1, last_attempt_at = ?
         WHERE id = ? AND status IN ('pending', 'failed')`,
      )
      .run(attemptedAt, id)
    return Number(result.changes) === 1
  }

  recordResult(id: string, update: DeliveryResultUpdate): void {
    this.database
      .prepare(
        `UPDATE notification_deliveries
         SET status = ?, telegram_message_id = ?, last_error_code = ?
         WHERE id = ? AND status = 'processing'`,
      )
      .run(update.status, update.telegramMessageId, update.errorCode, id)
  }
}

const DELIVERY_SELECT = `SELECT id, case_event_id, kind, recipient_telegram_id, payload_digest,
                                payload_text,
                                status, attempt_count, telegram_message_id, last_attempt_at,
                                last_error_code
                         FROM notification_deliveries`

function mapDelivery(row: DeliveryRow): StoredNotificationDelivery {
  return {
    id: row.id,
    caseEventId: row.case_event_id,
    kind: row.kind,
    recipientTelegramId: row.recipient_telegram_id,
    payloadDigest: row.payload_digest,
    payloadText: row.payload_text,
    status: row.status,
    attemptCount: row.attempt_count,
    telegramMessageId: row.telegram_message_id,
    lastAttemptAt: row.last_attempt_at,
    lastErrorCode: row.last_error_code,
  }
}
