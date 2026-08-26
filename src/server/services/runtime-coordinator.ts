import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

import { assessConflictEligibility } from '../../domain/eligibility.js'
import type { MindAnalysis } from '../../domain/types.js'
import type { CommunityContextRepository } from '../db/repositories/community-context-repository.js'
import type { ObservationRepository } from '../db/repositories/observation-repository.js'
import type { CreatorMessenger } from './notification-service.js'
import type { CaseService } from './case-service.js'
import type { CommandService, CreatorCommandResult } from './command-service.js'
import type {
  AnalyzeRequest,
  ReasoningObservation,
  ReasoningResult,
} from './reasoning-service.js'

interface ReasoningGateway {
  analyze(request: AnalyzeRequest): Promise<ReasoningResult>
}

interface MindNotificationQueue {
  enqueueMindNotification(notification: {
    id: string
    caseEventId: string
    kind: 'initial_alert' | 'recovery_confirmation'
    recipientTelegramId: string
    text: string
  }): 'inserted' | 'duplicate'
}

interface CommunityCoordinatorDependencies {
  database: DatabaseSync
  communityId: string
  analysisBatch(): ReasoningObservation[]
  reasoning: ReasoningGateway
  cases: CaseService
  contexts: CommunityContextRepository
  notifications: MindNotificationQueue
  recipientTelegramId: string
  replyTimeoutMs: number
  idFactory?: () => string
}

type CoordinationResult =
  | { status: 'context_retained'; count: number }
  | { status: 'case_opened' | 'case_updated'; caseId: string }
  | { status: 'recovery_detected' | 'evidence_appended'; caseId: string }
  | { status: 'no_action' | 'reasoning_failed' }

interface ActiveCase {
  id: string
  state: 'monitoring'
  affectedMemberRefId: string
}

export class CommunityObservationCoordinator {
  private readonly idFactory: () => string

  constructor(private readonly dependencies: CommunityCoordinatorDependencies) {
    this.idFactory = dependencies.idFactory ?? randomUUID
  }

  async handle(_observationId: string): Promise<CoordinationResult> {
    const observations = this.dependencies.analysisBatch()
    if (observations.length === 0) return { status: 'no_action' }
    const activeCase = this.findMonitoringCase()
    const context = this.dependencies.contexts.listActive(this.dependencies.communityId)
    const analysisKind = selectAnalysisKind(activeCase, context.length)
    const result = await this.dependencies.reasoning.analyze({
      analysisKind,
      observations,
      timeoutMs: this.dependencies.replyTimeoutMs,
    })
    if (result.status !== 'succeeded') return { status: 'reasoning_failed' }
    if (!hasKnownMembers(result.analysis, observations)) return { status: 'no_action' }
    if (analysisKind === 'baseline') return this.retainContext(result.analysis)
    if (analysisKind === 'recovery' && activeCase) {
      return this.recordRecovery(activeCase, result.analysis, result.inputDigest, observations)
    }
    return this.openFracture(result.analysis, result.inputDigest, observations, context.map(({ id }) => id))
  }

  private retainContext(analysis: MindAnalysis): CoordinationResult {
    if (analysis.recommendedAction !== 'retain_context') return { status: 'no_action' }
    const now = Date.now()
    for (const entry of analysis.context) {
      this.dependencies.contexts.create({
        id: this.idFactory(),
        communityId: this.dependencies.communityId,
        kind: entry.kind,
        statement: entry.statement,
        memberRefs: analysis.involvedMemberRefs,
        evidenceObservationIds: entry.evidenceRefs,
        confidence: entry.confidence,
        status: 'active',
        createdAt: now,
        supersededAt: null,
      })
    }
    return { status: 'context_retained', count: analysis.context.length }
  }

  private async openFracture(
    analysis: MindAnalysis,
    inputDigest: string,
    observations: ReasoningObservation[],
    contextIds: string[],
  ): Promise<CoordinationResult> {
    if (analysis.recommendedAction !== 'open_or_update_case' || !analysis.suggestedOutreach) {
      return { status: 'no_action' }
    }
    const messages = referencedHumanMessages(analysis, observations)
    const eligibility = assessConflictEligibility({
      hasRetainedBaseline: contextIds.length > 0,
      messages,
      indicators: analysis.escalationIndicators,
    })
    if (!eligibility.eligible) return { status: 'no_action' }
    const outcome = await this.dependencies.cases.openOrUpdateCase({
      caseId: this.idFactory(),
      interventionId: this.idFactory(),
      communityId: this.dependencies.communityId,
      fractureKey: fractureKey(analysis.involvedMemberRefs),
      trigger: 'escalating_conflict',
      idempotencyKey: `mind:${inputDigest}`,
      participants: analysis.involvedMemberRefs.map((memberRefId, index) => ({
        memberRefId,
        role: index === 0 ? 'affected' : 'counterparty',
      })),
      messageEvidence: messages,
      indicatorEvidence: analysis.escalationIndicators,
      rememberedContextIds: contextIds,
      observedChangeObservationIds: analysis.observationRefs,
      confidence: analysis.confidence,
      uncertainty: analysis.uncertainty,
      suggestedOutreach: analysis.suggestedOutreach,
    })
    if (outcome.status !== 'duplicate') this.queueInitialAlert(outcome.caseId, inputDigest, analysis)
    return {
      status: outcome.status === 'opened' ? 'case_opened' : 'case_updated',
      caseId: outcome.caseId,
    }
  }

  private queueInitialAlert(caseId: string, inputDigest: string, analysis: MindAnalysis): void {
    const eventId = this.findEventId(caseId, `mind:${inputDigest}`)
    this.dependencies.notifications.enqueueMindNotification({
      id: this.idFactory(),
      caseEventId: eventId,
      kind: 'initial_alert',
      recipientTelegramId: this.dependencies.recipientTelegramId,
      text: `${analysis.observedChange ?? 'A possible community fracture needs review'}\n\nSuggested outreach: ${analysis.suggestedOutreach}\n\nUncertainty: ${analysis.uncertainty}`,
    })
  }

  private async recordRecovery(
    activeCase: ActiveCase,
    analysis: MindAnalysis,
    inputDigest: string,
    observations: ReasoningObservation[],
  ): Promise<CoordinationResult> {
    if (analysis.recommendedAction !== 'request_recovery_confirmation') {
      return { status: 'no_action' }
    }
    const outcome = await this.dependencies.cases.recordRecoveryEvidence({
      caseId: activeCase.id,
      idempotencyKey: `mind:${inputDigest}`,
      affectedMemberRefId: activeCase.affectedMemberRefId,
      returnSignals: mapReturnSignals(analysis, observations),
      constructiveInteractions: mapConstructiveInteractions(analysis, observations),
    })
    if (outcome.status === 'recovery_detected') {
      this.queueRecoveryConfirmation(activeCase.id, inputDigest, analysis)
    }
    return {
      status: outcome.status === 'duplicate' ? 'evidence_appended' : outcome.status,
      caseId: activeCase.id,
    }
  }

  private queueRecoveryConfirmation(
    caseId: string,
    inputDigest: string,
    analysis: MindAnalysis,
  ): void {
    this.dependencies.notifications.enqueueMindNotification({
      id: this.idFactory(),
      caseEventId: this.findEventId(caseId, `mind:${inputDigest}`),
      kind: 'recovery_confirmation',
      recipientTelegramId: this.dependencies.recipientTelegramId,
      text: `Recovery signals were detected. Confirm recovery or choose Not recovered.\n\nUncertainty: ${analysis.uncertainty}`,
    })
  }

  private findMonitoringCase(): ActiveCase | null {
    const row = this.dependencies.database
      .prepare(
        `SELECT recovery_cases.id, case_participants.member_ref_id
         FROM recovery_cases
         JOIN case_participants ON case_participants.case_id = recovery_cases.id
         WHERE recovery_cases.community_id = ? AND recovery_cases.state = 'monitoring'
           AND case_participants.role = 'affected'
         ORDER BY recovery_cases.updated_at DESC LIMIT 1`,
      )
      .get(this.dependencies.communityId) as { id: string; member_ref_id: string } | undefined
    return row ? { id: row.id, state: 'monitoring', affectedMemberRefId: row.member_ref_id } : null
  }

  private findEventId(caseId: string, idempotencyKey: string): string {
    const row = this.dependencies.database
      .prepare('SELECT id FROM case_events WHERE case_id = ? AND idempotency_key = ?')
      .get(caseId, idempotencyKey) as { id: string } | undefined
    if (!row) throw new Error('Committed case event was not found')
    return row.id
  }
}

interface CreatorCoordinatorDependencies {
  observations: ObservationRepository
  commands: Pick<CommandService, 'handle'>
  messenger: CreatorMessenger
  authorizedTelegramUserId: string
}

export class CreatorObservationCoordinator {
  constructor(private readonly dependencies: CreatorCoordinatorDependencies) {}

  async handle(observationId: string): Promise<void> {
    const observation = this.dependencies.observations.findById(observationId)
    if (
      !observation ||
      !['telegram_webhook_creator', 'minds_creator_chat'].includes(observation.source)
    ) return
    const result = await this.dependencies.commands.handle({
      senderTelegramUserId: this.dependencies.authorizedTelegramUserId,
      text: observation.evidenceExcerpt,
    })
    await this.dependencies.messenger.sendCreatorMessage({
      recipientTelegramId: this.dependencies.authorizedTelegramUserId,
      text: formatCommandResult(result),
    })
  }
}

function referencedHumanMessages(
  analysis: MindAnalysis,
  observations: ReasoningObservation[],
): Array<{ observationId: string; memberRefId: string }> {
  const referenced = new Set(analysis.observationRefs)
  return observations.flatMap((observation) =>
    referenced.has(observation.id) && observation.memberRefId
      ? [{ observationId: observation.id, memberRefId: observation.memberRefId }]
      : [],
  )
}

function mapReturnSignals(
  analysis: MindAnalysis,
  observations: ReasoningObservation[],
): Array<{ observationId: string; memberRefId: string }> {
  const refs = new Set(analysis.recoverySignals.affectedMemberReturned.evidenceRefs)
  return observations.flatMap((observation) =>
    refs.has(observation.id) && observation.memberRefId
      ? [{ observationId: observation.id, memberRefId: observation.memberRefId }]
      : [],
  )
}

function mapConstructiveInteractions(
  analysis: MindAnalysis,
  observations: ReasoningObservation[],
): Array<{ observationIds: string[]; memberRefIds: string[]; relatesToFracture: boolean }> {
  const refs = analysis.recoverySignals.relevantConstructiveInteraction.evidenceRefs
  const referenced = new Set(refs)
  const members = observations.flatMap((observation) =>
    referenced.has(observation.id) && observation.memberRefId ? [observation.memberRefId] : [],
  )
  return [{ observationIds: refs, memberRefIds: [...new Set(members)], relatesToFracture: true }]
}

function fractureKey(memberRefs: string[]): string {
  return createHash('sha256').update([...memberRefs].sort().join(':')).digest('hex')
}

function hasKnownMembers(
  analysis: MindAnalysis,
  observations: ReasoningObservation[],
): boolean {
  const knownMembers = new Set(
    observations.flatMap(({ memberRefId }) => (memberRefId ? [memberRefId] : [])),
  )
  return analysis.involvedMemberRefs.every((memberRefId) => knownMembers.has(memberRefId))
}

function selectAnalysisKind(
  activeCase: ActiveCase | null,
  contextCount: number,
): AnalyzeRequest['analysisKind'] {
  if (activeCase) return 'recovery'
  if (contextCount === 0) return 'baseline'
  return 'fracture'
}

function formatCommandResult(result: CreatorCommandResult): string {
  if (result.status === 'help') return result.message
  const prefix = `Case ${result.caseId.slice(0, 8)} updated to ${result.state}.`
  return result.finalText ? `${prefix}\n\n${result.finalText}` : prefix
}
