# VibeCheck

VibeCheck is a Telegram-first community recovery agent for creators. It silently observes one configured community, uses a persistent Minds conversation to understand relationship context, privately guides the creator through outreach, and records recovery only after the creator confirms it.

Built for Creative Minds Jam #1, Moderation & Community Assistance.

## Key features

- Silent, app-owned Telegram webhook ingestion with exact group and creator allowlists.
- Evidence-backed Minds reasoning through one stable `vibecheck-engine` conversation.
- Durable SQLite observations, processing jobs, cases, events, deadlines, and notifications.
- Creator-only Telegram alerts and commands; no group or member messages.
- Telegram-authenticated, read-only Recovery Overview and case workbench.
- Deterministic conflict, recovery, timing, deduplication, and confirmation gates.

## Architecture

```text
Telegram group/private message
            |
            v
POST /api/telegram/webhook
  - verifies Telegram secret header
  - exact-matches configured chat/user
  - rejects bots, non-text, unknown chats
            |
            v
SQLite observation + durable job (atomic)
            |
            v
Observation worker
  | community evidence          | creator command
  v                             v
Stable Minds engine       Deterministic command service
  |                             |
  v                             v
Evidence/state gates      Private creator reply
  |
  v
Private notification + read-only dashboard
```

Minds is load-bearing for contextual interpretation, remembered norms, uncertainty, and outreach language. Application code remains the authority for evidence references, timing, identity, state transitions, and duplicate suppression.

The Telegram bot is owned by this application. Do **not** connect it to a Minds Telegram agent: that design cannot guarantee silence in the group. Minds is used only through the stable Builder API engine alias.

## Tech stack

- TypeScript 5.7 and Node.js 22.13+
- Fastify 5 and Vite 6
- Node `node:sqlite` in WAL mode
- `@animocabrands/minds-client-lib`
- Zod, Vitest, and Playwright

## Prerequisites

- Node.js 22.13 or newer and npm
- A configured Minds account, Mind ID, and Builder API key
- A dedicated Telegram bot created with BotFather
- One staged group using consenting participants or fictional identities
- The numeric group/supergroup ID and creator Telegram user ID
- A public HTTPS origin and durable writable production storage

For the app bot:

1. Disable group privacy in BotFather so ordinary group messages reach the bot.
2. Set the login domain for the public dashboard.
3. Add the bot to the staged group.
4. Remove or disable any old Minds-connected bot in that group.
5. Open the bot privately as the creator and press Start.

## Getting started

### 1. Install

```bash
npm install
cp .env.example .env
```

### 2. Configure the environment

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development`, `test`, or `production` |
| `APP_BASE_URL` | Public origin; HTTPS is mandatory in production |
| `PORT` | Fastify port, default `3000` |
| `DATABASE_PATH` | SQLite path; production requires a durable absolute path |
| `SESSION_SECRET` | At least 32 characters; hashes sessions/member references |
| `VIBECHECK_TIMING_PROFILE` | `demo` or `standard` |
| `TELEGRAM_BOT_TOKEN` | Token for the app-owned bot |
| `TELEGRAM_BOT_USERNAME` | Bot username without `@` |
| `TELEGRAM_COMMUNITY_CHAT_ID` | Negative numeric group/supergroup ID |
| `TELEGRAM_WEBHOOK_SECRET` | 32–256 characters from `A-Z a-z 0-9 _ -` |
| `AUTHORIZED_TELEGRAM_USER_ID` | Numeric creator user ID |
| `AUTHORIZED_TELEGRAM_CHAT_ID` | Creator private chat ID; must equal the user ID |
| `MINDS_BUILDER_API_KEY` | Server-side Minds Builder API key |
| `MINDS_MIND_ID` | UUID of the configured VibeCheck Mind |
| `MINDS_ENGINE_ALIAS` | Stable reasoning alias, normally `vibecheck-engine` |
| `MINDS_REPLY_TIMEOUT_MS` | Positive reasoning timeout, default `180000` |

Never commit `.env`, bot tokens, Builder keys, session secrets, or SQLite data.

### 3. Check and build

```bash
npm run verify
```

This type-checks browser and server code, runs the full Vitest suite, and builds the production dashboard.

### 4. Run locally

Run the API/process:

```bash
npm run dev
```

For Vite hot reload, run this in a second terminal:

```bash
npm run dev:client
```

Vite proxies `/api/` to `http://127.0.0.1:3000`. Telegram cannot deliver webhooks to localhost; use the production HTTPS setup for live ingress.

## Live setup

Deploy and start the service before registering the webhook:

```bash
npm run build
npm run start
```

Then configure and verify:

```bash
npm run configure:mind
npm run configure:telegram
npm run probe:live
```

- `configure:mind` idempotently creates only `MINDS_ENGINE_ALIAS`.
- `configure:telegram` registers `${APP_BASE_URL}/api/telegram/webhook`, the secret token, and only `message` updates without dropping queued updates.
- `probe:live` checks the engine alias, exact webhook URL, disabled group privacy, group membership, and a creator-private test delivery. It sends nothing to the group.

See [the live probe guide](docs/integration-probe.md) and [the validation quickstart](specs/001-community-recovery/quickstart.md).

## Runtime behavior and safety

### Silent Telegram ingress

The webhook accepts a message only when all required identities match:

- group/supergroup messages must match `TELEGRAM_COMMUNITY_CHAT_ID`;
- private commands must match both authorized creator IDs;
- bot-authored, non-text, malformed, and unknown-chat updates are ignored.

Telegram chat/message identity is the deduplication fingerprint. Accepted group messages store only a keyed member hash and bounded evidence excerpt. The webhook never generates a group response.

### Durable processing

Each accepted observation and its work item commit in one SQLite transaction. The runtime claims pending work, sends community batches to Minds, dispatches private commands, retries failures with bounded backoff, and reclaims stale processing claims after a restart.

### Creator-only output

Every outbound call passes through a hard allowlist. `TelegramAdapter` refuses recipients other than `AUTHORIZED_TELEGRAM_USER_ID` and sends to the creator private chat only.

### Read-only dashboard

Telegram Login proves identity; an exact configured-ID check grants authorization. The dashboard exposes evidence-limited overview/detail projections and has no state-changing case controls.

## Project structure

```text
src/
├── dashboard/             Landing, navigation, workbench views, browser API client
├── domain/                Case states, timing, evidence rules, validation, shared types
├── server/
│   ├── api/               Auth and protected recovery routes
│   ├── auth/              Telegram signature verification and sessions
│   ├── db/                SQLite setup, schema, repositories
│   ├── integrations/      Minds reasoning and creator-only Telegram delivery
│   └── services/          Webhook receiver, worker, cases, commands, deadlines
└── agent/                 Minds analysis prompts and playbook
scripts/                   Integration configuration, probes, and demo utilities
tests/                     Unit, contract, integration, and browser tests
```

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start the Fastify service in watch mode |
| `npm run dev:client` | Start Vite with API proxy and hot reload |
| `npm run build` | Build dashboard assets into `dist/` |
| `npm run start` | Start the service once |
| `npm run lint` | Run strict browser/server TypeScript checks |
| `npm test` | Run all Vitest suites |
| `npm run test:e2e` | Run Playwright browser journeys |
| `npm run verify` | Run lint, Vitest, and production build |
| `npm run configure:mind` | Ensure the stable Minds engine alias |
| `npm run configure:telegram` | Register the authenticated webhook |
| `npm run probe:live` | Verify live integration prerequisites |
| `npm run demo:seed -- <new-db-path>` | Seed disclosed rehearsal data without overwriting an existing database |
| `npm run demo:rehearse` | Run the no-network rehearsal |

## Testing

```bash
npm run test:unit
npm run test:foundation
npm run test:recovery-integration
npm run test:auth
npm run test:dashboard
npm run test:failure-integrity
npm run test:e2e
```

Regression coverage includes webhook authentication, exact allowlists, zero group output, replay deduplication, atomic work creation, restart-safe retries, malformed Minds responses, forbidden transitions, notification ambiguity, auth data leaks, provenance, and dashboard failure states.

## Production deployment

The dashboard deploys to Vercel from `vercel.json`. Vercel serves the Vite bundle and proxies `/api/*` to the Render origin so browser cookies remain same-origin. The current production frontend is `https://vibecheck-alpha-bay.vercel.app`.

The committed `infra/render.yaml` defines the free Render API, Telegram webhook, and background worker for the staged submission walkthrough. Its SQLite filesystem is ephemeral: cases can be lost after a restart or redeploy, so this configuration is for one uninterrupted demo session and does not satisfy the durable-storage production requirement below. A production backend still requires:

- one continuously running Node.js process;
- HTTPS termination at `APP_BASE_URL`;
- a durable writable volume at the parent of `DATABASE_PATH`;
- all environment values supplied server-side;
- restart policy and log collection;
- webhook configuration after the service is publicly reachable.

Build the dashboard with `npm run build`. Start the backend with `npm run start`; do not move webhook processing, SQLite, deadlines, or background work into a static deployment or ephemeral function.

After every production URL, bot token, or webhook-secret change, rerun:

```bash
npm run configure:telegram
npm run probe:live
```

Follow [the demo runbook](docs/demo-runbook.md) for the disclosed rehearsal, live three-session walkthrough, and post-run evidence gate.

## Troubleshooting

### The bot replies in the group

The bot is probably still connected to a Minds Telegram agent. Remove/disable that integration and use a separate app-owned bot token. VibeCheck's own outbound adapter cannot target the group.

### The probe reports privacy mode

Disable group privacy for the app bot in BotFather, remove/re-add the bot if Telegram requires it, then rerun `npm run probe:live`.

### The webhook URL does not match

Confirm `APP_BASE_URL` is the deployed HTTPS origin, run `npm run configure:telegram`, then probe again.

### Group messages do not appear

Check the negative `TELEGRAM_COMMUNITY_CHAT_ID`, bot membership, BotFather privacy, public HTTPS reachability, and `getWebhookInfo` errors. Do not switch to `getUpdates` polling.

### Creator commands are ignored

Both creator IDs must be numeric and represent the same private user/chat. The creator must open the app bot privately and press Start.

### Production startup rejects the database

`DATABASE_PATH` must be an absolute, non-temporary path on durable writable storage.

## Privacy boundary

VibeCheck does not warn, label, ban, message, or diagnose community members. It does not expose unrestricted transcripts, secrets, internal prompts, or unrelated member data in the browser. The creator performs outreach personally and confirms the result separately.

## License

[MIT](LICENSE)
