import { createHash, createHmac } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  constantTimeEqualHex,
  verifyTelegramAuth,
  type TelegramLoginPayload,
} from '../../src/server/auth/telegram-auth.js'

const BOT_TOKEN = '123456:telegram-bot-secret'
const NOW = Date.parse('2026-08-17T12:00:00.000Z')
const NOW_SECONDS = Math.floor(NOW / 1_000)

describe('Telegram Login verification', () => {
  it('accepts a correctly signed fresh payload for the exact configured creator ID', () => {
    const payload = signedPayload({
      id: '42',
      first_name: 'Ada',
      last_name: 'Lovelace',
      username: 'ada',
      auth_date: NOW_SECONDS - 30,
    })

    expect(verifyTelegramAuth(payload, authConfig())).toEqual({
      status: 'authorized',
      identity: {
        telegramUserId: '42',
        displayName: 'Ada Lovelace',
        username: 'ada',
        photoUrl: null,
      },
    })
  })

  it('rejects tampering and signatures made with another bot token', () => {
    const valid = signedPayload({ id: '42', first_name: 'Ada', auth_date: NOW_SECONDS })
    const wrongSecret = signedPayload(
      { id: '42', first_name: 'Ada', auth_date: NOW_SECONDS },
      '999999:different-secret',
    )

    expect(verifyTelegramAuth({ ...valid, first_name: 'Mallory' }, authConfig())).toEqual({
      status: 'invalid',
      reason: 'invalid_signature',
    })
    expect(verifyTelegramAuth(wrongSecret, authConfig())).toEqual({
      status: 'invalid',
      reason: 'invalid_signature',
    })
  })

  it('rejects expired and implausibly future-dated payloads at exact boundaries', () => {
    const atExpiry = signedPayload({
      id: '42',
      first_name: 'Ada',
      auth_date: NOW_SECONDS - 300,
    })
    const expired = signedPayload({
      id: '42',
      first_name: 'Ada',
      auth_date: NOW_SECONDS - 301,
    })
    const tooFarFuture = signedPayload({
      id: '42',
      first_name: 'Ada',
      auth_date: NOW_SECONDS + 31,
    })

    expect(verifyTelegramAuth(atExpiry, authConfig()).status).toBe('authorized')
    expect(verifyTelegramAuth(expired, authConfig())).toEqual({
      status: 'invalid',
      reason: 'expired_payload',
    })
    expect(verifyTelegramAuth(tooFarFuture, authConfig())).toEqual({
      status: 'invalid',
      reason: 'future_payload',
    })
  })

  it('authorizes by exact numeric-string ID rather than username or numeric coercion', () => {
    const sameUsername = signedPayload({
      id: '43',
      first_name: 'Other',
      username: 'trusted_creator',
      auth_date: NOW_SECONDS,
    })
    const leadingZero = signedPayload({
      id: '042',
      first_name: 'Lookalike',
      auth_date: NOW_SECONDS,
    })

    expect(verifyTelegramAuth(sameUsername, authConfig())).toMatchObject({
      status: 'unauthorized',
      identity: { telegramUserId: '43' },
    })
    expect(verifyTelegramAuth(leadingZero, authConfig())).toEqual({
      status: 'invalid',
      reason: 'malformed_payload',
    })
  })

  it('compares fixed-length signature bytes without throwing on malformed hex', () => {
    const digest = 'ab'.repeat(32)

    expect(constantTimeEqualHex(digest, digest)).toBe(true)
    expect(constantTimeEqualHex(digest, 'ac'.repeat(32))).toBe(false)
    expect(constantTimeEqualHex(digest, 'ab')).toBe(false)
    expect(constantTimeEqualHex(digest, 'not-hex')).toBe(false)
  })
})

function authConfig() {
  return {
    botToken: BOT_TOKEN,
    authorizedTelegramUserId: '42',
    maxAgeSeconds: 300,
    maxFutureSkewSeconds: 30,
    now: () => NOW,
  }
}

function signedPayload(
  input: Omit<TelegramLoginPayload, 'hash'>,
  botToken = BOT_TOKEN,
): TelegramLoginPayload {
  const checkString = Object.entries(input)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('\n')
  const secret = createHash('sha256').update(botToken).digest()
  const hash = createHmac('sha256', secret).update(checkString).digest('hex')
  return { ...input, hash }
}
