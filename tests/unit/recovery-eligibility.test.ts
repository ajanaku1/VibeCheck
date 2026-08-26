import { describe, expect, it } from 'vitest'

import {
  assessRecoveryEligibility,
  type RecoveryEvidence,
} from '../../src/domain/eligibility.js'

const VALID: RecoveryEvidence = {
  affectedMemberRefId: 'member-a',
  returnSignals: [{ observationId: 'return-1', memberRefId: 'member-a' }],
  constructiveInteractions: [
    {
      observationIds: ['constructive-1', 'constructive-2'],
      memberRefIds: ['member-a', 'member-b'],
      relatesToFracture: true,
    },
  ],
}

describe('recovery eligibility', () => {
  it('requires the affected member to return and join a relevant constructive interaction', () => {
    expect(assessRecoveryEligibility(VALID)).toEqual({ eligible: true, missing: [] })
  })

  it('rejects a return by a different member', () => {
    const assessment = assessRecoveryEligibility({
      ...VALID,
      returnSignals: [{ observationId: 'return-1', memberRefId: 'member-c' }],
    })
    expect(assessment.missing).toContain('affected_member_return')
  })

  it('rejects constructive activity that excludes the affected member', () => {
    const assessment = assessRecoveryEligibility({
      ...VALID,
      constructiveInteractions: [
        { ...VALID.constructiveInteractions[0]!, memberRefIds: ['member-b', 'member-c'] },
      ],
    })
    expect(assessment.missing).toContain('relevant_constructive_interaction')
  })

  it('rejects constructive activity about another topic', () => {
    const assessment = assessRecoveryEligibility({
      ...VALID,
      constructiveInteractions: [
        { ...VALID.constructiveInteractions[0]!, relatesToFracture: false },
      ],
    })
    expect(assessment.missing).toContain('relevant_constructive_interaction')
  })

  it('requires both recovery signals together', () => {
    expect(
      assessRecoveryEligibility({ ...VALID, constructiveInteractions: [] }).eligible,
    ).toBe(false)
    expect(assessRecoveryEligibility({ ...VALID, returnSignals: [] }).eligible).toBe(false)
  })
})
