import { createHash, randomUUID } from 'node:crypto'

import type { WaitForReplyOutcome } from '@animocabrands/minds-client-lib'

import type { AnalysisKind, MindAnalysis, ReasoningStatus } from '../../domain/types.js'
import { parseMindAnalysis } from '../../domain/validation.js'
import type {
  NewReasoningRun,
  ReasoningCompletion,
} from '../db/repositories/reasoning-run-repository.js'
import type { SendAndWaitInput } from '../integrations/minds-adapter.js'

export interface ReasoningObservation {
  id: string
  memberRefId: string | null
  senderType: number | null
  occurredAt: string
  evidenceExcerpt: string
}

export interface ReasoningTransport {
  sendAndWait(input: SendAndWaitInput): Promise<WaitForReplyOutcome>
}

export interface ReasoningRunStore {
  create(run: NewReasoningRun): void
  complete(id: string, completion: ReasoningCompletion): void
}

interface ReasoningServiceDependencies {
  transport: ReasoningTransport
  store: ReasoningRunStore
  engineAlias: string
  idFactory?: () => string
  now?: () => number
}

export interface AnalyzeRequest {
  analysisKind: AnalysisKind
  observations: ReasoningObservation[]
  timeoutMs: number
  signal?: AbortSignal
}

interface ReasoningResultBase {
  status: Exclude<ReasoningStatus, 'pending'>
  runId: string | null
  inputDigest: string
}

export interface ReasoningSuccess extends ReasoningResultBase {
  status: 'succeeded'
  analysis: MindAnalysis
  replyFingerprint: string
}

export interface ReasoningFailure extends ReasoningResultBase {
  status: 'timed_out' | 'invalid' | 'failed'
  errorCode: string
}

export type ReasoningResult = ReasoningSuccess | ReasoningFailure

interface ActiveRun {
  id: string
  inputDigest: string
  deadline: number
}

export class ReasoningService {
  private readonly idFactory: () => string
  private readonly now: () => number

  constructor(private readonly dependencies: ReasoningServiceDependencies) {
    this.idFactory = dependencies.idFactory ?? randomUUID
    this.now = dependencies.now ?? Date.now
  }

  async analyze(request: AnalyzeRequest): Promise<ReasoningResult> {
    const inputDigest = digestRequest(request)
    if (request.observations.some((observation) => observation.senderType !== 1)) {
      return invalidInput(inputDigest, 'non_human_observation')
    }

    const run = this.startRun(request, inputDigest)
    let outcome: WaitForReplyOutcome
    try {
      outcome = await this.dependencies.transport.sendAndWait({
        alias: this.dependencies.engineAlias,
        messageText: buildMindRequest(request),
        timeoutMs: request.timeoutMs,
        signal: request.signal,
      })
    } catch {
      return this.finishFailure(run, 'failed', 'minds_request_failed')
    }
    return this.processOutcome(run, request, outcome)
  }

  private startRun(request: AnalyzeRequest, inputDigest: string): ActiveRun {
    const startedAt = this.now()
    const id = this.idFactory()
    this.dependencies.store.create({
      id,
      inputDigest,
      analysisKind: request.analysisKind,
      engineAlias: this.dependencies.engineAlias,
      inputObservationIds: request.observations.map(({ id: observationId }) => observationId),
      startedAt,
    })
    return { id, inputDigest, deadline: startedAt + request.timeoutMs }
  }

  private processOutcome(
    run: ActiveRun,
    request: AnalyzeRequest,
    outcome: WaitForReplyOutcome,
  ): ReasoningResult {
    if (outcome.timedOut) return this.finishFailure(run, 'timed_out', 'reply_timeout')
    if (!isMindSender(outcome.reply.senderType)) {
      return this.finishFailure(run, 'invalid', 'non_mind_reply')
    }
    if (isLate(outcome.reply.createdAt, run.deadline)) {
      return this.finishFailure(run, 'timed_out', 'late_reply')
    }

    const parsed = parseReply(outcome.reply.messageText, request)
    if ('errorCode' in parsed) return this.finishFailure(run, 'invalid', parsed.errorCode)

    this.finishRun(run.id, 'succeeded', parsed.analysis, null)
    return {
      status: 'succeeded',
      runId: run.id,
      inputDigest: run.inputDigest,
      analysis: parsed.analysis,
      replyFingerprint: outcome.reply.fingerprint,
    }
  }

  private finishFailure(
    run: ActiveRun,
    status: ReasoningFailure['status'],
    errorCode: string,
  ): ReasoningFailure {
    this.finishRun(run.id, status, null, errorCode)
    return { status, runId: run.id, inputDigest: run.inputDigest, errorCode }
  }

  private finishRun(
    id: string,
    status: ReasoningCompletion['status'],
    response: MindAnalysis | null,
    errorCode: string | null,
  ): void {
    this.dependencies.store.complete(id, {
      status,
      response,
      errorCode,
      completedAt: this.now(),
    })
  }
}

function digestRequest(request: AnalyzeRequest): string {
  const content = JSON.stringify({
    analysisKind: request.analysisKind,
    observations: request.observations,
  })
  return createHash('sha256').update(content).digest('hex')
}

function buildMindRequest(request: AnalyzeRequest): string {
  return JSON.stringify({
    schemaVersion: 'vibecheck.request.v1',
    analysisKind: request.analysisKind,
    instruction:
      'Return only vibecheck.analysis.v1 JSON. Ground every claim in supplied observation IDs and preserve uncertainty.',
    observations: request.observations,
  })
}

function parseReply(
  messageText: string | null | undefined,
  request: AnalyzeRequest,
): { analysis: MindAnalysis } | { errorCode: string } {
  let body: unknown
  try {
    body = JSON.parse(messageText ?? '')
  } catch {
    return { errorCode: 'malformed_json' }
  }

  try {
    const knownRefs = new Set(request.observations.map(({ id }) => id))
    const analysis = parseMindAnalysis(body, knownRefs)
    if (analysis.analysisKind !== request.analysisKind) return { errorCode: 'analysis_kind_mismatch' }
    return { analysis }
  } catch (error) {
    return {
      errorCode:
        error instanceof Error && error.message.includes('unknown observation reference')
          ? 'unknown_observation_ref'
          : 'invalid_schema',
    }
  }
}

function isMindSender(senderType: number | null | undefined): boolean {
  return senderType === 0 || senderType === 2
}

function isLate(createdAt: string | undefined, deadline: number): boolean {
  if (!createdAt) return false
  const timestamp = Date.parse(createdAt)
  return Number.isFinite(timestamp) && timestamp > deadline
}

function invalidInput(inputDigest: string, errorCode: string): ReasoningFailure {
  return { status: 'invalid', runId: null, inputDigest, errorCode }
}
