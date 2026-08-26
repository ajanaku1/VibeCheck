import { describe, expect, it } from 'vitest'

import type { RecoveryCaseDetailView, TimelineEventView } from '../../src/dashboard/api.js'
import { renderCaseDetail } from '../../src/dashboard/views/case-detail.js'

describe('creator-facing provenance', () => {
  it('names the source, actor classification, and resulting state for every event', () => {
    const html = renderCaseDetail(detailWithAllProvenanceClasses())

    expect(html).toContain('Community message')
    expect(html).toContain('Community member')
    expect(html).toContain('Remembered context')
    expect(html).toContain('System')
    expect(html).toContain('Mind inference')
    expect(html).toContain('Mind')
    expect(html).toContain('Creator decision')
    expect(html).toContain('Creator')
    expect(html).toContain('External operation')
    expect(html).toContain('External service')
    expect(html.match(/Resulting state: Needs review/g)).toHaveLength(5)
  })
})

function detailWithAllProvenanceClasses(): RecoveryCaseDetailView {
  const occurredAt = '2026-08-18T12:00:00.000Z'
  const classes: Array<Pick<TimelineEventView, 'actor' | 'provenance'>> = [
    { actor: 'community_member', provenance: 'observation' },
    { actor: 'system', provenance: 'remembered_context' },
    { actor: 'mind', provenance: 'mind_inference' },
    { actor: 'creator', provenance: 'creator_decision' },
    { actor: 'external_service', provenance: 'external_operation' },
  ]
  return {
    id: '22222222-2222-4222-8222-222222222222',
    trigger: 'escalating_conflict',
    state: 'needs_review',
    people: ['Alex', 'Sam'],
    observedChange: 'The exchange became personal.',
    confidence: 0.82,
    uncertainty: 'Intent remains uncertain.',
    awaitingCreatorAction: true,
    updatedAt: occurredAt,
    rememberedContext: ['They usually repair disagreements quickly.'],
    suggestedOutreach: 'Check in privately.',
    finalOutreach: null,
    timeline: classes.map((classification, index) => ({
      id: `event-${index}`,
      eventType: 'case_opened',
      ...classification,
      summary: `Event ${index + 1}`,
      evidence: [],
      resultingState: 'needs_review',
      occurredAt,
    })),
  }
}
