import type { DatabaseSync } from 'node:sqlite'

import type { CaseState } from '../../domain/case-state.js'
import { hasValidActorProvenance, parseEvidenceReferences } from '../../domain/provenance.js'
import type {
  CaseSummary,
  RecoveryOverview,
} from '../../domain/types.js'
import type { CreatorSessionView } from '../auth/session-service.js'
import { OperationalError } from '../errors.js'

interface CommunityRow {
  display_name: string
  observation_status: RecoveryOverview['observationStatus']
  timing_profile: RecoveryOverview['timingProfile']
}

interface CaseRow {
  id: string
  trigger: CaseSummary['trigger']
  state: CaseState
  confidence: number
  uncertainty: string
  updated_at: number
}

interface EventRow {
  id: string
  event_type: string
  actor: 'community_member' | 'mind' | 'creator' | 'system' | 'external_service'
  provenance: 'observation' | 'remembered_context' | 'mind_inference' | 'creator_decision' | 'external_operation'
  summary: string
  evidence_refs_json: string
  to_state: CaseState
  occurred_at: number
}

interface EvidenceView {
  source: string
  excerpt: string
}

export interface RecoveryCaseDetailView extends CaseSummary {
  rememberedContext: string[]
  suggestedOutreach: string
  finalOutreach: string | null
  timeline: Array<{
    id: string
    eventType: string
    actor: EventRow['actor']
    provenance: EventRow['provenance']
    summary: string
    evidence: EvidenceView[]
    resultingState: CaseState
    occurredAt: string
  }>
}

export class RecoveryReadService {
  constructor(
    private readonly database: DatabaseSync,
    private readonly communityId: string,
  ) {}

  overview(session: CreatorSessionView): RecoveryOverview {
    const community = this.requireCommunity()
    const cases = this.listCases()
    const activeCases = cases.filter(({ state }) => isActive(state))
    const terminalCases = cases.filter(({ state }) => !isActive(state)).slice(0, 5)
    return {
      creator: toCreator(session.creator),
      community: { displayName: community.display_name },
      observationStatus: community.observation_status,
      timingProfile: community.timing_profile,
      counts: {
        open: activeCases.length,
        resolved: cases.filter(({ state }) => state === 'resolved').length,
        unresolved: cases.filter(({ state }) => state === 'unresolved').length,
        awaitingAction: cases.filter(({ state }) => isAwaitingAction(state)).length,
      },
      cases: activeCases,
      recentOutcomes: terminalCases,
    }
  }

  detail(caseId: string): RecoveryCaseDetailView {
    const row = this.findCase(caseId)
    if (!row) throw recoveryCaseNotFound()
    const summary = this.toCaseSummary(row)
    const intervention = this.database
      .prepare(
        `SELECT suggested_text, final_text FROM intervention_plans WHERE case_id = ?`,
      )
      .get(caseId) as { suggested_text: string; final_text: string | null } | undefined
    if (!intervention) throw readUnavailable()
    return {
      ...summary,
      rememberedContext: this.rememberedContext(caseId),
      suggestedOutreach: intervention.suggested_text,
      finalOutreach: intervention.final_text,
      timeline: this.timeline(caseId),
    }
  }

  private requireCommunity(): CommunityRow {
    const row = this.database
      .prepare(
        `SELECT display_name, observation_status, timing_profile
         FROM communities WHERE id = ?`,
      )
      .get(this.communityId) as CommunityRow | undefined
    if (!row) throw readUnavailable()
    return row
  }

  private listCases(): CaseSummary[] {
    const rows = this.database
      .prepare(
        `SELECT id, trigger, state, confidence, uncertainty, updated_at
         FROM recovery_cases WHERE community_id = ?
         ORDER BY updated_at DESC, id`,
      )
      .all(this.communityId) as unknown as CaseRow[]
    return rows.map((row) => this.toCaseSummary(row))
  }

  private findCase(caseId: string): CaseRow | null {
    const row = this.database
      .prepare(
        `SELECT id, trigger, state, confidence, uncertainty, updated_at
         FROM recovery_cases WHERE id = ? AND community_id = ?`,
      )
      .get(caseId, this.communityId) as CaseRow | undefined
    return row ?? null
  }

  private toCaseSummary(row: CaseRow): CaseSummary {
    return {
      id: row.id,
      trigger: row.trigger,
      state: row.state,
      people: this.people(row.id),
      observedChange: this.observedChange(row.id),
      confidence: row.confidence,
      uncertainty: row.uncertainty,
      awaitingCreatorAction: isAwaitingAction(row.state),
      updatedAt: new Date(row.updated_at).toISOString(),
    }
  }

  private people(caseId: string): string[] {
    const rows = this.database
      .prepare(
        `SELECT member_references.display_label
         FROM case_participants
         JOIN member_references ON member_references.id = case_participants.member_ref_id
         WHERE case_participants.case_id = ?
         ORDER BY CASE case_participants.role WHEN 'affected' THEN 0 ELSE 1 END,
                  member_references.display_label`,
      )
      .all(caseId) as unknown as Array<{ display_label: string }>
    return rows.map(({ display_label }) => display_label)
  }

  private observedChange(caseId: string): string {
    const row = this.database
      .prepare(
        `SELECT observations.evidence_excerpt
         FROM case_evidence
         JOIN observations ON observations.id = case_evidence.evidence_id
         WHERE case_evidence.case_id = ? AND case_evidence.role = 'observed_change'
         ORDER BY observations.occurred_at LIMIT 1`,
      )
      .get(caseId) as { evidence_excerpt: string } | undefined
    return row?.evidence_excerpt ?? ''
  }

  private rememberedContext(caseId: string): string[] {
    const rows = this.database
      .prepare(
        `SELECT community_context.statement
         FROM case_evidence
         JOIN community_context ON community_context.id = case_evidence.evidence_id
         WHERE case_evidence.case_id = ? AND case_evidence.role = 'remembered_context'
         ORDER BY community_context.created_at`,
      )
      .all(caseId) as unknown as Array<{ statement: string }>
    return rows.map(({ statement }) => statement)
  }

  private timeline(caseId: string): RecoveryCaseDetailView['timeline'] {
    const rows = this.database
      .prepare(
        `SELECT id, event_type, actor, provenance, summary, evidence_refs_json,
                to_state, occurred_at
         FROM case_events WHERE case_id = ? ORDER BY occurred_at, rowid`,
      )
      .all(caseId) as unknown as EventRow[]
    return rows.map((row) => this.toTimelineEvent(row))
  }

  private toTimelineEvent(row: EventRow): RecoveryCaseDetailView['timeline'][number] {
    if (!hasValidActorProvenance(row.actor, row.provenance)) throw provenanceUnavailable()
    let references: string[]
    try {
      references = parseEvidenceReferences(row.evidence_refs_json)
    } catch {
      throw provenanceUnavailable()
    }
    return {
      id: row.id,
      eventType: row.event_type,
      actor: row.actor,
      provenance: row.provenance,
      summary: row.summary,
      evidence: this.resolveEvidence(references),
      resultingState: row.to_state,
      occurredAt: new Date(row.occurred_at).toISOString(),
    }
  }

  private resolveEvidence(references: string[]): EvidenceView[] {
    return references.map((reference) => {
      const observation = this.database
        .prepare('SELECT source, evidence_excerpt FROM observations WHERE id = ?')
        .get(reference) as { source: string; evidence_excerpt: string } | undefined
      if (observation) {
        return { source: observationSourceLabel(observation.source), excerpt: observation.evidence_excerpt }
      }
      const context = this.database
        .prepare('SELECT kind, statement FROM community_context WHERE id = ?')
        .get(reference) as { kind: 'norm' | 'relationship'; statement: string } | undefined
      if (context) return { source: `remembered ${context.kind}`, excerpt: context.statement }
      throw provenanceUnavailable()
    })
  }
}

function toCreator(identity: CreatorSessionView['creator']): RecoveryOverview['creator'] {
  return {
    telegramUserId: identity.telegramUserId,
    displayName: identity.displayName,
    username: identity.username,
    photoUrl: identity.photoUrl,
  }
}

function isActive(state: CaseState): boolean {
  return ['needs_review', 'monitoring', 'recovery_detected'].includes(state)
}

function isAwaitingAction(state: CaseState): boolean {
  return state === 'needs_review' || state === 'recovery_detected'
}

function observationSourceLabel(source: string): string {
  if (source === 'telegram_webhook_group' || source === 'minds_telegram_group') {
    return 'community message'
  }
  if (source === 'telegram_webhook_creator' || source === 'minds_creator_chat') {
    return 'creator command'
  }
  return 'scheduler signal'
}

function recoveryCaseNotFound(): OperationalError {
  return new OperationalError({
    code: 'recovery_case_not_found',
    title: 'Recovery case not found',
    status: 404,
    retryable: false,
  })
}

function readUnavailable(): OperationalError {
  return new OperationalError({
    code: 'recovery_data_unavailable',
    title: 'Recovery data unavailable',
    status: 503,
    retryable: true,
  })
}

function provenanceUnavailable(): OperationalError {
  return new OperationalError({
    code: 'recovery_provenance_invalid',
    title: 'Recovery timeline delayed',
    status: 503,
    retryable: true,
  })
}
