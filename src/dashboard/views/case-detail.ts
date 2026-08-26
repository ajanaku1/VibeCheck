import type { RecoveryCaseDetailView, TimelineEventView } from '../api.js'

import { actorLabel, escapeHtml, formatDate, provenanceLabel, stateLabel } from './format.js'

export function renderCaseDetail(detail: RecoveryCaseDetailView): string {
  const people = escapeHtml(detail.people.join(' and '))
  return `
    <button class="back-button" data-action="back-overview">← Back to cases</button>
    <section class="detail-heading">
      <div><p class="eyebrow">Recovery thread · ${escapeHtml(detail.id)}</p><h1>${people}</h1></div>
      <div class="detail-state"><span class="state-label state-${detail.state}">${escapeHtml(stateLabel(detail.state))}</span><time>${escapeHtml(formatDate(detail.updatedAt))}</time></div>
    </section>
    <section class="detail-workbench" data-layout="mending-table">
      ${renderThreadRail(detail)}
      ${renderTimeline(detail.timeline)}
      ${renderDecisionBoundary(detail)}
    </section>
  `
}

function renderThreadRail(detail: RecoveryCaseDetailView): string {
  return `
    <aside class="thread-rail">
      <p class="eyebrow">Persistent case</p>
      <h2>One seam, every stage.</h2>
      <p>${escapeHtml(detail.observedChange)}</p>
      <ol class="thread-stages" aria-label="Recovery stages">
        ${detail.timeline.map((event, index) => renderStage(event, index)).join('')}
      </ol>
    </aside>
  `
}

function renderStage(event: TimelineEventView, index: number): string {
  return `
    <li>
      <span class="stage-node" aria-hidden="true"></span>
      <span><small>${String(index + 1).padStart(2, '0')}</small>${escapeHtml(stateLabel(event.resultingState))}</span>
    </li>
  `
}

function renderTimeline(events: TimelineEventView[]): string {
  return `
    <article class="timeline-panel">
      <div class="panel-heading"><p class="eyebrow">Evidence chronology</p><span>Read-only</span></div>
      <h2>What changed, and who said so.</h2>
      <ol class="timeline-list">${events.map(renderTimelineEvent).join('')}</ol>
    </article>
  `
}

function renderTimelineEvent(event: TimelineEventView): string {
  return `
    <li class="timeline-event provenance-${event.provenance}">
      <div class="timeline-meta"><span>${escapeHtml(provenanceLabel(event.provenance))} · ${escapeHtml(actorLabel(event.actor))}</span><time>${escapeHtml(formatDate(event.occurredAt))}</time></div>
      <h3>${escapeHtml(event.summary)}</h3>
      ${event.evidence.length ? `<div class="event-evidence">${event.evidence.map(renderEvidence).join('')}</div>` : ''}
      <p class="timeline-result">Resulting state: ${escapeHtml(stateLabel(event.resultingState))}</p>
    </li>
  `
}

function renderEvidence(evidence: { source: string; excerpt: string }): string {
  return `<blockquote><strong>${escapeHtml(evidence.source)}</strong><p>${escapeHtml(evidence.excerpt)}</p></blockquote>`
}

function renderDecisionBoundary(detail: RecoveryCaseDetailView): string {
  const context = detail.rememberedContext.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
  return `
    <aside class="decision-panel">
      <div class="boundary-mark" aria-hidden="true"></div>
      <p class="eyebrow">Creator boundary</p>
      <h2>Review here. Decide in Telegram.</h2>
      <ul class="remembered-list">${context}</ul>
      <div class="outreach-copy"><span>Creator-approved outreach</span><p>${escapeHtml(detail.finalOutreach ?? detail.suggestedOutreach)}</p></div>
      <a class="button button-ink" href="#telegram" data-action="telegram">Continue in Telegram</a>
    </aside>
  `
}
