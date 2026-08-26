import type { Actor, Provenance } from './types.js'

const ALLOWED_ACTORS: Record<Provenance, readonly Actor[]> = {
  observation: ['community_member', 'system'],
  remembered_context: ['mind', 'system'],
  mind_inference: ['mind'],
  creator_decision: ['creator'],
  external_operation: ['external_service', 'system'],
}

export function hasValidActorProvenance(actor: Actor, provenance: Provenance): boolean {
  return ALLOWED_ACTORS[provenance].includes(actor)
}

export function parseEvidenceReferences(value: string): string[] {
  const references: unknown = JSON.parse(value)
  if (!Array.isArray(references) || !references.every((reference) => typeof reference === 'string')) {
    throw new TypeError('Case event evidence references are invalid')
  }
  return references
}
