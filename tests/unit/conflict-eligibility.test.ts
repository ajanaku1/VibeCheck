import { describe, expect, it } from 'vitest'

import {
  assessConflictEligibility,
  type ConflictEvidence,
} from '../../src/domain/eligibility.js'

const VALID: ConflictEvidence = {
  hasRetainedBaseline: true,
  messages: [
    { observationId: 'o1', memberRefId: 'member-a' },
    { observationId: 'o2', memberRefId: 'member-b' },
    { observationId: 'o3', memberRefId: 'member-a' },
  ],
  indicators: [
    { type: 'direct_personal_criticism', evidenceRefs: ['o1'] },
    { type: 'contempt_or_dismissal', evidenceRefs: ['o2', 'o3'] },
  ],
}

describe('conflict eligibility', () => {
  it('accepts the complete baseline, exchange, participant, and indicator gate', () => {
    expect(assessConflictEligibility(VALID)).toEqual({ eligible: true, missing: [] })
  })

  it.each([
    ['baseline', { hasRetainedBaseline: false }],
    ['three_messages', { messages: VALID.messages.slice(0, 2) }],
    [
      'two_members',
      { messages: VALID.messages.map((message) => ({ ...message, memberRefId: 'member-a' })) },
    ],
    ['two_indicators', { indicators: VALID.indicators.slice(0, 1) }],
  ] as const)('rejects evidence missing %s', (reason, override) => {
    const assessment = assessConflictEligibility({ ...VALID, ...override })
    expect(assessment.eligible).toBe(false)
    expect(assessment.missing).toContain(reason)
  })

  it('rejects an indicator that cites an unknown observation', () => {
    const assessment = assessConflictEligibility({
      ...VALID,
      indicators: [VALID.indicators[0]!, { ...VALID.indicators[1]!, evidenceRefs: ['unknown'] }],
    })

    expect(assessment).toEqual({ eligible: false, missing: ['valid_indicator_evidence'] })
  })
})
