export interface OperationalErrorOptions {
  code: string
  title: string
  status: number
  detail?: string
  retryable?: boolean
  cause?: unknown
}

export interface ProblemDetails {
  type: string
  title: string
  status: number
  code: string
  detail?: string
  retryable?: boolean
  correlationId?: string
}

export class OperationalError extends Error {
  readonly code: string
  readonly title: string
  readonly status: number
  readonly detail?: string
  readonly retryable?: boolean

  constructor(options: OperationalErrorOptions) {
    super(options.detail ?? options.title, { cause: options.cause })
    this.name = 'OperationalError'
    this.code = options.code
    this.title = options.title
    this.status = options.status
    this.detail = options.detail
    this.retryable = options.retryable
  }
}

export function toProblem(
  error: OperationalError,
  correlationId?: string,
): ProblemDetails {
  const problem: ProblemDetails = {
    type: `/problems/${error.code}`,
    title: error.title,
    status: error.status,
    code: error.code,
  }
  if (error.detail !== undefined) problem.detail = error.detail
  if (error.retryable !== undefined) problem.retryable = error.retryable
  if (correlationId !== undefined) problem.correlationId = correlationId
  return problem
}
