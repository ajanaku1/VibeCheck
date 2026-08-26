import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { Ajv2020 } from 'ajv/dist/2020.js'
import type { FormatsPlugin } from 'ajv-formats'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import {
  mindAnalysisSchema,
  parseMindAnalysis,
  recoveryOverviewSchema,
  telegramAuthPayloadSchema,
} from '../../src/domain/validation.js'

const CONTRACT_DIRECTORY = fileURLToPath(
  new URL('../../specs/001-community-recovery/contracts/', import.meta.url),
)
const require = createRequire(import.meta.url)
const addFormats = require('ajv-formats') as FormatsPlugin
const OBSERVATION_ONE = '11111111-1111-4111-8111-111111111111'
const OBSERVATION_TWO = '22222222-2222-4222-8222-222222222222'
const MEMBER_ONE = '33333333-3333-4333-8333-333333333333'
const MEMBER_TWO = '44444444-4444-4444-8444-444444444444'

function validAnalysis(): Record<string, unknown> {
  return {
    schemaVersion: 'vibecheck.analysis.v1',
    analysisKind: 'fracture',
    observationRefs: [OBSERVATION_ONE, OBSERVATION_TWO],
    involvedMemberRefs: [MEMBER_ONE, MEMBER_TWO],
    context: [
      {
        kind: 'relationship',
        statement: 'These members usually resolve disagreements constructively.',
        evidenceRefs: [OBSERVATION_ONE],
        confidence: 0.81,
      },
    ],
    escalationIndicators: [
      {
        type: 'direct_personal_criticism',
        evidenceRefs: [OBSERVATION_TWO],
        explanation: 'The criticism targets the member rather than the idea.',
      },
    ],
    recoverySignals: {
      affectedMemberReturned: {
        present: false,
        evidenceRefs: [],
        explanation: 'No later return is present in this batch.',
      },
      relevantConstructiveInteraction: {
        present: false,
        evidenceRefs: [],
        explanation: 'No constructive follow-up is present in this batch.',
      },
    },
    confidence: 0.78,
    uncertainty: 'Intent cannot be inferred from text alone.',
    observedChange: 'A normally constructive exchange became personal.',
    suggestedOutreach: 'Check in privately and ask how the exchange landed.',
    recommendedAction: 'open_or_update_case',
  }
}

describe('versioned contracts', () => {
  it('parses and validates the complete OpenAPI document', async () => {
    const document = parse(
      await readFile(`${CONTRACT_DIRECTORY}openapi.yaml`, 'utf8'),
    ) as {
      openapi?: string
      paths?: Record<string, unknown>
      components?: { securitySchemes?: Record<string, unknown> }
    }

    expect(document.openapi).toBe('3.1.0')
    expect(Object.keys(document.paths ?? {})).toEqual(
      expect.arrayContaining([
        '/api/health',
        '/api/auth/telegram',
        '/api/recovery-overview',
        '/api/recovery-cases/{caseId}',
      ]),
    )
    expect(document.components?.securitySchemes).toHaveProperty('creatorSession')
  })

  it('composes the Mind JSON Schema conditionals and local references', async () => {
    const rawSchema = JSON.parse(
      await readFile(`${CONTRACT_DIRECTORY}minds-analysis.schema.json`, 'utf8'),
    ) as object
    const ajv = new Ajv2020({ allErrors: true, strict: true })
    addFormats(ajv)
    const validate = ajv.compile(rawSchema)

    expect(validate(validAnalysis())).toBe(true)
    expect(
      validate({
        ...validAnalysis(),
        involvedMemberRefs: [MEMBER_ONE],
      }),
    ).toBe(false)
    expect(
      validate({
        ...validAnalysis(),
        analysisKind: 'recovery',
        involvedMemberRefs: [MEMBER_ONE],
        recoverySignals: {
          affectedMemberReturned: {
            present: true,
            evidenceRefs: [],
            explanation: 'Return asserted without evidence.',
          },
          relevantConstructiveInteraction: {
            present: false,
            evidenceRefs: [],
            explanation: 'Not present.',
          },
        },
      }),
    ).toBe(false)
  })
})

describe('Zod boundary schemas', () => {
  it('accepts the same valid Mind envelope as the JSON Schema', () => {
    expect(mindAnalysisSchema.parse(validAnalysis())).toMatchObject({
      schemaVersion: 'vibecheck.analysis.v1',
      analysisKind: 'fracture',
    })
  })

  it('rejects evidence references that were not stored for the request', () => {
    expect(() => parseMindAnalysis(validAnalysis(), new Set([OBSERVATION_ONE]))).toThrow(
      /unknown observation reference/i,
    )
  })

  it('normalizes the Telegram auth date and rejects extra fields', () => {
    expect(
      telegramAuthPayloadSchema.parse({
        id: '123456789',
        first_name: 'Ada',
        auth_date: '1720000000',
        hash: 'a'.repeat(64),
      }).auth_date,
    ).toBe(1_720_000_000)

    expect(() =>
      telegramAuthPayloadSchema.parse({
        id: '123456789',
        first_name: 'Ada',
        auth_date: 1_720_000_000,
        hash: 'a'.repeat(64),
        botToken: 'must-not-cross-the-boundary',
      }),
    ).toThrow()
  })

  it('rejects protected overview projections with undeclared raw fields', () => {
    expect(() =>
      recoveryOverviewSchema.parse({
        creator: { telegramUserId: '123456789', displayName: 'Ada' },
        community: { displayName: 'Staged Creators', telegramChatRef: '-100-secret' },
        observationStatus: 'observing',
        timingProfile: 'demo',
        counts: { open: 0, resolved: 0, unresolved: 0, awaitingAction: 0 },
        cases: [],
        recentOutcomes: [],
      }),
    ).toThrow()
  })
})
