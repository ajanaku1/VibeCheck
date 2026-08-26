import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page, type Route } from 'playwright/test'

import type { RecoveryOverview } from '../../src/domain/types.js'

const creator = {
  telegramUserId: '42',
  displayName: 'Ada',
  username: 'ada',
  photoUrl: null,
}

test('public landing has no serious accessibility violations', async ({ page }) => {
  await routeLanding(page)
  await page.goto('/')
  await expect(page.getByRole('heading', {
    name: 'Repair community fractures before valuable members disappear.',
  })).toBeVisible()

  await expectNoSeriousViolations(page)
})

test('authenticated workbench has no serious accessibility violations', async ({ page }) => {
  await routeWorkspace(page)
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Keep the relationship on the table.' })).toBeVisible()

  await expectNoSeriousViolations(page)
})

async function expectNoSeriousViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const serious = results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')
  expect(serious).toEqual([])
}

async function routeLanding(page: Page): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/auth/config') return json(route, 200, { telegramBotUsername: 'VibeCheckBot' })
    return json(route, 401, { code: 'authentication_required', status: 401 })
  })
}

async function routeWorkspace(page: Page): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/auth/config') return json(route, 200, { telegramBotUsername: 'VibeCheckBot' })
    if (path === '/api/auth/session') {
      return json(route, 200, { creator, expiresAt: '2026-08-18T20:00:00.000Z' })
    }
    if (path === '/api/recovery-overview') return json(route, 200, recoveryOverview())
    return json(route, 404, { code: 'not_found', status: 404 })
  })
}

function recoveryOverview(): RecoveryOverview {
  return {
    creator,
    community: { displayName: 'Staged Creators' },
    observationStatus: 'observing',
    timingProfile: 'demo',
    counts: { open: 1, resolved: 0, unresolved: 0, awaitingAction: 1 },
    cases: [{
      id: '22222222-2222-4222-8222-222222222222',
      trigger: 'escalating_conflict',
      state: 'needs_review',
      people: ['Alex', 'Sam'],
      observedChange: 'The exchange became personal.',
      confidence: 0.82,
      uncertainty: 'Intent remains uncertain.',
      awaitingCreatorAction: true,
      updatedAt: '2026-08-18T21:48:00.000Z',
    }],
    recentOutcomes: [],
  }
}

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}
