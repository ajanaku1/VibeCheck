import { describe, expect, it } from 'vitest'

import type { RecoveryOverview } from '../../src/domain/types.js'
import { renderLanding } from '../../src/dashboard/views/landing.js'
import { renderOverview } from '../../src/dashboard/views/overview.js'
import { renderDenied, renderLoading, renderUnavailable } from '../../src/dashboard/views/states.js'

describe('dashboard failure and uncertainty states', () => {
  it('keeps loading, cancellation, denial, and retry states explicit and protected', () => {
    const loading = renderLoading('Checking private access…')
    const cancelled = renderLanding({
      authenticated: false,
      authOpen: false,
      botUsername: 'VibeCheckBot',
      notice: 'Telegram sign-in was cancelled. No private data was opened.',
    })
    const denied = renderDenied()
    const unavailable = renderUnavailable()

    expect(loading).toContain('role="status"')
    expect(cancelled).toContain('Telegram sign-in was cancelled')
    expect(denied).toContain('No community or recovery information has been shown.')
    expect(unavailable).toContain('data-action="retry"')
    expect(`${cancelled}${denied}${unavailable}`).not.toContain('Alex')
  })

  it('shows delayed observation as recoverable while keeping stored live cases visible', () => {
    const html = renderOverview(overview({ observationStatus: 'delayed' }), {
      query: '',
      state: 'all',
    })

    expect(html).toContain('role="status"')
    expect(html).toContain('New observation is delayed. Stored recovery cases remain available.')
    expect(html).toContain('Alex and Sam')
  })

  it('renders empty live data without substituting a sample case', () => {
    const html = renderOverview(overview({ cases: [], counts: emptyCounts() }), {
      query: '',
      state: 'all',
    })

    expect(html).toContain('No open recovery cases.')
    expect(html).not.toContain('Alex and Sam')
    expect(html).not.toContain('sample')
  })
})

function overview(overrides: Partial<RecoveryOverview> = {}): RecoveryOverview {
  return {
    creator: { telegramUserId: '42', displayName: 'Ada', username: 'ada', photoUrl: null },
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
      updatedAt: '2026-08-18T12:00:00.000Z',
    }],
    recentOutcomes: [],
    ...overrides,
  }
}

function emptyCounts(): RecoveryOverview['counts'] {
  return { open: 0, resolved: 0, unresolved: 0, awaitingAction: 0 }
}
