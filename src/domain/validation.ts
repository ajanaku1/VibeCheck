import { z } from 'zod'

import type { MindAnalysis } from './types.js'

const uuidSchema = z.uuid()
const timestampSchema = z.iso.datetime()
const caseStateSchema = z.enum([
  'needs_review',
  'monitoring',
  'recovery_detected',
  'resolved',
  'unresolved',
  'dismissed',
])
const triggerSchema = z.enum(['escalating_conflict', 'post_conflict_silence'])
const confidenceSchema = z.number().min(0).max(1)
const evidenceRefsSchema = z.array(uuidSchema).min(1).refine(hasUniqueItems, 'Duplicate evidence ref')

function hasUniqueItems(values: string[]): boolean {
  return new Set(values).size === values.length
}

const evidenceDecisionSchema = z
  .strictObject({
    present: z.boolean(),
    evidenceRefs: z.array(uuidSchema).refine(hasUniqueItems, 'Duplicate evidence ref'),
    explanation: z.string().max(500),
  })
  .superRefine((decision, context) => {
    if (decision.present && decision.evidenceRefs.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'Evidence refs are required when a recovery signal is present',
        path: ['evidenceRefs'],
      })
    }
  })

export const mindAnalysisSchema = z
  .strictObject({
    schemaVersion: z.literal('vibecheck.analysis.v1'),
    analysisKind: z.enum(['baseline', 'fracture', 'recovery', 'draft']),
    observationRefs: evidenceRefsSchema,
    involvedMemberRefs: z.array(uuidSchema).refine(hasUniqueItems, 'Duplicate member ref').default([]),
    context: z.array(
      z.strictObject({
        kind: z.enum(['norm', 'relationship']),
        statement: z.string().min(1).max(500),
        evidenceRefs: evidenceRefsSchema,
        confidence: confidenceSchema,
      }),
    ),
    escalationIndicators: z
      .array(
        z.strictObject({
          type: z.enum([
            'direct_personal_criticism',
            'contempt_or_dismissal',
            'hostile_contradiction_after_deescalation',
            'explicit_intent_to_disengage',
          ]),
          evidenceRefs: evidenceRefsSchema,
          explanation: z.string().min(1).max(500),
        }),
      )
      .refine(
        (indicators) => hasUniqueItems(indicators.map((indicator) => indicator.type)),
        'Duplicate escalation indicator',
      ),
    recoverySignals: z.strictObject({
      affectedMemberReturned: evidenceDecisionSchema,
      relevantConstructiveInteraction: evidenceDecisionSchema,
    }),
    confidence: confidenceSchema,
    uncertainty: z.string().min(1).max(500),
    observedChange: z.string().max(500).nullable().optional(),
    suggestedOutreach: z.string().max(2_000).nullable().optional(),
    recommendedAction: z.enum([
      'retain_context',
      'observe_only',
      'open_or_update_case',
      'request_recovery_confirmation',
      'no_action',
    ]),
  })
  .superRefine((analysis, context) => {
    const minimumMembers = analysis.analysisKind === 'fracture' ? 2 : 1
    const requiresMembers = analysis.analysisKind === 'fracture' || analysis.analysisKind === 'recovery'
    if (requiresMembers && analysis.involvedMemberRefs.length < minimumMembers) {
      context.addIssue({
        code: 'custom',
        message: `${analysis.analysisKind} analysis requires ${minimumMembers} involved member refs`,
        path: ['involvedMemberRefs'],
      })
    }
  })

export const telegramAuthPayloadSchema = z.strictObject({
  id: z.string().regex(/^[1-9]\d*$/),
  first_name: z.string().min(1).max(128),
  last_name: z.string().max(128).optional(),
  username: z.string().max(64).optional(),
  photo_url: z.url().optional(),
  auth_date: z.coerce.number().int().positive(),
  hash: z.string().regex(/^[a-fA-F0-9]{64}$/),
})

export const creatorSchema = z.strictObject({
  telegramUserId: z.string(),
  displayName: z.string(),
  username: z.string().nullable().optional(),
  photoUrl: z.url().nullable().optional(),
})

export const sessionSchema = z.strictObject({
  creator: creatorSchema,
  expiresAt: timestampSchema,
})

export const caseSummarySchema = z.strictObject({
  id: uuidSchema,
  trigger: triggerSchema,
  state: caseStateSchema,
  people: z.array(z.string()).min(1),
  observedChange: z.string(),
  confidence: confidenceSchema,
  uncertainty: z.string(),
  awaitingCreatorAction: z.boolean(),
  updatedAt: timestampSchema,
})

export const recoveryOverviewSchema = z.strictObject({
  creator: creatorSchema,
  community: z.strictObject({ displayName: z.string() }),
  observationStatus: z.enum(['learning', 'observing', 'delayed', 'error']),
  timingProfile: z.enum(['demo', 'standard']),
  counts: z.strictObject({
    open: z.number().int().nonnegative(),
    resolved: z.number().int().nonnegative(),
    unresolved: z.number().int().nonnegative(),
    awaitingAction: z.number().int().nonnegative(),
  }),
  cases: z.array(caseSummarySchema),
  recentOutcomes: z.array(caseSummarySchema).max(5),
})

export const timelineEventSchema = z.strictObject({
  id: uuidSchema,
  eventType: z.string(),
  actor: z.enum(['community_member', 'mind', 'creator', 'system', 'external_service']),
  provenance: z.enum([
    'observation',
    'remembered_context',
    'mind_inference',
    'creator_decision',
    'external_operation',
  ]),
  summary: z.string(),
  evidence: z.array(z.strictObject({ source: z.string(), excerpt: z.string() })),
  resultingState: caseStateSchema,
  occurredAt: timestampSchema,
})

export const recoveryCaseDetailSchema = caseSummarySchema.extend({
  rememberedContext: z.array(z.string()),
  suggestedOutreach: z.string(),
  finalOutreach: z.string().nullable(),
  timeline: z.array(timelineEventSchema),
})

export const problemSchema = z.strictObject({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  code: z.string(),
  detail: z.string().optional(),
  retryable: z.boolean().optional(),
})

function collectEvidenceRefs(analysis: MindAnalysis): string[] {
  return [
    ...analysis.observationRefs,
    ...analysis.context.flatMap((entry) => entry.evidenceRefs),
    ...analysis.escalationIndicators.flatMap((entry) => entry.evidenceRefs),
    ...analysis.recoverySignals.affectedMemberReturned.evidenceRefs,
    ...analysis.recoverySignals.relevantConstructiveInteraction.evidenceRefs,
  ]
}

export function parseMindAnalysis(
  input: unknown,
  knownObservationRefs: ReadonlySet<string>,
): MindAnalysis {
  const analysis = mindAnalysisSchema.parse(input)
  const unknownRef = collectEvidenceRefs(analysis).find(
    (reference) => !knownObservationRefs.has(reference),
  )
  if (unknownRef) {
    throw new Error(`Mind analysis contains unknown observation reference: ${unknownRef}`)
  }
  return analysis
}
