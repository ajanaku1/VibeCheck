import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type {
  Conversation,
  EventsIteratorOptions,
  GetHistoryOptions,
  MessageRecord,
  MessagingEvent,
  SendMessageBody,
  WaitForReplyOptions,
  WaitForReplyOutcome,
} from '@animocabrands/minds-client-lib'
import { describe, expect, it } from 'vitest'

import type { MindAnalysis } from '../../src/domain/types.js'
import {
  MindsAdapter,
  type MindsMessagingClient,
} from '../../src/server/integrations/minds-adapter.js'
import {
  ReasoningService,
  type ReasoningObservation,
  type ReasoningRunStore,
  type ReasoningTransport,
} from '../../src/server/services/reasoning-service.js'

const OBSERVATION_ONE = '11111111-1111-4111-8111-111111111111'
const OBSERVATION_TWO = '22222222-2222-4222-8222-222222222222'
const MEMBER_ONE = '33333333-3333-4333-8333-333333333333'
const MEMBER_TWO = '44444444-4444-4444-8444-444444444444'
const UNKNOWN_OBSERVATION = '99999999-9999-4999-8999-999999999999'
const RUN_ID = '55555555-5555-4555-8555-555555555555'
const STARTED_AT = Date.parse('2026-08-17T12:00:00.000Z')

class FakeReasoningTransport implements ReasoningTransport {
  readonly calls: Array<{
    alias: string
    messageText: string
    timeoutMs: number
    signal?: AbortSignal
  }> = []

  constructor(private readonly outcome: WaitForReplyOutcome) {}

  sendAndWait(input: {
    alias: string
    messageText: string
    timeoutMs: number
    signal?: AbortSignal
  }): Promise<WaitForReplyOutcome> {
    this.calls.push(input)
    return Promise.resolve(this.outcome)
  }
}

class FakeReasoningRunStore implements ReasoningRunStore {
  readonly created: Parameters<ReasoningRunStore['create']>[0][] = []
  readonly completed: Array<{
    id: string
    completion: Parameters<ReasoningRunStore['complete']>[1]
  }> = []

  create(run: Parameters<ReasoningRunStore['create']>[0]): void {
    this.created.push(run)
  }

  complete(id: string, completion: Parameters<ReasoningRunStore['complete']>[1]): void {
    this.completed.push({ id, completion })
  }
}

function humanObservations(): ReasoningObservation[] {
  return [
    {
      id: OBSERVATION_ONE,
      memberRefId: MEMBER_ONE,
      senderType: 1,
      occurredAt: '2026-08-17T11:58:00.000Z',
      evidenceExcerpt: 'Alex dismissed Sam by name after Sam tried to cool things down.',
    },
    {
      id: OBSERVATION_TWO,
      memberRefId: MEMBER_TWO,
      senderType: 1,
      occurredAt: '2026-08-17T11:59:00.000Z',
      evidenceExcerpt: 'Sam said they were leaving the project chat.',
    },
  ]
}

function validAnalysis(overrides: Partial<MindAnalysis> = {}): MindAnalysis {
  return {
    schemaVersion: 'vibecheck.analysis.v1',
    analysisKind: 'fracture',
    observationRefs: [OBSERVATION_ONE, OBSERVATION_TWO],
    involvedMemberRefs: [MEMBER_ONE, MEMBER_TWO],
    context: [],
    escalationIndicators: [
      {
        type: 'contempt_or_dismissal',
        evidenceRefs: [OBSERVATION_ONE],
        explanation: 'One member dismissed the other after de-escalation.',
      },
      {
        type: 'explicit_intent_to_disengage',
        evidenceRefs: [OBSERVATION_TWO],
        explanation: 'A member explicitly said they were leaving.',
      },
    ],
    recoverySignals: {
      affectedMemberReturned: { present: false, evidenceRefs: [], explanation: 'Not observed.' },
      relevantConstructiveInteraction: {
        present: false,
        evidenceRefs: [],
        explanation: 'Not observed.',
      },
    },
    confidence: 0.82,
    uncertainty: 'Only the supplied excerpts are available.',
    observedChange: 'The disagreement escalated into disengagement.',
    suggestedOutreach: 'Acknowledge the rupture and invite a private reset.',
    recommendedAction: 'open_or_update_case',
    ...overrides,
  }
}

function replyWith(body: unknown, createdAt = '2026-08-17T12:00:00.500Z'): WaitForReplyOutcome {
  return {
    timedOut: false,
    reply: {
      fingerprint: 'mind-reply-1',
      senderType: 0,
      messageText: typeof body === 'string' ? body : JSON.stringify(body),
      createdAt,
    },
  }
}

function createService(outcome: WaitForReplyOutcome) {
  const transport = new FakeReasoningTransport(outcome)
  const store = new FakeReasoningRunStore()
  const service = new ReasoningService({
    transport,
    store,
    engineAlias: 'vibecheck-engine',
    idFactory: () => RUN_ID,
    now: () => STARTED_AT,
  })
  return { service, store, transport }
}

describe('MindsAdapter', () => {
  it('ensures aliases and correlates a reply with the pre-send fingerprint', async () => {
    const calls: string[] = []
    let waitOptions: WaitForReplyOptions | undefined
    const client = createFakeMindsClient({
      ensureConversation: async (alias, mindId) => {
        calls.push(`ensure:${alias}:${mindId}`)
        return { alias, mindId, conversationId: 'conversation-1' }
      },
      getLatestHistoryFingerprint: async (alias) => {
        calls.push(`fingerprint:${alias}`)
        return 'before-send'
      },
      sendMessage: async ({ alias, messageText }) => {
        calls.push(`send:${alias}:${messageText}`)
        return {}
      },
      waitForReply: async (options) => {
        calls.push(`wait:${options.alias}`)
        waitOptions = options
        return replyWith(validAnalysis())
      },
    })
    const adapter = new MindsAdapter(client)
    const signal = new AbortController().signal

    await adapter.ensureAlias('vibecheck-engine', 'mind-id')
    await adapter.sendAndWait({
      alias: 'vibecheck-engine',
      messageText: 'analyze this evidence',
      timeoutMs: 12_000,
      signal,
    })

    expect(calls).toEqual([
      'ensure:vibecheck-engine:mind-id',
      'fingerprint:vibecheck-engine',
      'send:vibecheck-engine:analyze this evidence',
      'wait:vibecheck-engine',
    ])
    expect(waitOptions).toEqual({
      alias: 'vibecheck-engine',
      timeoutMs: 12_000,
      signal,
      sentMessageText: 'analyze this evidence',
      afterFingerprint: 'before-send',
    })
  })

  it('exposes history and an abortable event iterator without changing rows', async () => {
    const row: MessageRecord = { fingerprint: 'history-1', senderType: 1, messageText: 'hello' }
    const event: MessagingEvent = { fingerprint: 'event-1', senderType: 1, messageText: 'new' }
    const seenOptions: EventsIteratorOptions[] = []
    const client = createFakeMindsClient({
      getHistory: async () => [row],
      eventsIterator: async function* (options) {
        seenOptions.push(options)
        yield event
      },
    })
    const adapter = new MindsAdapter(client)
    const signal = new AbortController().signal

    await expect(adapter.getHistory('vibecheck-community-source', { limit: 25, signal })).resolves.toEqual([
      row,
    ])
    const received: MessagingEvent[] = []
    for await (const item of adapter.events('vibecheck-community-source', signal)) received.push(item)

    expect(received).toEqual([event])
    expect(seenOptions).toEqual([{ alias: 'vibecheck-community-source', signal }])
  })
})

describe('ReasoningService', () => {
  it('records a validated, correlated analysis and a deterministic input digest', async () => {
    const { service, store, transport } = createService(replyWith(validAnalysis()))

    const result = await service.analyze({
      analysisKind: 'fracture',
      observations: humanObservations(),
      timeoutMs: 5_000,
    })

    expect(result).toMatchObject({
      status: 'succeeded',
      runId: RUN_ID,
      replyFingerprint: 'mind-reply-1',
      analysis: validAnalysis(),
    })
    expect(result.inputDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(store.created).toEqual([
      expect.objectContaining({
        id: RUN_ID,
        inputDigest: result.inputDigest,
        analysisKind: 'fracture',
        engineAlias: 'vibecheck-engine',
        inputObservationIds: [OBSERVATION_ONE, OBSERVATION_TWO],
        startedAt: STARTED_AT,
      }),
    ])
    expect(store.completed).toEqual([
      {
        id: RUN_ID,
        completion: {
          status: 'succeeded',
          response: validAnalysis(),
          errorCode: null,
          completedAt: STARTED_AT,
        },
      },
    ])
    expect(transport.calls).toHaveLength(1)
    expect(JSON.parse(transport.calls[0]!.messageText)).toMatchObject({
      schemaVersion: 'vibecheck.request.v1',
      analysisKind: 'fracture',
      observations: [
        { id: OBSERVATION_ONE, senderType: 1 },
        { id: OBSERVATION_TWO, senderType: 1 },
      ],
    })
  })

  it.each([
    ['malformed_json', replyWith('{not-json')],
    ['invalid_schema', replyWith({ ...validAnalysis(), schemaVersion: 'vibecheck.analysis.v0' })],
    [
      'unknown_observation_ref',
      replyWith(validAnalysis({ observationRefs: [OBSERVATION_ONE, UNKNOWN_OBSERVATION] })),
    ],
  ])('records %s without advancing the result', async (errorCode, outcome) => {
    const { service, store } = createService(outcome)

    const result = await service.analyze({
      analysisKind: 'fracture',
      observations: humanObservations(),
      timeoutMs: 5_000,
    })

    expect(result).toMatchObject({ status: 'invalid', errorCode })
    expect(store.completed[0]?.completion).toMatchObject({
      status: 'invalid',
      response: null,
      errorCode,
    })
  })

  it('rejects non-human observation rows before making a Mind call', async () => {
    const { service, store, transport } = createService(replyWith(validAnalysis()))
    const observations = humanObservations()
    observations[1] = { ...observations[1]!, senderType: 0 }

    const result = await service.analyze({
      analysisKind: 'fracture',
      observations,
      timeoutMs: 5_000,
    })

    expect(result).toMatchObject({ status: 'invalid', errorCode: 'non_human_observation' })
    expect(transport.calls).toHaveLength(0)
    expect(store.created).toHaveLength(0)
  })

  it('rejects a correlated human echo as a Mind analysis reply', async () => {
    const outcome = replyWith(validAnalysis())
    if (!outcome.timedOut) outcome.reply.senderType = 1
    const { service, store } = createService(outcome)

    const result = await service.analyze({
      analysisKind: 'fracture',
      observations: humanObservations(),
      timeoutMs: 5_000,
    })

    expect(result).toMatchObject({ status: 'invalid', errorCode: 'non_mind_reply' })
    expect(store.completed[0]?.completion).toMatchObject({
      status: 'invalid',
      response: null,
      errorCode: 'non_mind_reply',
    })
  })

  it('records a timeout when no correlated reply arrives', async () => {
    const { service, store } = createService({ timedOut: true })

    const result = await service.analyze({
      analysisKind: 'fracture',
      observations: humanObservations(),
      timeoutMs: 5_000,
    })

    expect(result).toMatchObject({ status: 'timed_out', errorCode: 'reply_timeout' })
    expect(store.completed[0]?.completion.status).toBe('timed_out')
  })

  it('records a correlated reply as late when it arrives after the request deadline', async () => {
    const lateAt = new Date(STARTED_AT + 5_001).toISOString()
    const { service, store } = createService(replyWith(validAnalysis(), lateAt))

    const result = await service.analyze({
      analysisKind: 'fracture',
      observations: humanObservations(),
      timeoutMs: 5_000,
    })

    expect(result).toMatchObject({ status: 'timed_out', errorCode: 'late_reply' })
    expect(store.completed[0]?.completion).toMatchObject({
      status: 'timed_out',
      response: null,
      errorCode: 'late_reply',
    })
  })
})

describe('Mind recovery instructions', () => {
  it('make evidence, uncertainty, silence, and creator-only boundaries explicit', async () => {
    const root = resolve(import.meta.dirname, '../..')
    const [analysisPrompt, followUpPrompt, playbook] = await Promise.all([
      readFile(resolve(root, 'src/agent/prompts/recovery-analysis.md'), 'utf8'),
      readFile(resolve(root, 'src/agent/prompts/recovery-follow-up.md'), 'utf8'),
      readFile(resolve(root, 'src/agent/skill.md'), 'utf8'),
    ])

    expect(analysisPrompt).toContain('vibecheck.analysis.v1')
    expect(analysisPrompt).toMatch(/observationRefs/i)
    expect(analysisPrompt).toMatch(/uncertainty/i)
    expect(followUpPrompt).toMatch(/affectedMemberReturned/i)
    expect(followUpPrompt).toMatch(/relevantConstructiveInteraction/i)
    expect(playbook).toMatch(/remain silent/i)
    expect(playbook).toMatch(/never contact community members/i)
    expect(playbook).toMatch(/creator-only/i)
  })
})

function createFakeMindsClient(
  overrides: Partial<MindsMessagingClient> = {},
): MindsMessagingClient {
  return {
    ensureConversation: async (alias: string, mindId: string): Promise<Conversation> => ({
      alias,
      mindId,
      conversationId: 'conversation-1',
    }),
    getHistory: async (_alias: string, _options?: GetHistoryOptions): Promise<MessageRecord[]> => [],
    getLatestHistoryFingerprint: async (): Promise<string | undefined> => undefined,
    sendMessage: async (_body: SendMessageBody): Promise<Record<string, unknown>> => ({}),
    waitForReply: async (_options: WaitForReplyOptions): Promise<WaitForReplyOutcome> => ({
      timedOut: true,
    }),
    eventsIterator: async function* (_options: EventsIteratorOptions): AsyncGenerator<MessagingEvent> {},
    ...overrides,
  }
}
