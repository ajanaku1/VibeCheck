import { describe, expect, it } from 'vitest'

import {
  deadlineFor,
  isDeadlineReached,
  TIMING_PROFILES,
} from '../../src/domain/timing-profile.js'

describe('timing profiles', () => {
  it('uses the approved Demo Mode durations', () => {
    expect(TIMING_PROFILES.demo).toEqual({
      silenceMs: 90_000,
      dismissalCoolingMs: 180_000,
      unresolvedMs: 600_000,
    })
  })

  it('uses the approved Standard Mode durations', () => {
    expect(TIMING_PROFILES.standard).toEqual({
      silenceMs: 172_800_000,
      dismissalCoolingMs: 86_400_000,
      unresolvedMs: 604_800_000,
    })
  })

  it.each(['silence', 'dismissalCooling', 'unresolved'] as const)(
    'becomes eligible exactly at the %s deadline in both profiles',
    (kind) => {
      for (const profile of ['demo', 'standard'] as const) {
        const deadline = deadlineFor(profile, kind, 10_000)
        expect(isDeadlineReached(deadline, deadline - 1)).toBe(false)
        expect(isDeadlineReached(deadline, deadline)).toBe(true)
      }
    },
  )

  it('recalculates a future deadline from the original anchor when profile changes', () => {
    expect(deadlineFor('standard', 'silence', 10_000)).toBe(
      10_000 + TIMING_PROFILES.standard.silenceMs,
    )
  })
})
