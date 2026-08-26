import { expect, test, type Page, type Route } from 'playwright/test'

const CASE_ID = '22222222-2222-4222-8222-222222222222'
const PROTECTED_COPY = ['Staged Creators', 'Alex', 'Sam', CASE_ID, 'The exchange became personal.']

const session = {
  creator: {
    telegramUserId: '42',
    displayName: 'Ada',
    username: 'ada',
    photoUrl: null,
  },
  expiresAt: '2026-08-18T20:00:00.000Z',
}

const overview = {
  creator: session.creator,
  community: { displayName: 'Staged Creators' },
  observationStatus: 'observing',
  timingProfile: 'demo',
  counts: { open: 2, resolved: 1, unresolved: 0, awaitingAction: 1 },
  cases: [
    {
      id: CASE_ID,
      trigger: 'escalating_conflict',
      state: 'monitoring',
      people: ['Alex', 'Sam'],
      observedChange: 'The exchange became personal.',
      confidence: 0.82,
      uncertainty: 'Intent remains uncertain.',
      awaitingCreatorAction: false,
      updatedAt: '2026-08-18T21:48:00.000Z',
    },
  ],
  recentOutcomes: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      trigger: 'post_conflict_silence',
      state: 'resolved',
      people: ['Mina'],
      observedChange: 'Returned to the maker roundup.',
      confidence: 0.91,
      uncertainty: 'Recovery was confirmed by the creator.',
      awaitingCreatorAction: false,
      updatedAt: '2026-08-18T18:30:00.000Z',
    },
  ],
}

const detail = {
  ...overview.cases[0],
  rememberedContext: ['Alex and Sam usually repair disagreements quickly.'],
  suggestedOutreach: 'Check in privately and leave room for context.',
  finalOutreach: 'I noticed the exchange got tense. Is there anything I should understand?',
  timeline: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      eventType: 'case_opened',
      actor: 'mind',
      provenance: 'mind_inference',
      summary: 'Mind analysis met the deterministic fracture gate.',
      evidence: [
        { source: 'community message', excerpt: 'The exchange became personal.' },
        { source: 'remembered relationship', excerpt: 'Alex and Sam usually repair disagreements quickly.' },
      ],
      resultingState: 'needs_review',
      occurredAt: '2026-08-18T18:10:00.000Z',
    },
    {
      id: '55555555-5555-4555-8555-555555555555',
      eventType: 'draft_approved',
      actor: 'creator',
      provenance: 'creator_decision',
      summary: 'Ada approved a private outreach plan in Telegram.',
      evidence: [],
      resultingState: 'monitoring',
      occurredAt: '2026-08-18T18:24:00.000Z',
    },
    {
      id: '66666666-6666-4666-8666-666666666666',
      eventType: 'delivery_recorded',
      actor: 'external_service',
      provenance: 'external_operation',
      summary: 'Telegram recorded the creator notification attempt.',
      evidence: [],
      resultingState: 'monitoring',
      occurredAt: '2026-08-18T18:25:00.000Z',
    },
  ],
}

test('Patchwork Atlas landing explains recovery and exposes no protected data', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')

  await expect(page.getByRole('heading', {
    name: 'Repair community fractures before valuable members disappear.',
  })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue with Telegram' }).first()).toBeVisible()
  const demoLink = page.getByRole('link', { name: 'Watch the demo' })
  await expect(demoLink).toBeVisible()
  await expect(demoLink).toHaveAttribute('href', '/demo.mp4')
  const demoResponse = await page.request.get('/demo.mp4')
  expect(demoResponse.headers()['content-type']).toContain('video/mp4')
  await page.getByRole('button', { name: 'Continue with Telegram' }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Close Telegram sign-in' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('Observe context')).toBeVisible()
  await expect(page.getByText('Guide intervention')).toBeVisible()
  await expect(page.getByText('Confirm recovery')).toBeVisible()
  await expect(page.locator('[data-brand-motif="patch-map"]')).toBeVisible()
  await expect(page.locator('main')).toHaveAttribute('data-view', 'landing')
  if (process.env.VISUAL_CAPTURE) await page.screenshot({ path: '/tmp/vibecheck-landing.png', fullPage: true })

  for (const value of PROTECTED_COPY) await expect(page.locator('body')).not.toContainText(value)
  await expect(page.locator('body')).not.toContainText(/health score|archetype|weekly briefing/i)
})

test('authorized creator moves through the Threadline shell and Mending Table pages', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await authenticateThroughTelegram(page)

  const isMobile = (page.viewportSize()?.width ?? 1440) <= 832
  const desktopSidebar = page.locator('.workspace-sidebar')
  const mobileDock = page.locator('.workspace-mobile-dock')
  if (isMobile) {
    await expect(desktopSidebar).toBeHidden()
    await expect(mobileDock).toBeVisible()
  } else {
    await expect(desktopSidebar).toBeVisible()
    await expect(mobileDock).toBeHidden()
  }
  const workspaceNavigation = isMobile ? mobileDock : desktopSidebar
  await expect(workspaceNavigation.getByRole('button', { name: 'Cases', exact: true })).toBeVisible()
  await expect(workspaceNavigation.getByRole('button', { name: 'Thread' })).toBeVisible()
  await expect(page.getByText('Demo timing', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Keep the relationship on the table.' })).toBeVisible()
  await expect(page.locator('[data-layout="mending-table"]')).toBeVisible()
  await expect(page.getByText('Staged Creators')).toBeVisible()
  if (process.env.VISUAL_CAPTURE) await page.screenshot({ path: '/tmp/vibecheck-overview.png' })

  await workspaceNavigation.getByRole('button', { name: 'Welcome' }).click()
  await expect(page.getByRole('button', { name: 'Return to workspace' }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Return to workspace' }).first().click()
  await expect(page.getByRole('heading', { name: 'Keep the relationship on the table.' })).toBeVisible()

  await page.getByRole('button', { name: new RegExp(CASE_ID) }).click()

  await expect(page).toHaveURL(new RegExp(`/cases/${CASE_ID}$`))
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await expect(page.locator('#main-content')).toBeFocused()
  expect(await page.locator('.workspace-header .brand img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
  await expect(page.getByRole('heading', { name: 'Alex and Sam' })).toBeVisible()
  await expect(page.getByText('Demo timing', { exact: true })).toBeVisible()
  await expect(page.locator('[data-layout="mending-table"]')).toBeVisible()
  await expect(page.locator(isMobile ? '.workspace-mobile-dock' : '.workspace-sidebar')).toBeVisible()
  if (!isMobile) await expect(desktopSidebar.getByText('Recovery thread', { exact: true })).toBeVisible()
  await expect(page.getByText('Mind inference')).toBeVisible()
  await expect(page.getByText('Creator decision')).toBeVisible()
  await expect(page.getByText('External operation')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Continue in Telegram' })).toBeVisible()
  await expect(page.getByRole('button', { name: /resolve|dismiss|approve|confirm/i })).toHaveCount(0)
  expect(await page.locator('.thread-rail').evaluate((rail) => rail.scrollWidth > rail.clientWidth)).toBe(false)
  if (process.env.VISUAL_CAPTURE) await page.screenshot({ path: '/tmp/vibecheck-case.png' })
})

test('session survives reload and logout removes protected content', async ({ page }) => {
  const controls = await mockApi(page)
  await page.goto('/')
  await authenticateThroughTelegram(page)
  await page.reload()

  await expect(page.getByText('Staged Creators')).toBeVisible()
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('heading', {
    name: 'Repair community fractures before valuable members disappear.',
  })).toBeVisible()
  expect(controls.loggedOut()).toBe(true)
  for (const value of PROTECTED_COPY) await expect(page.locator('body')).not.toContainText(value)
})

test('unauthorized Telegram identity receives a fully redacted denial screen', async ({ page }) => {
  await mockApi(page, { denyAuthentication: true })
  await page.goto('/')
  await authenticateThroughTelegram(page)

  await expect(page.getByRole('heading', { name: 'This recovery space stays private.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Return to landing' })).toBeVisible()
  for (const value of PROTECTED_COPY) await expect(page.locator('body')).not.toContainText(value)
})

test('retryable API failure provides a recovery path without sample fallback', async ({ page }) => {
  await mockApi(page, { overviewUnavailable: true })
  await page.goto('/')
  await authenticateThroughTelegram(page)

  await expect(page.getByRole('heading', { name: 'The recovery record is delayed.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  for (const value of PROTECTED_COPY) await expect(page.locator('body')).not.toContainText(value)
})

test('Telegram configuration failure is explicit and retryable', async ({ page }) => {
  const options: MockApiOptions = { configUnavailable: true }
  await mockApi(page, options)
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue with Telegram' }).first().click()

  await expect(page.getByText('Telegram sign-in is temporarily unavailable.')).toBeVisible()
  options.configUnavailable = false
  await page.getByRole('button', { name: 'Try Telegram again' }).click()
  await expect(page.getByText('Connect securely with @VibeCheckBot.')).toBeVisible()
})

test('selected hybrid remains usable without horizontal overflow', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await expect(page.locator('body')).toBeVisible()
  expect(await horizontalOverflow(page)).toBe(false)

  await authenticateThroughTelegram(page)
  expect(await horizontalOverflow(page)).toBe(false)
  await page.getByRole('button', { name: new RegExp(CASE_ID) }).click()
  expect(await horizontalOverflow(page)).toBe(false)
})

interface MockApiOptions {
  configUnavailable?: boolean
  denyAuthentication?: boolean
  overviewUnavailable?: boolean
}

async function mockApi(
  page: Page,
  options: MockApiOptions = {},
): Promise<{ loggedOut: () => boolean }> {
  let authenticated = false
  let loggedOut = false

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname

    if (path === '/api/auth/config') {
      return options.configUnavailable
        ? problem(route, 503, 'auth_config_unavailable', true)
        : json(route, 200, { telegramBotUsername: 'VibeCheckBot' })
    }
    if (path === '/api/auth/session') {
      return authenticated ? json(route, 200, session) : problem(route, 401, 'authentication_required')
    }
    if (path === '/api/auth/telegram') {
      if (options.denyAuthentication) return problem(route, 403, 'creator_not_authorized')
      authenticated = true
      return json(route, 200, session)
    }
    if (path === '/api/auth/logout') {
      authenticated = false
      loggedOut = true
      return route.fulfill({ status: 204, body: '' })
    }
    if (path === '/api/recovery-overview') {
      if (!authenticated) return problem(route, 401, 'authentication_required')
      if (options.overviewUnavailable) return problem(route, 503, 'recovery_data_unavailable', true)
      return json(route, 200, overview)
    }
    if (path === `/api/recovery-cases/${CASE_ID}`) {
      return authenticated ? json(route, 200, detail) : problem(route, 401, 'authentication_required')
    }
    return problem(route, 404, 'not_found')
  })

  return { loggedOut: () => loggedOut }
}

async function authenticateThroughTelegram(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Continue with Telegram' }).first().click()
  await page.evaluate(() => {
    const target = window as Window & {
      onTelegramAuth?: (payload: Record<string, unknown>) => void
    }
    target.onTelegramAuth?.({
      id: 42,
      first_name: 'Ada',
      username: 'ada',
      auth_date: 1_787_077_200,
      hash: 'a'.repeat(64),
    })
  })
}

async function horizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
}

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

function problem(route: Route, status: number, code: string, retryable = false): Promise<void> {
  return json(route, status, {
    type: 'about:blank',
    title: status === 403 ? 'Creator access denied' : 'Request unavailable',
    status,
    code,
    retryable,
  })
}
