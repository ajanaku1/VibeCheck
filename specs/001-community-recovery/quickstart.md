# Quickstart Validation Guide

This guide defines the runnable proof for the feature. It does not replace implementation tasks or automated tests.

## Prerequisites

- Node.js 22.13 or newer
- A configured and enabled VibeCheck Mind
- A separate app-owned Telegram bot that is not connected to a Minds Telegram agent
- BotFather group privacy disabled so the app bot can read ordinary group messages
- One staged Telegram group containing the bot and consenting or fictional participants
- The bot domain configured with BotFather `/setdomain`
- The exact authorized creator Telegram numeric ID and private chat ID
- One stable Minds engine alias
- A public HTTPS URL for the final Telegram sign-in walkthrough

## Configure

Copy `.env.example` to `.env` and provide server-side values for:

```text
APP_BASE_URL
PORT
DATABASE_PATH
SESSION_SECRET
VIBECHECK_TIMING_PROFILE
TELEGRAM_BOT_TOKEN
TELEGRAM_BOT_USERNAME
TELEGRAM_COMMUNITY_CHAT_ID
TELEGRAM_WEBHOOK_SECRET
AUTHORIZED_TELEGRAM_USER_ID
AUTHORIZED_TELEGRAM_CHAT_ID
MINDS_BUILDER_API_KEY
MINDS_MIND_ID
MINDS_ENGINE_ALIAS
MINDS_REPLY_TIMEOUT_MS
```

Use `VIBECHECK_TIMING_PROFILE=demo` only for the disclosed staged walkthrough. Never commit `.env` or the SQLite database.

Remove or disable the old Minds-connected Telegram bot in the staged group before rollout. Then deploy the HTTPS service and configure the new webhook:

```bash
npm run configure:mind
npm run configure:telegram
npm run probe:live
```

The probe checks the stable Minds engine, exact webhook URL, BotFather privacy setting, bot membership in the configured group, and a creator-private delivery. It never sends to the group.

## Install and build

```bash
npm install
npm run lint
npm test
npm run build
```

Expected: type-check, unit, contract, integration, and production builds pass without live credentials.

## Start locally

```bash
npm run dev
```

Expected:

- `/` is public and contains the recovery promise, three steps, case example, privacy boundary, Telegram action, and demo action.
- `/dashboard` does not expose data without an authorized session.
- `/api/health` reports process/database readiness without returning secret or community data.

## Automated verification layers

```bash
npm run test:unit
npm run test:contract
npm run test:integration
npm run test:e2e
```

Expected proof:

1. All allowed and forbidden transitions in [data-model.md](./data-model.md) pass.
2. Demo and Standard timing boundaries are ineligible one millisecond before and eligible exactly at the threshold.
3. Duplicate fingerprints, reasoning input digests, fracture keys, events, and notification deliveries do not duplicate effects.
4. Invalid Mind JSON, unknown evidence references, timeouts, persistence failures, and Telegram failures never silently advance state.
5. Telegram signatures, age checks, creator authorization, session expiry, logout, and protected-route denial pass.
6. API bodies conform to [openapi.yaml](./contracts/openapi.yaml), and Mind replies conform to [minds-analysis.schema.json](./contracts/minds-analysis.schema.json).
7. The Playwright run covers landing, failed/cancelled auth UI, authorized overview/detail, unauthorized denial, refresh, and logout.

## Seeded no-network rehearsal

```bash
npm run demo:seed -- ./data/rehearsal.sqlite
npm run demo:rehearse
```

Expected: fixtures create the canonical case and exact timeline without external calls. This validates presentation and deterministic rules only; it must be visibly labeled as a rehearsal and is not submission evidence of live Minds behavior.

## Live Minds and Telegram gate

```bash
npm run verify:live-demo
```

The script must fail closed if required live configuration is absent. It should print evidence identifiers, not secrets or unrestricted transcripts.

Expected canonical sequence:

1. Session 1 establishes at least one accepted community norm and one relationship observation through a live Mind reply. The bot posts nothing in the group.
2. Session 2 provides at least three messages from both involved members and two verified escalation indicators. Exactly one case and one private creator alert appear without a contemporaneous creator prompt.
3. `Approve` or an edited draft returns final text while state stays `needs_review`.
4. Separate `Sent` advances the same case to `monitoring`.
5. Session 3 includes the affected member's return and a relevant constructive interaction. Either signal alone must do nothing; together they trigger one private confirmation request without a creator prompt.
6. `Confirm recovery` advances the case to `resolved`; no earlier action can do so.
7. The authenticated dashboard shows the same case ID and ordered events as Telegram.
8. The entire recorded path is 90–120 seconds and every compressed-time surface displays `Demo Mode`.

## Failure rehearsal

Run the documented integration fault switches for Minds timeout, invalid Mind JSON, database write failure, Telegram ambiguous delivery, duplicate SSE event, unauthorized identity, and expired auth payload. Each must produce an explicit delayed/error result, zero fabricated evidence, and no forbidden state change.

## Final independent acceptance

Create a feature-specific `done-when.md` from the spec success criteria and run the repository-mandated independent checker with network and writable Claude configuration:

```bash
/Users/mac/Vibecoding/loop/guardrails/claude-check.sh done-when.md --dir /Users/mac/Vibecoding/VibeCheck
```

Only exit code 0 with no degraded-access warning is a pass.
