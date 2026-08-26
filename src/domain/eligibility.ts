export type EscalationIndicator =
  | 'direct_personal_criticism'
  | 'contempt_or_dismissal'
  | 'hostile_contradiction_after_deescalation'
  | 'explicit_intent_to_disengage'

interface MessageEvidence {
  observationId: string
  memberRefId: string
}

interface IndicatorEvidence {
  type: EscalationIndicator
  evidenceRefs: string[]
}

export interface ConflictEvidence {
  hasRetainedBaseline: boolean
  messages: MessageEvidence[]
  indicators: IndicatorEvidence[]
}

export interface EligibilityAssessment {
  eligible: boolean
  missing: string[]
}

function hasValidIndicatorEvidence(input: ConflictEvidence): boolean {
  const observationIds = new Set(input.messages.map((message) => message.observationId))
  return input.indicators.every(
    (indicator) =>
      indicator.evidenceRefs.length > 0 &&
      indicator.evidenceRefs.every((reference) => observationIds.has(reference)),
  )
}

export function assessConflictEligibility(input: ConflictEvidence): EligibilityAssessment {
  const missing: string[] = []
  if (!input.hasRetainedBaseline) missing.push('baseline')
  if (input.messages.length < 3) missing.push('three_messages')
  if (new Set(input.messages.map((message) => message.memberRefId)).size < 2) {
    missing.push('two_members')
  }
  if (input.indicators.length < 2) missing.push('two_indicators')
  if (!hasValidIndicatorEvidence(input)) missing.push('valid_indicator_evidence')
  return { eligible: missing.length === 0, missing }
}

interface ReturnSignal {
  observationId: string
  memberRefId: string
}

interface ConstructiveInteraction {
  observationIds: string[]
  memberRefIds: string[]
  relatesToFracture: boolean
}

export interface RecoveryEvidence {
  affectedMemberRefId: string
  returnSignals: ReturnSignal[]
  constructiveInteractions: ConstructiveInteraction[]
}

export function assessRecoveryEligibility(input: RecoveryEvidence): EligibilityAssessment {
  const missing: string[] = []
  const affectedMemberReturned = input.returnSignals.some(
    (signal) => signal.memberRefId === input.affectedMemberRefId,
  )
  const relevantInteraction = input.constructiveInteractions.some(
    (interaction) =>
      interaction.relatesToFracture &&
      interaction.observationIds.length > 0 &&
      interaction.memberRefIds.includes(input.affectedMemberRefId),
  )

  if (!affectedMemberReturned) missing.push('affected_member_return')
  if (!relevantInteraction) missing.push('relevant_constructive_interaction')
  return { eligible: missing.length === 0, missing }
}
