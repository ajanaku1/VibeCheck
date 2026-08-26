import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

import { z } from 'zod'

import { telegramAuthPayloadSchema } from '../../domain/validation.js'

export type TelegramLoginPayload = z.infer<typeof telegramAuthPayloadSchema>

export interface VerifiedTelegramIdentity {
  telegramUserId: string
  displayName: string
  username: string | null
  photoUrl: string | null
}

export interface TelegramAuthConfig {
  botToken: string
  authorizedTelegramUserId: string
  maxAgeSeconds: number
  maxFutureSkewSeconds: number
  now?: () => number
}

export type TelegramAuthResult =
  | { status: 'authorized'; identity: VerifiedTelegramIdentity }
  | { status: 'unauthorized'; identity: VerifiedTelegramIdentity }
  | {
      status: 'invalid'
      reason: 'malformed_payload' | 'invalid_signature' | 'expired_payload' | 'future_payload'
    }

export function verifyTelegramAuth(
  input: unknown,
  config: TelegramAuthConfig,
): TelegramAuthResult {
  const parsed = telegramAuthPayloadSchema.safeParse(input)
  if (!parsed.success) return { status: 'invalid', reason: 'malformed_payload' }

  const payload = parsed.data
  const expectedHash = telegramPayloadHash(payload, config.botToken)
  if (!constantTimeEqualHex(expectedHash, payload.hash)) {
    return { status: 'invalid', reason: 'invalid_signature' }
  }

  const nowSeconds = Math.floor((config.now ?? Date.now)() / 1_000)
  const ageSeconds = nowSeconds - payload.auth_date
  if (ageSeconds > config.maxAgeSeconds) {
    return { status: 'invalid', reason: 'expired_payload' }
  }
  if (ageSeconds < -config.maxFutureSkewSeconds) {
    return { status: 'invalid', reason: 'future_payload' }
  }

  const identity = toIdentity(payload)
  return payload.id === config.authorizedTelegramUserId
    ? { status: 'authorized', identity }
    : { status: 'unauthorized', identity }
}

export function constantTimeEqualHex(expected: string, actual: string): boolean {
  if (!isSha256Hex(expected) || !isSha256Hex(actual)) return false
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'))
}

function telegramPayloadHash(payload: TelegramLoginPayload, botToken: string): string {
  const secret = createHash('sha256').update(botToken).digest()
  return createHmac('sha256', secret).update(dataCheckString(payload)).digest('hex')
}

function dataCheckString(payload: TelegramLoginPayload): string {
  return Object.entries(payload)
    .filter(([key, value]) => key !== 'hash' && value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('\n')
}

function toIdentity(payload: TelegramLoginPayload): VerifiedTelegramIdentity {
  return {
    telegramUserId: payload.id,
    displayName: [payload.first_name, payload.last_name].filter(Boolean).join(' '),
    username: payload.username ?? null,
    photoUrl: payload.photo_url ?? null,
  }
}

function isSha256Hex(value: string): boolean {
  return /^[a-f\d]{64}$/i.test(value)
}
