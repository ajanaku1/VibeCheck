import type { RecoveryOverview } from '../../domain/types.js'

import { escapeHtml, formatDate, observationLabel, stateLabel } from './format.js'

export interface OverviewFilters {
  query: string
  state: string
}

export function renderOverview(data: RecoveryOverview, filters: OverviewFilters): string {
  const cases = filterCases(data.cases, filters)
  const creatorName = escapeHtml(data.creator.displayName)
  return `
    <section class="workspace-heading">
      <div><p class="eyebrow">A private recovery workspace</p><h1>Keep the relationship on the table.</h1></div>
      <p>Review live cases without turning people into metrics. Decisions and outreach remain in Telegram.</p>
    </section>
    <section class="workspace-context" aria-label="Connected recovery context">
      <div><span>Community</span><strong>${escapeHtml(data.community.displayName)}</strong></div>
      <div><span>Observation</span><strong>${escapeHtml(observationLabel(data.observationStatus))}</strong></div>
      <div><span>Open cases</span><strong class="numeric">${data.counts.open}</strong></div>
      <div><span>Awaiting ${creatorName}</span><strong class="numeric">${data.counts.awaitingAction}</strong></div>
    </section>
    ${renderObservationNotice(data.observationStatus)}
    <section class="workbench" data-layout="mending-table" aria-label="Recovery case workbench">
      ${renderCaseRail(cases, filters)}
      ${renderEvidenceBench(data, cases)}
      ${renderBoundary(data, creatorName)}
    </section>
  `
}

function renderObservationNotice(status: RecoveryOverview['observationStatus']): string {
  if (status === 'delayed') {
    return '<p class="observation-notice" role="status">New observation is delayed. Stored recovery cases remain available.</p>'
  }
  if (status === 'error') {
    return '<p class="observation-notice observation-error" role="alert">New observation needs attention. Stored recovery cases remain available while the connection recovers.</p>'
  }
  return ''
}

function renderCaseRail(cases: RecoveryOverview['cases'], filters: OverviewFilters): string {
  return `
    <div class="workbench-panel case-rail">
      <div class="panel-heading"><p class="eyebrow">Cases</p><strong>${cases.length} in view</strong></div>
      <label class="field-label" for="case-search">Search</label>
      <input id="case-search" data-case-search type="search" value="${escapeHtml(filters.query)}" placeholder="Name or case reference">
      <label class="field-label" for="case-state">State</label>
      <select id="case-state" data-case-state>
        ${stateOption('all', 'All states', filters.state)}
        ${stateOption('needs_review', 'Needs review', filters.state)}
        ${stateOption('monitoring', 'Monitoring', filters.state)}
        ${stateOption('recovery_detected', 'Recovery detected', filters.state)}
      </select>
      <div class="case-list">${cases.length ? cases.map(renderCaseButton).join('') : renderNoMatches()}</div>
    </div>
  `
}

function renderCaseButton(item: RecoveryOverview['cases'][number]): string {
  const names = escapeHtml(item.people.join(' and '))
  return `
    <button class="case-row" data-action="open-case" data-case-id="${escapeHtml(item.id)}" aria-label="Open recovery case ${escapeHtml(item.id)}">
      <span class="case-row-top"><strong>${names}</strong><span class="state-label state-${item.state}">${escapeHtml(stateLabel(item.state))}</span></span>
      <span>${escapeHtml(item.observedChange)}</span>
      <small><span>${escapeHtml(item.id)}</span><time>${escapeHtml(formatDate(item.updatedAt))}</time></small>
    </button>
  `
}

function renderEvidenceBench(data: RecoveryOverview, cases: RecoveryOverview['cases']): string {
  const featured = cases[0]
  if (!featured) return renderEmptyBench()
  return `
    <article class="workbench-panel evidence-bench">
      <div class="panel-heading"><p class="eyebrow">Evidence bench</p><span class="seam-status"><i></i>Live proof</span></div>
      <h2>Different truths keep their edges.</h2>
      <dl class="evidence-preview">
        <div><dt>Community message</dt><dd>${escapeHtml(featured.observedChange)}</dd></div>
        <div><dt>Remembered context</dt><dd>Relationship history stays attached to the case, never converted into a public score.</dd></div>
        <div><dt>Mind inference</dt><dd>${escapeHtml(featured.uncertainty)} Confidence is supporting context, not authority.</dd></div>
      </dl>
      <p class="freshness">Updated ${escapeHtml(formatDate(featured.updatedAt))} · ${escapeHtml(data.timingProfile)} timing profile</p>
    </article>
  `
}

function renderBoundary(data: RecoveryOverview, creatorName: string): string {
  const outcomes = data.recentOutcomes.length
  return `
    <aside class="workbench-panel boundary-panel">
      <div class="boundary-mark" aria-hidden="true"></div>
      <p class="eyebrow">Boundary</p>
      <h2>Creator choice lives in Telegram.</h2>
      <p>The browser cannot contact anyone or change case state. ${creatorName} reviews proof here, then continues privately.</p>
      <a class="button button-ink" href="#telegram" data-action="telegram">Open Telegram</a>
      <div class="outcome-note"><span>Recent outcomes</span><strong class="numeric">${outcomes}</strong></div>
    </aside>
  `
}

function filterCases(
  cases: RecoveryOverview['cases'],
  filters: OverviewFilters,
): RecoveryOverview['cases'] {
  const query = filters.query.trim().toLowerCase()
  return cases.filter((item) => {
    const matchesState = filters.state === 'all' || item.state === filters.state
    const haystack = `${item.id} ${item.people.join(' ')} ${item.observedChange}`.toLowerCase()
    return matchesState && (!query || haystack.includes(query))
  })
}

function stateOption(value: string, label: string, selected: string): string {
  return `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`
}

function renderNoMatches(): string {
  return '<p class="case-list-empty">No live cases match this view. Clear the search or choose another state.</p>'
}

function renderEmptyBench(): string {
  return '<article class="workbench-panel evidence-bench empty-bench"><p class="eyebrow">Evidence bench</p><h2>No open recovery cases.</h2><p>VibeCheck is still observing quietly. New evidence will appear only when it belongs to a durable case.</p></article>'
}
