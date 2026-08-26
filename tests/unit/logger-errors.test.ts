import { describe, expect, it } from 'vitest'

import { OperationalError, toProblem } from '../../src/server/errors.js'
import { StructuredLogger, redactLogValue } from '../../src/server/logger.js'

describe('operational errors', () => {
  it('produces a stable public problem without leaking the cause', () => {
    const error = new OperationalError({
      code: 'database_unavailable',
      title: 'Service unavailable',
      status: 503,
      detail: 'Recovery data is temporarily unavailable.',
      retryable: true,
      cause: new Error('sqlite path /private/data/vibecheck.sqlite failed'),
    })

    expect(toProblem(error, 'request-123')).toEqual({
      type: '/problems/database_unavailable',
      title: 'Service unavailable',
      status: 503,
      code: 'database_unavailable',
      detail: 'Recovery data is temporarily unavailable.',
      retryable: true,
      correlationId: 'request-123',
    })
  })
})

describe('structured logging', () => {
  it('redacts secret-shaped keys and credentials embedded in messages', () => {
    expect(
      redactLogValue({
        telegramBotToken: '123456:super-secret',
        nested: { authorization: 'Bearer builder-api-key' },
        message: 'Telegram rejected bot123456:super-secret',
        caseId: 'case-123',
      }),
    ).toEqual({
      telegramBotToken: '[REDACTED]',
      nested: { authorization: '[REDACTED]' },
      message: 'Telegram rejected [REDACTED]',
      caseId: 'case-123',
    })
  })

  it('emits one JSON record with a stable level and correlation ID', () => {
    const records: string[] = []
    const logger = new StructuredLogger((record) => records.push(record))

    logger.info('case_observed', { correlationId: 'request-123', caseId: 'case-123' })

    expect(JSON.parse(records[0] ?? '')).toMatchObject({
      level: 'info',
      event: 'case_observed',
      correlationId: 'request-123',
      caseId: 'case-123',
    })
  })
})
