import type { CaseState } from './case-state.js'
import type { EscalationIndicator } from './eligibility.js'
import type { TimingProfile } from './timing-profile.js'

export type ObservationStatus = 'learning' | 'observing' | 'delayed' | 'error'
export type ObservationSource =
  | 'telegram_webhook_group'
  | 'telegram_webhook_creator'
  | 'minds_telegram_group'
  | 'minds_creator_chat'
  | 'scheduler'
export type EvidenceVisibility = 'internal' | 'case_evidence'
export type AnalysisKind = 'baseline' | 'fracture' | 'recovery' | 'draft'
export type ReasoningStatus = 'pending' | 'succeeded' | 'timed_out' | 'invalid' | 'failed'
export type CaseTrigger = 'escalating_conflict' | 'post_conflict_silence'
export type Actor = 'community_member' | 'mind' | 'creator' | 'system' | 'external_service'
export type Provenance =
  | 'observation'
  | 'remembered_context'
  | 'mind_inference'
  | 'creator_decision'
  | 'external_operation'
export type NotificationKind =
  | 'initial_alert'
  | 'final_copy'
  | 'recovery_confirmation'
  | 'command_help'
  | 'delay_notice'
export type DeliveryStatus = 'pending' | 'processing' | 'sent' | 'unknown' | 'failed'

export interface CreatorIdentity {
  telegramUserId: string
  displayName: string
  username: string | null
  photoUrl: string | null
  lastAuthenticatedAt: string
}

export interface AuthSession {
  id: string
  tokenHash: string
  telegramUserId: string
  createdAt: string
  expiresAt: string
  revokedAt: string | null
}

export interface Community {
  id: string
  telegramChatRef: string
  displayName: string
  mindsSourceAlias: string
  observationStatus: ObservationStatus
  timingProfile: TimingProfile
  lastObservedAt: string | null
  lastError: string | null
}

export interface MemberReference {
  id: string
  communityId: string
  externalRefHash: string
  displayLabel: string
  firstSeenAt: string
  lastActiveAt: string
  activityCount: number
}

export interface Observation {
  id: string
  communityId: string
  source: ObservationSource
  sourceFingerprint: string | null
  sessionRef: string
  memberRefId: string | null
  occurredAt: string
  ingestedAt: string
  evidenceExcerpt: string
  contentDigest: string
  visibility: EvidenceVisibility
}

export interface CommunityContext {
  id: string
  communityId: string
  kind: 'norm' | 'relationship'
  statement: string
  memberRefs: string[]
  evidenceObservationIds: string[]
  confidence: number
  status: 'active' | 'superseded'
  createdAt: string
  supersededAt: string | null
}

export interface EvidenceDecision {
  present: boolean
  evidenceRefs: string[]
  explanation: string
}

export interface MindAnalysis {
  schemaVersion: 'vibecheck.analysis.v1'
  analysisKind: AnalysisKind
  observationRefs: string[]
  involvedMemberRefs: string[]
  context: Array<{
    kind: 'norm' | 'relationship'
    statement: string
    evidenceRefs: string[]
    confidence: number
  }>
  escalationIndicators: Array<{
    type: EscalationIndicator
    evidenceRefs: string[]
    explanation: string
  }>
  recoverySignals: {
    affectedMemberReturned: EvidenceDecision
    relevantConstructiveInteraction: EvidenceDecision
  }
  confidence: number
  uncertainty: string
  observedChange?: string | null
  suggestedOutreach?: string | null
  recommendedAction:
    | 'retain_context'
    | 'observe_only'
    | 'open_or_update_case'
    | 'request_recovery_confirmation'
    | 'no_action'
}

export interface ReasoningRun {
  id: string
  inputDigest: string
  analysisKind: AnalysisKind
  engineAlias: string
  inputObservationIds: string[]
  status: ReasoningStatus
  response: MindAnalysis | null
  errorCode: string | null
  startedAt: string
  completedAt: string | null
}

export interface RecoveryCase {
  id: string
  communityId: string
  fractureKey: string
  trigger: CaseTrigger
  state: CaseState
  confidence: number
  uncertainty: string
  openedAt: string
  updatedAt: string
  monitoringStartedAt: string | null
  resolutionDueAt: string | null
  dismissedUntil: string | null
  outcomeSummary: string | null
  version: number
}

export interface CaseEvent {
  id: string
  caseId: string
  idempotencyKey: string
  eventType: string
  actor: Actor
  provenance: Provenance
  summary: string
  evidenceRefs: string[]
  fromState: CaseState | null
  toState: CaseState
  occurredAt: string
}

export interface InterventionPlan {
  id: string
  caseId: string
  suggestedText: string
  finalText: string | null
  finalizedBy: 'approve' | 'edit' | null
  finalizedAt: string | null
  sentConfirmedAt: string | null
}

export interface NotificationDelivery {
  id: string
  caseEventId: string
  kind: NotificationKind
  recipientTelegramId: string
  payloadDigest: string
  status: DeliveryStatus
  attemptCount: number
  telegramMessageId: string | null
  lastAttemptAt: string | null
  lastErrorCode: string | null
}

export interface IngestionCursor {
  alias: string
  lastFingerprint: string
  updatedAt: string
}

export type CreatorCommand =
  | { action: 'approve' | 'sent' | 'dismiss' | 'confirm_recovery' | 'not_recovered' | 'still_unresolved'; caseId?: string }
  | { action: 'edit'; caseId?: string; replacement: string }

export interface CaseSummary {
  id: string
  trigger: CaseTrigger
  state: CaseState
  people: string[]
  observedChange: string
  confidence: number
  uncertainty: string
  awaitingCreatorAction: boolean
  updatedAt: string
}

export interface RecoveryOverview {
  creator: Pick<CreatorIdentity, 'telegramUserId' | 'displayName' | 'username' | 'photoUrl'>
  community: { displayName: string }
  observationStatus: ObservationStatus
  timingProfile: TimingProfile
  counts: { open: number; resolved: number; unresolved: number; awaitingAction: number }
  cases: CaseSummary[]
  recentOutcomes: CaseSummary[]
}
