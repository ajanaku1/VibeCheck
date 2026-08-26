export type CaseState =
  | 'needs_review'
  | 'monitoring'
  | 'recovery_detected'
  | 'resolved'
  | 'unresolved'
  | 'dismissed'

export type CaseAction =
  | 'approve'
  | 'edit'
  | 'sent'
  | 'dismiss'
  | 'detect_recovery'
  | 'confirm_recovery'
  | 'reject_recovery'
  | 'mark_unresolved'

export type CaseEventType =
  | 'draft_approved'
  | 'draft_edited'
  | 'outreach_sent_confirmed'
  | 'case_dismissed'
  | 'recovery_detected'
  | 'recovery_confirmed'
  | 'recovery_rejected'
  | 'case_expired'

export interface TransitionInput {
  state: CaseState
  action: CaseAction
  hasFinalOutreach: boolean
  hasRecoveryEvidence: boolean
}

export interface CaseTransition {
  fromState: CaseState
  toState: CaseState
  eventType: CaseEventType
}

export class InvalidTransitionError extends Error {
  constructor(state: CaseState, action: CaseAction, reason?: string) {
    super(reason ?? `Action ${action} is not allowed while case is ${state}`)
    this.name = 'InvalidTransitionError'
  }
}

function result(
  fromState: CaseState,
  toState: CaseState,
  eventType: CaseEventType,
): CaseTransition {
  return { fromState, toState, eventType }
}

export function transitionCase(input: TransitionInput): CaseTransition {
  const { action, state } = input

  if (state === 'needs_review' && action === 'approve') {
    return result(state, state, 'draft_approved')
  }
  if (state === 'needs_review' && action === 'edit') {
    return result(state, state, 'draft_edited')
  }
  if (state === 'needs_review' && action === 'sent') {
    if (!input.hasFinalOutreach) {
      throw new InvalidTransitionError(state, action, 'Finalize outreach before confirming Sent')
    }
    return result(state, 'monitoring', 'outreach_sent_confirmed')
  }
  if (state === 'needs_review' && action === 'dismiss') {
    return result(state, 'dismissed', 'case_dismissed')
  }
  if (state === 'monitoring' && action === 'detect_recovery') {
    if (!input.hasRecoveryEvidence) {
      throw new InvalidTransitionError(state, action, 'Both recovery signals are required')
    }
    return result(state, 'recovery_detected', 'recovery_detected')
  }
  if (state === 'recovery_detected' && action === 'confirm_recovery') {
    if (!input.hasRecoveryEvidence) {
      throw new InvalidTransitionError(state, action, 'Recovery evidence must still be present')
    }
    return result(state, 'resolved', 'recovery_confirmed')
  }
  if (state === 'recovery_detected' && action === 'reject_recovery') {
    return result(state, 'monitoring', 'recovery_rejected')
  }
  if (
    (state === 'monitoring' || state === 'recovery_detected') &&
    action === 'mark_unresolved'
  ) {
    return result(state, 'unresolved', 'case_expired')
  }

  throw new InvalidTransitionError(state, action)
}
