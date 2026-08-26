type LogLevel = 'info' | 'warn' | 'error'
type LogFields = Record<string, unknown>
type LogSink = (record: string) => void

const SENSITIVE_KEY = /authorization|cookie|password|secret|session.?token|bot.?token|api.?key/i
const EMBEDDED_CREDENTIAL = /(?:Bearer\s+\S+|(?:bot)?\d{5,}:[A-Za-z0-9_-]{6,})/gi

export function redactLogValue(value: unknown): unknown {
  if (typeof value === 'string') return value.replaceAll(EMBEDDED_CREDENTIAL, '[REDACTED]')
  if (Array.isArray(value)) return value.map(redactLogValue)
  if (!isRecord(value)) return value

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactLogValue(entry),
    ]),
  )
}

export class StructuredLogger {
  constructor(private readonly sink: LogSink = defaultSink) {}

  info(event: string, fields: LogFields = {}): void {
    this.write('info', event, fields)
  }

  warn(event: string, fields: LogFields = {}): void {
    this.write('warn', event, fields)
  }

  error(event: string, fields: LogFields = {}): void {
    this.write('error', event, fields)
  }

  private write(level: LogLevel, event: string, fields: LogFields): void {
    this.sink(
      JSON.stringify(
        redactLogValue({
          timestamp: new Date().toISOString(),
          level,
          event,
          ...fields,
        }),
      ),
    )
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function defaultSink(record: string): void {
  process.stdout.write(`${record}\n`)
}
