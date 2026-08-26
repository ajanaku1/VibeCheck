import type { Provenance, RecoveryOverview } from '../domain/types.js'

export interface AuthConfig {
  telegramBotUsername: string
}

export interface SessionView {
  creator: RecoveryOverview['creator']
  expiresAt: string
}

export interface TelegramAuthPayload {
  id: number | string
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

export interface TimelineEvidence {
  source: string
  excerpt: string
}

export interface TimelineEventView {
  id: string
  eventType: string
  actor: 'community_member' | 'mind' | 'creator' | 'system' | 'external_service'
  provenance: Provenance
  summary: string
  evidence: TimelineEvidence[]
  resultingState: string
  occurredAt: string
}

type CaseSummaryView = RecoveryOverview['cases'][number]

export interface RecoveryCaseDetailView extends CaseSummaryView {
  rememberedContext: string[]
  suggestedOutreach: string
  finalOutreach: string | null
  timeline: TimelineEventView[]
}

interface ProblemBody {
  title?: string
  status?: number
  code?: string
  retryable?: boolean
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryable: boolean,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!response.ok) throw await toApiError(response)
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

async function toApiError(response: Response): Promise<ApiError> {
  const fallback: ProblemBody = { status: response.status }
  const problem = await response.json().catch(() => fallback) as ProblemBody
  return new ApiError(
    problem.status ?? response.status,
    problem.code ?? 'request_failed',
    problem.retryable ?? false,
    problem.title ?? 'Request failed',
  )
}

export function getAuthConfig(): Promise<AuthConfig> {
  return requestJson<AuthConfig>('/api/auth/config')
}

export function getSession(): Promise<SessionView> {
  return requestJson<SessionView>('/api/auth/session')
}

export function authenticate(payload: TelegramAuthPayload): Promise<SessionView> {
  const normalized = { ...payload, id: String(payload.id) }
  return requestJson<SessionView>('/api/auth/telegram', {
    method: 'POST',
    body: JSON.stringify(normalized),
  })
}

export function logout(): Promise<void> {
  return requestJson<void>('/api/auth/logout', { method: 'POST' })
}

export function getOverview(): Promise<RecoveryOverview> {
  return requestJson<RecoveryOverview>('/api/recovery-overview')
}

export function getCaseDetail(caseId: string): Promise<RecoveryCaseDetailView> {
  return requestJson<RecoveryCaseDetailView>(`/api/recovery-cases/${encodeURIComponent(caseId)}`)
}
