import {
  createMindsClient,
  type Conversation,
  type EventsIteratorOptions,
  type GetHistoryOptions,
  type MessageRecord,
  type MessagingEvent,
  type SendMessageBody,
  type WaitForReplyOptions,
  type WaitForReplyOutcome,
} from '@animocabrands/minds-client-lib'

export interface MindsMessagingClient {
  ensureConversation(alias: string, mindId: string): Promise<Conversation>
  getHistory(alias: string, options?: GetHistoryOptions): Promise<MessageRecord[]>
  getLatestHistoryFingerprint(alias: string, signal?: AbortSignal): Promise<string | undefined>
  sendMessage(body: SendMessageBody): Promise<Record<string, unknown>>
  waitForReply(options: WaitForReplyOptions): Promise<WaitForReplyOutcome>
  eventsIterator(options: EventsIteratorOptions): AsyncGenerator<MessagingEvent>
}

export interface SendAndWaitInput {
  alias: string
  messageText: string
  timeoutMs: number
  signal?: AbortSignal
}

export class MindsAdapter {
  constructor(private readonly client: MindsMessagingClient) {}

  ensureAlias(alias: string, mindId: string): Promise<Conversation> {
    return this.client.ensureConversation(alias, mindId)
  }

  getHistory(alias: string, options?: GetHistoryOptions): Promise<MessageRecord[]> {
    return this.client.getHistory(alias, options)
  }

  async sendAndWait(input: SendAndWaitInput): Promise<WaitForReplyOutcome> {
    const fingerprint = await this.client.getLatestHistoryFingerprint(input.alias, input.signal)
    await this.client.sendMessage({ alias: input.alias, messageText: input.messageText })
    return this.client.waitForReply({
      alias: input.alias,
      timeoutMs: input.timeoutMs,
      signal: input.signal,
      sentMessageText: input.messageText,
      afterFingerprint: fingerprint,
    })
  }

  events(alias: string, signal?: AbortSignal): AsyncGenerator<MessagingEvent> {
    return this.client.eventsIterator({ alias, signal })
  }
}

export function createMindsAdapter(builderApiKey: string): MindsAdapter {
  return new MindsAdapter(createMindsClient({ builderApiKey }))
}
