import { describe, expect, it } from 'vitest'

import {
  InvalidTransitionError,
  transitionCase,
  type TransitionInput,
} from '../../src/domain/case-state.js'

function transition(overrides: Partial<TransitionInput>): ReturnType<typeof transitionCase> {
  return transitionCase({
    state: 'needs_review',
    action: 'approve',
    hasFinalOutreach: false,
    hasRecoveryEvidence: false,
    ...overrides,
  })
}

describe('recovery case transitions', () => {
  it.each([
    ['approve', 'draft_approved'],
    ['edit', 'draft_edited'],
  ] as const)('%s finalizes copy without leaving Needs Review', (action, eventType) => {
    expect(transition({ action })).toEqual({
      fromState: 'needs_review',
      toState: 'needs_review',
      eventType,
    })
  })

  it('requires finalized copy before Sent can begin Monitoring', () => {
    expect(() => transition({ action: 'sent' })).toThrow(InvalidTransitionError)
    expect(transition({ action: 'sent', hasFinalOutreach: true })).toEqual({
      fromState: 'needs_review',
      toState: 'monitoring',
      eventType: 'outreach_sent_confirmed',
    })
  })

  it('dismisses only a case awaiting review', () => {
    expect(transition({ action: 'dismiss' }).toState).toBe('dismissed')
    expect(() => transition({ state: 'monitoring', action: 'dismiss' })).toThrow(
      InvalidTransitionError,
    )
  })

  it('requires both recovery signals before Recovery Detected', () => {
    expect(() =>
      transition({ state: 'monitoring', action: 'detect_recovery' }),
    ).toThrow(InvalidTransitionError)
    expect(
      transition({
        state: 'monitoring',
        action: 'detect_recovery',
        hasRecoveryEvidence: true,
      }).toState,
    ).toBe('recovery_detected')
  })

  it('requires Recovery Detected plus retained evidence to resolve', () => {
    expect(() =>
      transition({ state: 'monitoring', action: 'confirm_recovery', hasRecoveryEvidence: true }),
    ).toThrow(InvalidTransitionError)
    expect(() =>
      transition({ state: 'recovery_detected', action: 'confirm_recovery' }),
    ).toThrow(InvalidTransitionError)
    expect(
      transition({
        state: 'recovery_detected',
        action: 'confirm_recovery',
        hasRecoveryEvidence: true,
      }).toState,
    ).toBe('resolved')
  })

  it('returns rejected apparent recovery to Monitoring', () => {
    expect(
      transition({ state: 'recovery_detected', action: 'reject_recovery' }),
    ).toEqual({
      fromState: 'recovery_detected',
      toState: 'monitoring',
      eventType: 'recovery_rejected',
    })
  })

  it.each(['monitoring', 'recovery_detected'] as const)(
    'allows %s to end unresolved',
    (state) => {
      expect(transition({ state, action: 'mark_unresolved' }).toState).toBe('unresolved')
    },
  )

  it.each(['resolved', 'unresolved', 'dismissed'] as const)(
    'prevents terminal state %s from changing',
    (state) => {
      expect(() => transition({ state, action: 'approve' })).toThrow(
        InvalidTransitionError,
      )
    },
  )
})
