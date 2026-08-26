# Phase 0 Research: VibeCheck Community Recovery Agent

## Decision 1: Use one persistent Node.js service

**Decision**: Run the API/webhook, durable observation worker, deadline scheduler, Telegram notifier, and static Vite output in one long-lived Node.js process.

**Rationale**: The product needs restart-safe event consumption and autonomous time-based work. One process makes the case transaction, event cursor, and notification outbox straightforward and keeps the hackathon deployment inspectable.

**Alternatives considered**:

- Vercel-style serverless functions: rejected because continuous SSE consumption and short demo deadlines require external queue/cron infrastructure.
- Separate worker and API deployments: rejected because the MVP has one creator/community and does not justify distributed coordination.
- Browser-only integration: rejected because it would expose credentials and stop observing when the page closes.

## Decision 2: Use the official Minds client with one stable engine alias

**Decision**: Use server-side `@animocabrands/minds-client-lib` with `X-Api-Key` authentication. Idempotently configure only `vibecheck-engine`, then use `sendMessage` plus `waitForReply` for structured reasoning requests. Telegram transport does not pass through a Minds-connected bot.

**Rationale**: The official client requires Node 22+ and supports stable aliases and reply correlation. A stable engine conversation gives the Mind continuous reasoning context across the staged sessions. Telegram message IDs provide transport deduplication, while durable observation jobs provide restart-safe processing.

**Alternatives considered**:

- Maintain the existing hand-written REST wrapper: rejected because it uses obsolete bearer authentication and stale routes.
- Analyze messages with a generic model API: rejected because the hackathon requires the configured Mind to be integral.
- Let free-form model output directly mutate cases: rejected because evidence, timing, and resolution gates must be deterministic.

**Primary source**: [Minds Client Library](https://build.hellominds.ai/en/docs/get-started/client-library)

## Decision 3: Split contextual judgment from state authority

**Decision**: The Mind returns a versioned JSON analysis containing observation references, relationship/norm context, indicator classifications, confidence, uncertainty, and draft language. The server validates those references and alone applies case thresholds and transitions.

**Rationale**: Relationship fracture detection requires contextual reasoning, but duplicate prevention, exact time boundaries, creator authorization, and confirmed resolution are application invariants. This split makes the agent meaningfully intelligent without treating generated claims as observed facts.

**Alternatives considered**:

- Fully deterministic keyword detection: rejected because it cannot demonstrate remembered norms or relationship-aware departure from baseline.
- Fully agent-controlled state: rejected because retries or hallucinated evidence could silently advance a sensitive case.

## Decision 4: Use Node's built-in SQLite

**Decision**: Use file-backed `node:sqlite` `DatabaseSync` with WAL mode, foreign keys, explicit transactions, and a configurable busy timeout. Require Node 22.13+; use `:memory:` in most tests.

**Rationale**: Node's built-in module avoids native package compilation, is compatible with the Minds client's Node requirement, supports prepared statements and transactions, and is sufficient for one low-volume demo community. A persistent volume makes restarts durable.

**Alternatives considered**:

- JSON files: rejected because atomic multi-record transitions and uniqueness constraints would be fragile.
- Hosted PostgreSQL: viable for a production multi-tenant version, but unnecessary operational scope for this MVP.
- `better-sqlite3`: rejected because the built-in API removes a native dependency and its install risk.

**Primary source**: [Node.js SQLite documentation](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html)

## Decision 5: Use Telegram Login Widget verification plus server sessions

**Decision**: Embed Telegram's login widget on the landing page. POST its returned fields to the server, reconstruct the alphabetically sorted data-check string, verify the HMAC-SHA-256 signature using the SHA-256 bot-token secret, reject payloads older than five minutes, and separately compare the numeric Telegram ID to `AUTHORIZED_TELEGRAM_USER_ID`. Store only a hashed opaque session token and set an `HttpOnly`, `SameSite=Lax`, production-`Secure` cookie with an eight-hour lifetime.

**Rationale**: This gives a real Telegram identity proof while keeping the bot token server-side. Authentication and single-creator authorization remain separate, so a valid non-creator learns no community data.

**Alternatives considered**:

- Open dashboard URL protected only by obscurity: rejected because it violates the private evidence requirement.
- Telegram Web App init data: rejected because the requested entry point is a standalone landing page, not only an in-Telegram mini app.
- Open registration: explicitly excluded by the product specification.

**Primary source**: [Telegram Login Widget](https://core.telegram.org/widgets/login/)

## Decision 6: Use an app-owned Telegram webhook for inbound and private Bot API delivery

**Decision**: A separate app-owned bot delivers group and private creator messages to `POST /api/telegram/webhook` with Telegram's secret-token header. The server exact-matches the configured community/creator IDs, persists accepted messages before acknowledgement, and sends notifications only to the creator's private chat. It never calls `getUpdates` or sends to the group/member chat IDs.

**Rationale**: The prior Minds aliases contained no Telegram events, while the Minds-connected group agent replied publicly. Owning the webhook makes silence enforceable in application code. The stable Minds engine remains load-bearing for context and guidance without owning Telegram transport.

**Alternatives considered**:

- Poll Telegram directly for inbound messages: rejected because webhooks provide push delivery and avoid polling conflicts.
- Reuse a Minds-connected Telegram agent: rejected because there is no documented per-conversation read-only mode and the agent replied in the group.
- Inline callback buttons: deferred; this build accepts text commands and registers only `message` updates.
- Send member outreach automatically: explicitly prohibited; the creator must send it personally.

## Decision 7: Make processing idempotent and restart-safe

**Decision**: Deduplicate inbound messages by Telegram chat/message identity, active fractures by a stable `fracture_key`, reasoning requests by an input digest, case events by an idempotency key, and notifications with an outbox-style delivery row. Persist observation jobs and deadlines; reclaim stale work and recompute due work on startup.

**Rationale**: Webhook retries, process restarts, model timeouts, and ambiguous external delivery outcomes are normal. At-least-once delivery plus idempotent writes prevents the duplicate cases/alerts forbidden by the spec.

**Alternatives considered**:

- Trust an in-memory seen set: rejected because restarts erase it.
- Treat a timeout as failure and retry every stage blindly: rejected because a late successful send could duplicate the creator alert.

## Decision 8: Serve only evidence-limited read models

**Decision**: The dashboard APIs return purpose-built overview and case-timeline projections. They omit raw transcripts, bot/API secrets, model prompts, internal cursors, and member data unrelated to an active case. Every timeline item labels provenance as observation, remembered context, Mind inference, creator decision, or external operation.

**Rationale**: The UI needs enough evidence to make the agent trustworthy, not an unrestricted surveillance archive. Separate read models also ensure the dashboard cannot mutate recovery state.

**Alternatives considered**:

- Return database rows directly: rejected because it risks sensitive-field leakage and couples the UI to persistence.
- Continue using bundled mock data: rejected because the dashboard must prove the same live case as Telegram.

## Decision 9: Verify from pure rules outward

**Decision**: Use test-first layers: pure state/timing tests, schema/contract tests, repository transaction tests, mocked Minds/Telegram integration tests, HTTP auth/authorization tests, Playwright UI tests, then a separately gated live Minds/Telegram script.

**Rationale**: The highest-risk rules are deterministic and should be exhaustively tested without network variance. The live gate then proves the actual Mind and Telegram wiring without making the normal suite flaky.

**Alternatives considered**:

- Only record a manual demo: rejected because it would not prove boundary timing, deduplication, or failure safety.
- Put live APIs in every test run: rejected because rate limits and external availability would make CI unreliable.
