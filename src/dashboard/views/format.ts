import type { Actor, Provenance } from '../../domain/types.js'

const STATE_LABELS: Record<string, string> = {
  needs_review: 'Needs review',
  monitoring: 'Monitoring',
  recovery_detected: 'Recovery detected',
  resolved: 'Resolved',
  unresolved: 'Unresolved',
  dismissed: 'Dismissed',
}

const PROVENANCE_LABELS: Record<Provenance, string> = {
  observation: 'Community message',
  remembered_context: 'Remembered context',
  mind_inference: 'Mind inference',
  creator_decision: 'Creator decision',
  external_operation: 'External operation',
}

const ACTOR_LABELS: Record<Actor, string> = {
  community_member: 'Community member',
  mind: 'Mind',
  creator: 'Creator',
  system: 'System',
  external_service: 'External service',
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    }
    return entities[character] ?? character
  })
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value))
}

export function stateLabel(value: string): string {
  return STATE_LABELS[value] ?? value.replaceAll('_', ' ')
}

export function provenanceLabel(value: Provenance): string {
  return PROVENANCE_LABELS[value]
}

export function actorLabel(value: Actor): string {
  return ACTOR_LABELS[value]
}

export function observationLabel(value: string): string {
  const labels: Record<string, string> = {
    learning: 'Learning relationship context',
    observing: 'Observing quietly',
    delayed: 'Observation delayed',
    error: 'Observation needs attention',
  }
  return labels[value] ?? value
}
