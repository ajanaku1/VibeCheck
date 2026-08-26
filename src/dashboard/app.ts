import type { RecoveryOverview } from '../domain/types.js'

import {
  ApiError,
  authenticate,
  getAuthConfig,
  getCaseDetail,
  getOverview,
  getSession,
  logout,
  type AuthConfig,
  type RecoveryCaseDetailView,
  type SessionView,
  type TelegramAuthPayload,
} from './api.js'
import { logoMarkUrl } from './assets.js'
import { renderCaseDetail } from './views/case-detail.js'
import { escapeHtml } from './views/format.js'
import { renderLanding } from './views/landing.js'
import { renderOverview, type OverviewFilters } from './views/overview.js'
import { renderDenied, renderLoading, renderNotFound, renderUnavailable } from './views/states.js'

declare global {
  interface Window {
    onTelegramAuth(payload: TelegramAuthPayload): void
  }
}

type ProtectedRoute = { kind: 'overview' } | { kind: 'detail'; caseId: string }

const root = requiredElement('app')
const announcer = requiredElement('announcer')

let authConfig: AuthConfig | null = null
let session: SessionView | null = null
let overview: RecoveryOverview | null = null
let detail: RecoveryCaseDetailView | null = null
let authOpen = false
let retryRoute: ProtectedRoute = { kind: 'overview' }
let filters: OverviewFilters = { query: '', state: 'all' }

window.onTelegramAuth = (payload) => void completeTelegramAuth(payload)
window.addEventListener('popstate', () => void restoreRoute())
window.addEventListener('keydown', handleEscape)
root.addEventListener('click', handleClick)
root.addEventListener('input', handleFilterInput)
root.addEventListener('change', handleFilterChange)

void bootstrap()

async function bootstrap(): Promise<void> {
  setRoot(renderLoading('Checking private access…'), true)
  authConfig = await getAuthConfig().catch(() => null)
  try {
    session = await getSession()
    await restoreRoute()
  } catch (error) {
    if (isStatus(error, 401)) showLanding()
    else showUnavailable({ kind: 'overview' })
  }
}

async function restoreRoute(): Promise<void> {
  if (!session) {
    showLanding()
    return
  }
  const route = currentRoute()
  if (route.kind === 'detail') await loadCase(route.caseId)
  else await loadRecoveryOverview()
}

async function completeTelegramAuth(payload: TelegramAuthPayload): Promise<void> {
  setRoot(renderLoading('Opening the private recovery space…'), true)
  try {
    session = await authenticate(payload)
    authOpen = false
    navigate('/dashboard')
    await loadRecoveryOverview()
  } catch (error) {
    if (isStatus(error, 403)) setRoot(renderDenied())
    else showUnavailable({ kind: 'overview' })
  }
}

async function loadRecoveryOverview(): Promise<void> {
  retryRoute = { kind: 'overview' }
  overview = null
  setRoot(renderLoading('Reading the recovery table…'), true)
  try {
    overview = await getOverview()
    setRoot(renderWorkspace(renderOverview(overview, filters), 'cases'))
    focusMainContent()
    announce('Recovery cases loaded')
  } catch (error) {
    handleProtectedError(error, retryRoute)
  }
}

async function loadCase(caseId: string): Promise<void> {
  retryRoute = { kind: 'detail', caseId }
  detail = null
  setRoot(renderLoading('Following the recovery thread…'), true)
  try {
    detail = await getCaseDetail(caseId)
    setRoot(renderWorkspace(renderCaseDetail(detail), 'thread'))
    focusMainContent()
    announce(`Recovery case ${caseId} loaded`)
  } catch (error) {
    if (isStatus(error, 404)) setRoot(renderNotFound())
    else handleProtectedError(error, retryRoute)
  }
}

function handleProtectedError(error: unknown, route: ProtectedRoute): void {
  if (isStatus(error, 401)) {
    session = null
    showLanding('Your private session expired. Reconnect through Telegram.')
    return
  }
  showUnavailable(route)
}

function showLanding(notice?: string): void {
  authOpen = false
  overview = null
  detail = null
  setRoot(renderLanding({ authenticated: session !== null, authOpen, botUsername: authConfig?.telegramBotUsername ?? null, notice }))
}

function showUnavailable(route: ProtectedRoute): void {
  retryRoute = route
  overview = null
  detail = null
  setRoot(renderUnavailable())
}

function openAuth(): void {
  authOpen = true
  setRoot(renderLanding({ authenticated: session !== null, authOpen, botUsername: authConfig?.telegramBotUsername ?? null }))
  mountTelegramWidget()
}

function closeAuth(): void {
  authOpen = false
  showLanding()
}

async function endSession(): Promise<void> {
  try {
    await logout()
  } finally {
    session = null
    history.replaceState(null, '', '/')
    showLanding('You have been safely logged out.')
  }
}

function renderWorkspace(content: string, active: 'cases' | 'thread'): string {
  const creator = session?.creator
  const username = creator?.username ? `@${escapeHtml(creator.username)}` : 'Telegram creator'
  return `
    <header class="workspace-header">
      <button class="brand brand-button" data-action="cases" aria-label="VibeCheck cases"><img src="${logoMarkUrl}" alt="" width="40" height="40"><span>VibeCheck</span></button>
      <div class="creator-menu"><span><strong>${escapeHtml(creator?.displayName ?? 'Creator')}</strong><small>${username}</small></span><button class="button button-text" data-action="logout">Log out</button></div>
    </header>
    <div class="demo-ribbon"><strong>Demo timing</strong><span>Compressed observation windows are disclosed throughout this staged community.</span></div>
    <div class="workspace-shell">
      <aside class="workspace-sidebar">
        <div><p class="eyebrow">Private workspace</p><strong>Recovery thread</strong></div>
        ${renderWorkspaceNavigation(active, 'Threadline side menu')}
        <p class="sidebar-boundary">Read proof here.<br>Decide in Telegram.</p>
      </aside>
      <main id="main-content" class="protected-main" data-view="${active}" tabindex="-1">${content}</main>
    </div>
    <nav class="workspace-mobile-dock" aria-label="Mobile workspace">
      ${renderWorkspaceRouteButtons(active)}
    </nav>
  `
}

function renderWorkspaceNavigation(active: 'cases' | 'thread', label: string): string {
  return `<nav aria-label="${label}">${renderWorkspaceRouteButtons(active)}</nav>`
}

function renderWorkspaceRouteButtons(active: 'cases' | 'thread'): string {
  return `
    <button class="workspace-route" data-action="welcome">Welcome</button>
    <button class="workspace-route" data-action="cases"${active === 'cases' ? ' aria-current="page"' : ''}>Cases</button>
    <button class="workspace-route" data-action="thread"${active === 'thread' ? ' aria-current="page"' : ''}>Thread</button>
    <button class="workspace-route" data-action="telegram">Telegram</button>
  `
}

function handleClick(event: MouseEvent): void {
  const target = (event.target as Element).closest<HTMLElement>('[data-action]')
  if (!target) return
  const action = target.dataset.action
  if (target instanceof HTMLAnchorElement) event.preventDefault()
  runAction(action ?? '', target)
}

function runAction(action: string, target: HTMLElement): void {
  const handlers: Record<string, () => void> = {
    'open-auth': openAuth,
    'close-auth': closeAuth,
    'return-landing': () => { history.replaceState(null, '', '/'); showLanding() },
    welcome: () => { history.pushState(null, '', '/'); showLanding() },
    cases: () => { navigate('/dashboard'); void loadRecoveryOverview() },
    thread: () => openFirstCase(),
    'back-overview': () => { navigate('/dashboard'); void loadRecoveryOverview() },
    logout: () => void endSession(),
    retry: () => void retryProtectedRoute(),
    'retry-auth': () => void retryAuthConfig(),
    telegram: openTelegram,
    'open-case': () => openCaseFromTarget(target),
  }
  handlers[action]?.()
}

function openCaseFromTarget(target: HTMLElement): void {
  const caseId = target.dataset.caseId
  if (!caseId) return
  navigate(`/cases/${caseId}`)
  void loadCase(caseId)
}

function openFirstCase(): void {
  const caseId = detail?.id ?? overview?.cases[0]?.id
  if (!caseId) return
  navigate(`/cases/${caseId}`)
  void loadCase(caseId)
}

async function retryProtectedRoute(): Promise<void> {
  if (retryRoute.kind === 'detail') await loadCase(retryRoute.caseId)
  else await loadRecoveryOverview()
}

async function retryAuthConfig(): Promise<void> {
  try {
    authConfig = await getAuthConfig()
    openAuth()
  } catch {
    authConfig = null
    openAuth()
  }
}

function openTelegram(): void {
  const username = authConfig?.telegramBotUsername
  if (username) window.open(`https://t.me/${encodeURIComponent(username)}`, '_blank', 'noopener')
}

function handleFilterInput(event: Event): void {
  const input = event.target
  if (!(input instanceof HTMLInputElement) || !input.matches('[data-case-search]')) return
  filters = { ...filters, query: input.value }
  rerenderOverview()
}

function handleFilterChange(event: Event): void {
  const select = event.target
  if (!(select instanceof HTMLSelectElement) || !select.matches('[data-case-state]')) return
  filters = { ...filters, state: select.value }
  rerenderOverview()
}

function rerenderOverview(): void {
  if (!overview) return
  setRoot(renderWorkspace(renderOverview(overview, filters), 'cases'))
  document.querySelector<HTMLInputElement>('[data-case-search]')?.focus()
}

function mountTelegramWidget(): void {
  const host = document.getElementById('telegram-auth-widget')
  const username = authConfig?.telegramBotUsername
  if (!host || !username) return
  host.textContent = ''
  const script = document.createElement('script')
  script.src = 'https://telegram.org/js/telegram-widget.js?22'
  script.async = true
  script.dataset.telegramLogin = username
  script.dataset.size = 'large'
  script.dataset.onauth = 'onTelegramAuth(user)'
  script.dataset.requestAccess = 'write'
  host.append(script)
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape' && authOpen) closeAuth()
}

function currentRoute(): ProtectedRoute {
  const match = location.pathname.match(/^\/cases\/([0-9a-f-]+)$/i)
  return match?.[1] ? { kind: 'detail', caseId: match[1] } : { kind: 'overview' }
}

function navigate(path: string): void {
  if (location.pathname !== path) history.pushState(null, '', path)
}

function setRoot(html: string, busy = false): void {
  root.innerHTML = html
  root.setAttribute('aria-busy', String(busy))
}

function announce(message: string): void {
  announcer.textContent = message
}

function focusMainContent(): void {
  window.scrollTo(0, 0)
  document.getElementById('main-content')?.focus({ preventScroll: true })
}

function isStatus(error: unknown, status: number): boolean {
  return error instanceof ApiError && error.status === status
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing #${id}`)
  return element
}
