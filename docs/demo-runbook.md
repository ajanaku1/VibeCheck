# VibeCheck Demo Runbook

This runbook separates deterministic rehearsal from live submission evidence. Never present rehearsal rows as live Minds behavior.

## 1. No-network rehearsal

Run the complete case sequence in an in-memory SQLite database:

```bash
npm run demo:rehearse
```

The command must report `mode: rehearsal`, one case, a final `resolved` state, and this ordered event sequence:

1. `case_opened`
2. `draft_approved`
3. `outreach_sent_confirmed`
4. `evidence_appended`
5. `recovery_detected`
6. `recovery_confirmed`

To create a local dashboard database, provide a new path explicitly:

```bash
npm run demo:seed -- ./data/rehearsal.sqlite
```

The seeder refuses to overwrite an existing database.

## 2. Production prerequisites

Deploy `render.yaml` from the repository. It intentionally uses Render's free tier and an ephemeral SQLite path. A restart or redeploy can erase the demo database, so finish configuration and record the walkthrough in one uninterrupted service session. Populate every `sync: false` environment variable in the Render dashboard, then confirm:

- `APP_BASE_URL` is the final HTTPS Render origin.
- `TELEGRAM_COMMUNITY_CHAT_ID` is the exact negative ID of the staged group.
- `AUTHORIZED_TELEGRAM_USER_ID` and `AUTHORIZED_TELEGRAM_CHAT_ID` are the same creator ID.
- `MINDS_MIND_ID` is the approved VibeCheck Mind.
- the Telegram bot is not connected to any other webhook or Minds Telegram integration.

After the service health check passes, run:

```bash
npm run configure:mind
npm run configure:telegram
npm run probe:live
```

`configure:telegram` replaces the bot's previous webhook. Do not run it before the production service is healthy.

## 3. Live three-session walkthrough

Use consenting participants or clearly fictional identities. Keep the screen label `Demo Mode` visible.

### Session 1 — retained context

Post messages that establish both:

- a community norm of challenging ideas without making disagreement personal;
- an existing Alex–Sam pattern of repairing disagreements by pairing on a smaller next step.

Wait for the live Mind baseline reasoning run to succeed. The bot must remain silent in the group.

### Session 2 — one fracture and private intervention

Post exactly the staged three-message exchange from `tests/fixtures/canonical-scenario.ts`. Confirm that:

- both members contribute;
- the exchange includes dismissal and explicit intent to disengage;
- one case and one private creator alert appear;
- `Approve` leaves the case in `needs_review`;
- a separate `Sent` command moves it to `monitoring`.

### Session 3 — recovery and confirmation

Post the affected member's return first. It must not request confirmation alone. Then post the relevant constructive interaction involving both members. Confirm that one private recovery prompt appears. Send `Confirm recovery` and verify the case becomes `resolved`.

## 4. Evidence gate

Run this command on the deployed instance before it restarts, while `DATABASE_PATH` still points at the active ephemeral database:

```bash
npm run verify:live-demo
```

It fails unless the database contains exactly three non-rehearsal Telegram sessions, successful baseline/fracture/recovery reasoning, one resolved case with the canonical event order, active norm and relationship context, and sent initial/recovery creator notifications.

Record only the resulting identifiers and statuses in `docs/verification.md`. Do not copy credentials, unrestricted transcripts, or participant identifiers into submission materials.
