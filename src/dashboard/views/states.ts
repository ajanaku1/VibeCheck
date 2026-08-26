import { logoMarkUrl } from '../assets.js'

export function renderLoading(message: string): string {
  return `
    <main id="main-content" class="system-state" data-view="loading">
      <img src="${logoMarkUrl}" alt="" width="58" height="58">
      <div class="loading-seam" aria-hidden="true"><span></span></div>
      <p role="status">${message}</p>
    </main>
  `
}

export function renderDenied(): string {
  return `
    <main id="main-content" class="system-state denied-state" data-view="denied">
      <img src="${logoMarkUrl}" alt="" width="64" height="64">
      <p class="eyebrow">Authorization boundary</p>
      <h1>This recovery space stays private.</h1>
      <p>The Telegram identity was valid, but it is not the configured creator. No community or recovery information has been shown.</p>
      <button class="button button-ink" data-action="return-landing">Return to landing</button>
    </main>
  `
}

export function renderUnavailable(): string {
  return `
    <main id="main-content" class="system-state error-state" data-view="unavailable">
      <img src="${logoMarkUrl}" alt="" width="64" height="64">
      <p class="eyebrow">Evidence delayed</p>
      <h1>The recovery record is delayed.</h1>
      <p>VibeCheck could not retrieve the protected record safely. Nothing has been replaced with sample data.</p>
      <div class="state-actions"><button class="button button-ink" data-action="retry">Try again</button><button class="button button-text" data-action="return-landing">Return to landing</button></div>
    </main>
  `
}

export function renderNotFound(): string {
  return `
    <main id="main-content" class="system-state" data-view="not-found">
      <img src="${logoMarkUrl}" alt="" width="64" height="64">
      <p class="eyebrow">Thread unavailable</p>
      <h1>This recovery case could not be found.</h1>
      <p>It may have expired or belong to another recovery space.</p>
      <button class="button button-ink" data-action="back-overview">Return to cases</button>
    </main>
  `
}
