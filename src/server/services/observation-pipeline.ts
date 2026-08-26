import { createHash, createHmac, randomUUID } from 'node:crypto'

import type {
  GetHistoryOptions,
  MessageRecord,
  MessagingEvent,
} from '@animocabrands/minds-client-lib'

import type { IngestionCursorRepository } from '../db/repositories/ingestion-cursor-repository.js'
import type {
  NewObservation,
  ObservationRepository,
} from '../db/repositories/observation-repository.js'
import type { ReasoningObservation } from './reasoning-service.js'

type IngestibleSource = 'minds_telegram_group' | 'minds_creator_chat'
type IngestionDisposition = 'inserted' | 'duplicate' | 'skipped'

export interface ObservationSourceClient {
  getHistory(alias: string, options?: GetHistoryOptions): Promise<MessageRecord[]>
  events(alias: string, signal?: AbortSignal): AsyncGenerator<MessagingEvent>
}

interface ObservationPipelineDependencies {
  client: ObservationSourceClient
  observations: ObservationRepository
  cursors: IngestionCursorRepository
  alias: string
  communityId: string
  source: IngestibleSource
  memberHashKey: string
  maxAnalysisBatchSize: number
  status?: ObservationStatusStore
  onObservationCommitted?: (observationId: string) => Promise<void>
  idFactory?: () => string
  now?: () => number
}

interface ObservationStatusStore {
  markObserving(communityId: string, observedAt: number): void
  markDelayed(communityId: string, errorCode: string): void
}

export interface IngestionSummary {
  inserted: number
  duplicate: number
  skipped: number
}

interface ParsedHumanRow {
  fingerprint: string
  senderId: string | null
  senderName: string
  text: string
  occurredAt: number
}

export class ObservationPipeline {
  private readonly idFactory: () => string
  private readonly now: () => number

  constructor(private readonly dependencies: ObservationPipelineDependencies) {
    this.idFactory = dependencies.idFactory ?? randomUUID
    this.now = dependencies.now ?? Date.now
    if (dependencies.maxAnalysisBatchSize < 1) {
      throw new Error('maxAnalysisBatchSize must be positive')
    }
  }

  async catchUp(): Promise<IngestionSummary> {
    const cursor = this.dependencies.cursors.findByAlias(this.dependencies.alias)
    try {
      const rows = await this.dependencies.client.getHistory(this.dependencies.alias, {
        limit: 50,
        after: cursor?.lastFingerprint,
      })
      return this.ingestRows(rows)
    } catch (error) {
      this.dependencies.status?.markDelayed(
        this.dependencies.communityId,
        'minds_history_unavailable',
      )
      throw error
    }
  }

  async run(signal?: AbortSignal): Promise<void> {
    await this.catchUp()
    try {
      for await (const event of this.dependencies.client.events(this.dependencies.alias, signal)) {
        await this.ingestRow(event)
      }
    } catch (error) {
      this.dependencies.status?.markDelayed(
        this.dependencies.communityId,
        'minds_stream_unavailable',
      )
      throw error
    }
  }

  analysisBatch(): ReasoningObservation[] {
    return this.dependencies.observations
      .listRecentCommunityEvidence(
        this.dependencies.communityId,
        this.dependencies.maxAnalysisBatchSize,
      )
      .map((observation) => ({
        id: observation.id,
        memberRefId: observation.memberRefId,
        senderType: 1,
        occurredAt: new Date(observation.occurredAt).toISOString(),
        evidenceExcerpt: observation.evidenceExcerpt,
      }))
  }

  private async ingestRows(rows: MessageRecord[]): Promise<IngestionSummary> {
    const summary: IngestionSummary = { inserted: 0, duplicate: 0, skipped: 0 }
    for (const row of rows) summary[await this.ingestRow(row)] += 1
    return summary
  }

  private async ingestRow(row: MessageRecord): Promise<IngestionDisposition> {
    const parsed = parseHumanRow(row, this.dependencies.source)
    if (!parsed) return 'skipped'

    const observation = this.buildObservation(parsed)
    const cursor = {
      alias: this.dependencies.alias,
      lastFingerprint: parsed.fingerprint,
      updatedAt: observation.ingestedAt,
    }
    const disposition = this.persistObservation(parsed, observation, cursor)
    if (disposition === 'inserted') {
      this.dependencies.status?.markObserving(this.dependencies.communityId, parsed.occurredAt)
      await this.dependencies.onObservationCommitted?.(observation.id)
    }
    return disposition
  }

  private persistObservation(
    parsed: ParsedHumanRow,
    observation: Omit<NewObservation, 'memberRefId'>,
    cursor: { alias: string; lastFingerprint: string; updatedAt: number },
  ): Exclude<IngestionDisposition, 'skipped'> {
    if (this.dependencies.source === 'minds_creator_chat') {
      return this.dependencies.observations.appendWithCursor(
        { ...observation, memberRefId: null },
        cursor,
      )
    }
    return this.dependencies.observations.appendHumanWithCursor(observation, cursor, {
      id: this.idFactory(),
      communityId: this.dependencies.communityId,
      externalRefHash: hashMember(requireSenderId(parsed), this.dependencies.memberHashKey),
      displayLabel: parsed.senderName,
      activeAt: parsed.occurredAt,
    })
  }

  private buildObservation(parsed: ParsedHumanRow): Omit<NewObservation, 'memberRefId'> {
    return {
      id: this.idFactory(),
      communityId: this.dependencies.communityId,
      source: this.dependencies.source,
      sourceFingerprint: parsed.fingerprint,
      sessionRef: new Date(parsed.occurredAt).toISOString().slice(0, 10),
      occurredAt: parsed.occurredAt,
      ingestedAt: this.now(),
      evidenceExcerpt: parsed.text.slice(0, 500),
      contentDigest: createHash('sha256').update(parsed.text).digest('hex'),
      visibility: 'internal',
    }
  }
}

function parseHumanRow(row: MessageRecord, source: IngestibleSource): ParsedHumanRow | null {
  if (row.senderType !== 1 || !row.fingerprint) return null
  const text = row.messageText?.trim()
  const occurredAt = row.createdAt ? Date.parse(row.createdAt) : Number.NaN
  if (!text || !Number.isFinite(occurredAt)) return null

  const senderId = row.senderId ?? row.senderEmail ?? null
  if (source === 'minds_telegram_group' && !senderId) return null
  return {
    fingerprint: row.fingerprint,
    senderId,
    senderName: sanitizeLabel(row.senderName ?? 'Community member'),
    text,
    occurredAt,
  }
}

function sanitizeLabel(label: string): string {
  const trimmed = label.trim()
  return (trimmed || 'Community member').slice(0, 128)
}

function hashMember(senderId: string, key: string): string {
  return createHmac('sha256', key).update(senderId).digest('hex')
}

function requireSenderId(row: ParsedHumanRow): string {
  if (row.senderId) return row.senderId
  throw new Error('Community observation is missing a sender ID')
}
