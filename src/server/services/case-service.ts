import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

import {
  transitionCase,
  type CaseAction,
  type CaseState,
  type CaseTransition,
} from '../../domain/case-state.js'
import {
  assessConflictEligibility,
  type ConflictEvidence,
  type EscalationIndicator,
  type RecoveryEvidence,
} from '../../domain/eligibility.js'
import { deadlineFor, type TimingProfile } from '../../domain/timing-profile.js'
import { transaction } from '../db/database.js'
import { CaseEventRepository } from '../db/repositories/case-event-repository.js'
import { assertObservationRefs } from '../db/repositories/evidence-reference-policy.js'
import { InterventionRepository } from '../db/repositories/intervention-repository.js'
import {
  RecoveryCaseRepository,
  type StoredRecoveryCase,
} from '../db/repositories/recovery-case-repository.js'
import type {
  ActionableCase,
  CreatorAction,
  CreatorActionGateway,
  RejectedCreatorCommand,
  ResolvedCreatorCommand,
} from './command-service.js'

interface CaseServiceDependencies {
  database: DatabaseSync
  timingProfile: TimingProfile
  now?: () => number
  idFactory?: () => string
}

interface ActiveCaseRow {
  id: string
  state: CaseState
  final_text: string | null
}

interface CaseMutation {
  state: CaseState
  monitoringStartedAt: number | null
  resolutionDueAt: number | null
  dismissedUntil: number | null
  outcomeSummary: string | null
}

export interface OpenOrUpdateCaseInput {
  caseId: string
  interventionId: string
  communityId: string
  fractureKey: string
  trigger: 'escalating_conflict' | 'post_conflict_silence'
  idempotencyKey: string
  participants: Array<{
    memberRefId: string
    role: 'affected' | 'counterparty'
  }>
  messageEvidence: ConflictEvidence['messages']
  indicatorEvidence: Array<{ type: EscalationIndicator; evidenceRefs: string[] }>
  rememberedContextIds: string[]
  observedChangeObservationIds: string[]
  confidence: number
  uncertainty: string
  suggestedOutreach: string
}

export interface RecordRecoveryEvidenceInput extends RecoveryEvidence {
  caseId: string
  idempotencyKey: string
}

export class CaseService implements CreatorActionGateway {
  private readonly now: () => number
  private readonly idFactory: () => string
  private readonly cases: RecoveryCaseRepository
  private readonly interventions: InterventionRepository
  private readonly events: CaseEventRepository

  constructor(private readonly dependencies: CaseServiceDependencies) {
    this.now = dependencies.now ?? Date.now
    this.idFactory = dependencies.idFactory ?? randomUUID
    this.cases = new RecoveryCaseRepository(dependencies.database)
    this.interventions = new InterventionRepository(dependencies.database)
    this.events = new CaseEventRepository(dependencies.database)
  }

  listCases(): Promise<ActionableCase[]> {
    const rows = this.dependencies.database
      .prepare(
        `SELECT recovery_cases.id, recovery_cases.state, intervention_plans.final_text
         FROM recovery_cases
         LEFT JOIN intervention_plans ON intervention_plans.case_id = recovery_cases.id
         WHERE recovery_cases.state IN ('needs_review', 'monitoring', 'recovery_detected')
         ORDER BY recovery_cases.updated_at, recovery_cases.id`,
      )
      .all() as unknown as ActiveCaseRow[]
    return Promise.resolve(
      rows.map((row) => ({
        id: row.id,
        state: row.state,
        affectedLabels: this.participantLabels(row.id),
        allowedActions: allowedActions(row.state, row.final_text !== null, this.hasRecoveryEvidence(row.id)),
      })),
    )
  }

  async execute(command: ResolvedCreatorCommand): Promise<{ state: CaseState; finalText?: string }> {
    return transaction(this.dependencies.database, () => this.applyCommand(command))
  }

  async recordRejectedCommand(rejection: RejectedCreatorCommand): Promise<void> {
    transaction(this.dependencies.database, () => {
      for (const caseId of rejection.caseIds) this.appendRejectedCommand(caseId, rejection.code)
    })
  }

  async openOrUpdateCase(
    input: OpenOrUpdateCaseInput,
  ): Promise<{ status: 'opened' | 'updated' | 'duplicate'; caseId: string }> {
    assertEligibleFracture(input)
    return transaction(this.dependencies.database, () => this.persistFracture(input))
  }

  async recordRecoveryEvidence(
    input: RecordRecoveryEvidenceInput,
  ): Promise<{
    status: 'evidence_appended' | 'recovery_detected' | 'duplicate'
    state: CaseState
  }> {
    return transaction(this.dependencies.database, () => this.persistRecoveryEvidence(input))
  }

  async expireCase(caseId: string, idempotencyKey: string): Promise<{ state: CaseState }> {
    return transaction(this.dependencies.database, () => this.persistExpiry(caseId, idempotencyKey))
  }

  private persistExpiry(caseId: string, idempotencyKey: string): { state: CaseState } {
    const recoveryCase = this.requireCase(caseId)
    if (this.hasCaseEvent(caseId, idempotencyKey) || isTerminal(recoveryCase.state)) {
      return { state: recoveryCase.state }
    }
    const change = transitionCase({
      state: recoveryCase.state,
      action: 'mark_unresolved',
      hasFinalOutreach: true,
      hasRecoveryEvidence: this.hasRecoveryEvidence(caseId),
    })
    const now = this.now()
    const summary = 'Recovery window expired without creator-confirmed recovery.'
    this.updateCase(recoveryCase, change, now)
    this.dependencies.database
      .prepare('UPDATE recovery_cases SET outcome_summary = ? WHERE id = ?')
      .run(summary, caseId)
    this.events.append({
      id: this.idFactory(),
      caseId,
      idempotencyKey,
      eventType: 'case_expired',
      actor: 'system',
      provenance: 'external_operation',
      summary,
      evidenceRefs: [],
      fromState: change.fromState,
      toState: change.toState,
      occurredAt: now,
    })
    return { state: change.toState }
  }

  private applyCommand(command: ResolvedCreatorCommand): { state: CaseState; finalText?: string } {
    const recoveryCase = this.requireCase(command.caseId)
    const intervention = this.interventions.findByCaseId(command.caseId)
    const transition = transitionCase({
      state: recoveryCase.state,
      action: toCaseAction(command.action),
      hasFinalOutreach: intervention?.finalText !== null && intervention?.finalText !== undefined,
      hasRecoveryEvidence: this.hasRecoveryEvidence(command.caseId),
    })
    const now = this.now()
    const finalText = this.applyIntervention(command, intervention, now)
    this.updateCase(recoveryCase, transition, now)
    this.appendCreatorEvent(recoveryCase, transition, now)
    return { state: transition.toState, ...(finalText ? { finalText } : {}) }
  }

  private persistFracture(
    input: OpenOrUpdateCaseInput,
  ): { status: 'opened' | 'updated' | 'duplicate'; caseId: string } {
    assertObservationRefs(
      this.dependencies.database,
      fractureObservationIds(input),
      input.communityId,
    )
    this.assertContextRefs(input.rememberedContextIds, input.communityId)

    const existing = this.findActiveFracture(input.communityId, input.fractureKey)
    if (existing && this.hasCaseEvent(existing.id, input.idempotencyKey)) {
      return { status: 'duplicate', caseId: existing.id }
    }
    if (existing) {
      return this.updateExistingFracture(existing, input)
    }
    return this.openFracture(input)
  }

  private openFracture(
    input: OpenOrUpdateCaseInput,
  ): { status: 'opened'; caseId: string } {
    const recoveryCase = this.createCase(input)
    this.linkCaseArtifacts(recoveryCase.id, input)
    this.interventions.create({
      id: input.interventionId,
      caseId: recoveryCase.id,
      suggestedText: input.suggestedOutreach,
    })
    this.appendAnalysisEvent(recoveryCase, input, 'case_opened')
    return { status: 'opened', caseId: recoveryCase.id }
  }

  private updateExistingFracture(
    recoveryCase: StoredRecoveryCase,
    input: OpenOrUpdateCaseInput,
  ): { status: 'updated'; caseId: string } {
    this.linkCaseArtifacts(recoveryCase.id, input)
    this.updateCaseAnalysis(recoveryCase, input)
    this.appendAnalysisEvent(recoveryCase, input, 'evidence_appended')
    return { status: 'updated', caseId: recoveryCase.id }
  }

  private persistRecoveryEvidence(input: RecordRecoveryEvidenceInput): {
    status: 'evidence_appended' | 'recovery_detected' | 'duplicate'
    state: CaseState
  } {
    const recoveryCase = this.requireCase(input.caseId)
    if (this.hasCaseEvent(input.caseId, input.idempotencyKey)) {
      return { status: 'duplicate', state: recoveryCase.state }
    }

    const evidenceIds = recoveryObservationIds(input)
    if (evidenceIds.length > 0) {
      assertObservationRefs(this.dependencies.database, evidenceIds, recoveryCase.communityId)
    }
    this.linkRecoverySignals(input)
    const detected = recoveryCase.state === 'monitoring' && this.hasRecoveryEvidence(input.caseId)
    const now = this.now()
    if (detected) return this.markRecoveryDetected(recoveryCase, input, evidenceIds, now)

    this.touchCase(recoveryCase, now)
    this.appendEvidenceEvent(
      recoveryCase,
      input.idempotencyKey,
      'evidence_appended',
      evidenceIds,
      recoveryCase.state,
      now,
    )
    return { status: 'evidence_appended', state: recoveryCase.state }
  }

  private markRecoveryDetected(
    recoveryCase: StoredRecoveryCase,
    input: RecordRecoveryEvidenceInput,
    evidenceIds: string[],
    now: number,
  ): { status: 'recovery_detected'; state: CaseState } {
    const change = transitionCase({
      state: recoveryCase.state,
      action: 'detect_recovery',
      hasFinalOutreach: true,
      hasRecoveryEvidence: true,
    })
    this.updateCase(recoveryCase, change, now)
    this.appendEvidenceEvent(
      recoveryCase,
      input.idempotencyKey,
      'recovery_detected',
      evidenceIds,
      change.toState,
      now,
    )
    return { status: 'recovery_detected', state: change.toState }
  }

  private createCase(input: OpenOrUpdateCaseInput): StoredRecoveryCase {
    const now = this.now()
    const recoveryCase: StoredRecoveryCase = {
      id: input.caseId,
      communityId: input.communityId,
      fractureKey: input.fractureKey,
      trigger: input.trigger,
      state: 'needs_review',
      confidence: input.confidence,
      uncertainty: input.uncertainty,
      openedAt: now,
      updatedAt: now,
      monitoringStartedAt: null,
      resolutionDueAt: null,
      dismissedUntil: null,
      outcomeSummary: null,
      version: 1,
    }
    this.cases.create(recoveryCase)
    return recoveryCase
  }

  private linkCaseArtifacts(caseId: string, input: OpenOrUpdateCaseInput): void {
    this.linkParticipants(caseId, input.participants)
    this.linkFractureEvidence(caseId, input)
  }

  private linkParticipants(
    caseId: string,
    participants: OpenOrUpdateCaseInput['participants'],
  ): void {
    const participant = this.dependencies.database.prepare(
      `INSERT OR IGNORE INTO case_participants (case_id, member_ref_id, role) VALUES (?, ?, ?)`,
    )
    for (const item of participants) participant.run(caseId, item.memberRefId, item.role)
  }

  private linkFractureEvidence(caseId: string, input: OpenOrUpdateCaseInput): void {
    const evidence = this.dependencies.database.prepare(
      `INSERT OR IGNORE INTO case_evidence (case_id, evidence_id, evidence_type, role)
       VALUES (?, ?, ?, ?)`,
    )
    for (const { observationId } of input.messageEvidence) {
      evidence.run(caseId, observationId, 'observation', 'observed_change')
    }
    for (const indicator of input.indicatorEvidence) {
      for (const observationId of indicator.evidenceRefs) {
        evidence.run(caseId, observationId, 'observation', 'escalation_indicator')
      }
    }
    for (const contextId of input.rememberedContextIds) {
      evidence.run(caseId, contextId, 'community_context', 'remembered_context')
    }
  }

  private linkRecoverySignals(input: RecordRecoveryEvidenceInput): void {
    const statement = this.dependencies.database.prepare(
      `INSERT OR IGNORE INTO case_evidence (case_id, evidence_id, evidence_type, role)
       VALUES (?, ?, 'observation', ?)`,
    )
    for (const signal of input.returnSignals) {
      if (signal.memberRefId === input.affectedMemberRefId) {
        statement.run(input.caseId, signal.observationId, 'return_signal')
      }
    }
    for (const interaction of input.constructiveInteractions) {
      if (!interaction.relatesToFracture) continue
      if (!interaction.memberRefIds.includes(input.affectedMemberRefId)) continue
      for (const observationId of interaction.observationIds) {
        statement.run(input.caseId, observationId, 'constructive_interaction')
      }
    }
  }

  private assertContextRefs(contextIds: string[], communityId: string): void {
    const statement = this.dependencies.database.prepare(
      'SELECT 1 AS found FROM community_context WHERE id = ? AND community_id = ?',
    )
    for (const contextId of contextIds) {
      if (!statement.get(contextId, communityId)) {
        throw new Error(`Unknown remembered context reference: ${contextId}`)
      }
    }
  }

  private findActiveFracture(communityId: string, fractureKey: string): StoredRecoveryCase | null {
    return this.cases.findActiveByFracture(communityId, fractureKey)
  }

  private hasCaseEvent(caseId: string, idempotencyKey: string): boolean {
    return Boolean(
      this.dependencies.database
        .prepare('SELECT 1 AS found FROM case_events WHERE case_id = ? AND idempotency_key = ?')
        .get(caseId, idempotencyKey),
    )
  }

  private updateCaseAnalysis(
    recoveryCase: StoredRecoveryCase,
    input: OpenOrUpdateCaseInput,
  ): void {
    const result = this.dependencies.database
      .prepare(
        `UPDATE recovery_cases
         SET confidence = ?, uncertainty = ?, updated_at = ?, version = version + 1
         WHERE id = ? AND version = ?`,
      )
      .run(input.confidence, input.uncertainty, this.now(), recoveryCase.id, recoveryCase.version)
    if (Number(result.changes) !== 1) throw new Error('Recovery case changed concurrently')
  }

  private appendAnalysisEvent(
    recoveryCase: StoredRecoveryCase,
    input: OpenOrUpdateCaseInput,
    eventType: 'case_opened' | 'evidence_appended',
  ): void {
    this.events.append({
      id: this.idFactory(),
      caseId: recoveryCase.id,
      idempotencyKey: input.idempotencyKey,
      eventType,
      actor: 'mind',
      provenance: 'mind_inference',
      summary:
        eventType === 'case_opened'
          ? 'Mind analysis met the deterministic fracture gate.'
          : 'Related evidence was added to the existing recovery case.',
      evidenceRefs: analysisEvidenceRefs(input),
      fromState: eventType === 'case_opened' ? null : recoveryCase.state,
      toState: recoveryCase.state,
      occurredAt: this.now(),
    })
  }

  private appendEvidenceEvent(
    recoveryCase: StoredRecoveryCase,
    idempotencyKey: string,
    eventType: 'evidence_appended' | 'recovery_detected',
    evidenceRefs: string[],
    toState: CaseState,
    now: number,
  ): void {
    this.events.append({
      id: this.idFactory(),
      caseId: recoveryCase.id,
      idempotencyKey,
      eventType,
      actor: 'community_member',
      provenance: 'observation',
      summary:
        eventType === 'recovery_detected'
          ? 'Both recovery evidence gates are present.'
          : 'Recovery evidence was appended; both gates are not yet present.',
      evidenceRefs,
      fromState: recoveryCase.state,
      toState,
      occurredAt: now,
    })
  }

  private touchCase(recoveryCase: StoredRecoveryCase, now: number): void {
    const result = this.dependencies.database
      .prepare(
        `UPDATE recovery_cases SET updated_at = ?, version = version + 1
         WHERE id = ? AND version = ?`,
      )
      .run(now, recoveryCase.id, recoveryCase.version)
    if (Number(result.changes) !== 1) throw new Error('Recovery case changed concurrently')
  }

  private applyIntervention(
    command: ResolvedCreatorCommand,
    intervention: ReturnType<InterventionRepository['findByCaseId']>,
    now: number,
  ): string | null {
    if (command.action === 'approve') {
      if (!intervention) throw new Error('Recovery case has no intervention plan')
      this.interventions.finalize(command.caseId, 'approve', intervention.suggestedText, now)
      return intervention.suggestedText
    }
    if (command.action === 'edit') {
      this.interventions.finalize(command.caseId, 'edit', command.replacement, now)
      return command.replacement
    }
    if (command.action === 'sent') {
      this.interventions.confirmSent(command.caseId, now)
      return intervention?.finalText ?? null
    }
    return null
  }

  private updateCase(recoveryCase: StoredRecoveryCase, change: CaseTransition, now: number): void {
    const mutation = buildCaseMutation(
      recoveryCase,
      change,
      now,
      this.dependencies.timingProfile,
    )
    this.persistCaseMutation(recoveryCase, mutation, now)
  }

  private persistCaseMutation(
    recoveryCase: StoredRecoveryCase,
    mutation: CaseMutation,
    now: number,
  ): void {
    const result = this.dependencies.database
      .prepare(
        `UPDATE recovery_cases
         SET state = ?, updated_at = ?, monitoring_started_at = ?, resolution_due_at = ?,
             dismissed_until = ?, outcome_summary = ?, version = version + 1
         WHERE id = ? AND version = ?`,
      )
      .run(
        mutation.state,
        now,
        mutation.monitoringStartedAt,
        mutation.resolutionDueAt,
        mutation.dismissedUntil,
        mutation.outcomeSummary,
        recoveryCase.id,
        recoveryCase.version,
      )
    if (Number(result.changes) !== 1) throw new Error('Recovery case changed concurrently')
    this.scheduleTransitionDeadline(recoveryCase.id, mutation)
  }

  private scheduleTransitionDeadline(caseId: string, mutation: CaseMutation): void {
    if (mutation.resolutionDueAt !== null && mutation.state === 'monitoring') {
      this.insertDeadline(caseId, 'unresolved', mutation.resolutionDueAt)
    }
    if (mutation.dismissedUntil !== null && mutation.state === 'dismissed') {
      this.insertDeadline(caseId, 'cooling', mutation.dismissedUntil)
    }
  }

  private insertDeadline(
    caseId: string,
    kind: 'cooling' | 'unresolved',
    dueAt: number,
  ): void {
    const key = `${kind}:${caseId}:${dueAt}`
    this.dependencies.database
      .prepare(
        `INSERT INTO scheduled_deadlines
         (id, kind, case_id, due_at, idempotency_key, status)
         VALUES (?, ?, ?, ?, ?, 'pending')
         ON CONFLICT(idempotency_key) DO NOTHING`,
      )
      .run(key, kind, caseId, dueAt, key)
  }

  private appendCreatorEvent(
    recoveryCase: StoredRecoveryCase,
    change: CaseTransition,
    now: number,
  ): void {
    const id = this.idFactory()
    this.events.append({
      id,
      caseId: recoveryCase.id,
      idempotencyKey: `creator:${change.eventType}:${recoveryCase.version + 1}`,
      eventType: change.eventType,
      actor: 'creator',
      provenance: 'creator_decision',
      summary: eventSummary(change.eventType),
      evidenceRefs: [],
      fromState: change.fromState,
      toState: change.toState,
      occurredAt: now,
    })
  }

  private appendRejectedCommand(
    caseId: string,
    code: RejectedCreatorCommand['code'],
  ): void {
    const recoveryCase = this.requireCase(caseId)
    const eventId = this.idFactory()
    this.events.append({
      id: eventId,
      caseId,
      idempotencyKey: `creator:invalid:${eventId}`,
      eventType: 'invalid_command',
      actor: 'creator',
      provenance: 'creator_decision',
      summary: code === 'ambiguous_case'
        ? 'Creator command needed a specific recovery case.'
        : 'Creator command was not valid for the current case state.',
      evidenceRefs: [],
      fromState: recoveryCase.state,
      toState: recoveryCase.state,
      occurredAt: this.now(),
    })
  }

  private requireCase(id: string): StoredRecoveryCase {
    const recoveryCase = this.cases.findById(id)
    if (recoveryCase) return recoveryCase
    throw new Error(`Unknown recovery case: ${id}`)
  }

  private hasRecoveryEvidence(caseId: string): boolean {
    const row = this.dependencies.database
      .prepare(
        `SELECT
           MAX(CASE WHEN role = 'return_signal' THEN 1 ELSE 0 END) AS has_return,
           MAX(CASE WHEN role = 'constructive_interaction' THEN 1 ELSE 0 END) AS has_interaction
         FROM case_evidence WHERE case_id = ?`,
      )
      .get(caseId) as { has_return: number | null; has_interaction: number | null }
    return row.has_return === 1 && row.has_interaction === 1
  }

  private participantLabels(caseId: string): string[] {
    const rows = this.dependencies.database
      .prepare(
        `SELECT member_references.display_label
         FROM case_participants
         JOIN member_references ON member_references.id = case_participants.member_ref_id
         WHERE case_participants.case_id = ?
         ORDER BY CASE case_participants.role WHEN 'affected' THEN 0 ELSE 1 END,
                  member_references.display_label`,
      )
      .all(caseId) as unknown as Array<{ display_label: string }>
    return rows.map(({ display_label: label }) => label)
  }
}

function allowedActions(
  state: CaseState,
  hasFinalText: boolean,
  hasRecoveryEvidence: boolean,
): CreatorAction[] {
  if (state === 'needs_review') {
    return hasFinalText
      ? ['approve', 'edit', 'sent', 'dismiss']
      : ['approve', 'edit', 'dismiss']
  }
  if (state === 'monitoring') return ['still_unresolved']
  if (state === 'recovery_detected') {
    const actions: CreatorAction[] = ['not_recovered', 'still_unresolved']
    if (hasRecoveryEvidence) actions.unshift('confirm_recovery')
    return actions
  }
  return []
}

function toCaseAction(action: CreatorAction): CaseAction {
  const actions: Record<CreatorAction, CaseAction> = {
    approve: 'approve',
    edit: 'edit',
    sent: 'sent',
    dismiss: 'dismiss',
    confirm_recovery: 'confirm_recovery',
    not_recovered: 'reject_recovery',
    still_unresolved: 'mark_unresolved',
  }
  return actions[action]
}

function buildCaseMutation(
  recoveryCase: StoredRecoveryCase,
  change: CaseTransition,
  now: number,
  profile: TimingProfile,
): CaseMutation {
  let monitoringStartedAt = recoveryCase.monitoringStartedAt
  let resolutionDueAt = recoveryCase.resolutionDueAt
  let dismissedUntil = recoveryCase.dismissedUntil
  if (change.eventType === 'outreach_sent_confirmed') {
    monitoringStartedAt = now
    resolutionDueAt = deadlineFor(profile, 'unresolved', now)
  }
  if (change.eventType === 'case_dismissed') {
    dismissedUntil = deadlineFor(profile, 'dismissalCooling', now)
  }
  return {
    state: change.toState,
    monitoringStartedAt,
    resolutionDueAt,
    dismissedUntil,
    outcomeSummary: outcomeSummary(change.eventType, recoveryCase.outcomeSummary),
  }
}

function outcomeSummary(eventType: CaseTransition['eventType'], existing: string | null): string | null {
  if (eventType === 'recovery_confirmed') return 'Creator confirmed recovery.'
  if (eventType === 'case_expired') return 'Creator confirmed the fracture remains unresolved.'
  return existing
}

function eventSummary(eventType: CaseTransition['eventType']): string {
  const summaries: Record<CaseTransition['eventType'], string> = {
    draft_approved: 'Creator approved the suggested outreach.',
    draft_edited: 'Creator replaced the suggested outreach.',
    outreach_sent_confirmed: 'Creator confirmed they sent the outreach personally.',
    case_dismissed: 'Creator dismissed the recovery case.',
    recovery_detected: 'Recovery evidence met both required gates.',
    recovery_confirmed: 'Creator confirmed recovery.',
    recovery_rejected: 'Creator reported that recovery has not occurred.',
    case_expired: 'Creator confirmed the fracture remains unresolved.',
  }
  return summaries[eventType]
}

function assertEligibleFracture(input: OpenOrUpdateCaseInput): void {
  if (input.trigger === 'post_conflict_silence') {
    if (input.rememberedContextIds.length === 0) {
      throw new Error('Fracture is not eligible: missing baseline')
    }
    return
  }
  const assessment = assessConflictEligibility({
    hasRetainedBaseline: input.rememberedContextIds.length > 0,
    messages: input.messageEvidence,
    indicators: input.indicatorEvidence,
  })
  if (!assessment.eligible) {
    throw new Error(`Fracture is not eligible: missing ${assessment.missing.join(', ')}`)
  }
}

function analysisEvidenceRefs(input: OpenOrUpdateCaseInput): string[] {
  return unique([
    ...input.messageEvidence.map(({ observationId }) => observationId),
    ...input.observedChangeObservationIds,
    ...input.indicatorEvidence.flatMap(({ evidenceRefs }) => evidenceRefs),
    ...input.rememberedContextIds,
  ])
}

function fractureObservationIds(input: OpenOrUpdateCaseInput): string[] {
  return unique([
    ...input.messageEvidence.map(({ observationId }) => observationId),
    ...input.observedChangeObservationIds,
    ...input.indicatorEvidence.flatMap(({ evidenceRefs }) => evidenceRefs),
  ])
}

function recoveryObservationIds(input: RecordRecoveryEvidenceInput): string[] {
  return unique([
    ...input.returnSignals.map(({ observationId }) => observationId),
    ...input.constructiveInteractions.flatMap(({ observationIds }) => observationIds),
  ])
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function isTerminal(state: CaseState): boolean {
  return state === 'resolved' || state === 'unresolved' || state === 'dismissed'
}
