import { logoMarkUrl } from '../assets.js'

interface LandingOptions {
  authenticated: boolean
  authOpen: boolean
  botUsername: string | null
  notice?: string
}

export function renderLanding(options: LandingOptions): string {
  return `
    <header class="public-header">
      <a class="brand" href="/" data-link aria-label="VibeCheck home">
        <img src="${logoMarkUrl}" alt="" width="42" height="42">
        <span>VibeCheck</span>
      </a>
      <p class="eyebrow">Private community recovery</p>
      ${renderPrimaryAction(options.authenticated, 'header-action')}
    </header>
    <main id="main-content" class="landing" data-view="landing">
      ${options.notice ? `<p class="public-notice" role="status">${options.notice}</p>` : ''}
      <section class="atlas-hero" aria-labelledby="landing-title">
        <div class="hero-copy">
          <p class="eyebrow">Recovery, not surveillance</p>
          <h1 id="landing-title">Repair community fractures before valuable members disappear.</h1>
          <p class="hero-summary">VibeCheck keeps relationship context attached to meaningful change, privately guides the creator, and follows one recovery case until the outcome is confirmed.</p>
          <div class="hero-actions">
            ${renderPrimaryAction(options.authenticated)}
          </div>
          <p class="privacy-line"><span aria-hidden="true"></span>The browser proves what happened. Decisions and outreach stay private in Telegram.</p>
        </div>
        ${renderPatchMap()}
      </section>
      ${renderRecoverySteps()}
      <section id="privacy-boundary" class="public-boundary" aria-labelledby="privacy-title">
        <p class="eyebrow">A quiet boundary</p>
        <h2 id="privacy-title">People are never turned into public scores.</h2>
        <p>VibeCheck does not label members, post moderation alerts, or contact affected people. It separates direct evidence, remembered context, Mind inference, and creator judgment.</p>
      </section>
    </main>
    ${options.authOpen ? renderAuthDialog(options.botUsername) : ''}
  `
}

function renderPrimaryAction(authenticated: boolean, className = ''): string {
  const action = authenticated ? 'cases' : 'open-auth'
  const label = authenticated ? 'Return to workspace' : 'Continue with Telegram'
  return `<button class="button button-ink ${className}" data-action="${action}">${label}</button>`
}

function renderPatchMap(): string {
  return `
    <div class="patch-map" data-brand-motif="patch-map" aria-label="One recovery case held across three stages">
      <article class="patch patch-remember">
        <span>01 · Observe</span>
        <strong>Relationship context stays attached.</strong>
      </article>
      <article class="patch patch-guide">
        <span>02 · Guide</span>
        <strong>Meaningful change, without public labels.</strong>
      </article>
      <article class="patch patch-confirm">
        <span>03 · Confirm</span>
        <strong>One case follows later evidence—not another disposable alert.</strong>
      </article>
    </div>
  `
}

function renderRecoverySteps(): string {
  return `
    <section class="recovery-steps" aria-label="How VibeCheck works">
      <article><span>01</span><h2>Observe context</h2><p>Learn what normal care and disagreement look like before interpreting change.</p></article>
      <article><span>02</span><h2>Guide intervention</h2><p>Give the creator evidence, uncertainty, and humane language without acting for them.</p></article>
      <article><span>03</span><h2>Confirm recovery</h2><p>Append later evidence to the same case and wait for the creator to confirm the outcome.</p></article>
    </section>
  `
}

function renderAuthDialog(botUsername: string | null): string {
  const authContent = botUsername
    ? `<p>Connect securely with @${botUsername}. Only the configured creator can enter the recovery workspace.</p>
        <div id="telegram-auth-widget" class="telegram-widget" role="status">Loading secure sign-in…</div>`
    : `<p role="alert">Telegram sign-in is temporarily unavailable.</p>
        <button class="button button-ink" data-action="retry-auth">Try Telegram again</button>`
  return `
    <dialog class="auth-dialog" open aria-labelledby="auth-title">
      <div class="auth-dialog-inner">
        <button class="icon-button auth-close" data-action="close-auth" aria-label="Close Telegram sign-in">×</button>
        <img src="${logoMarkUrl}" alt="" width="52" height="52">
        <p class="eyebrow">Creator access</p>
        <h2 id="auth-title">Continue privately in Telegram</h2>
        ${authContent}
        <button class="button button-text" data-action="close-auth">Return to the landing page</button>
      </div>
    </dialog>
  `
}
