# Minds Builder API DNS resolution failure

Date observed: 2026-08-17
Integration: Hello Minds Builder API via `@animocabrands/minds-client-lib`
Environment: local macOS development environment, Node.js client and `curl`

## Summary

The live prerequisite probe cannot reach the fixed Builder API host because
`api.build.hellominds.ai` does not resolve in DNS. The failure occurs before
conversation lookup or the `eventsIterator` SSE subscriptions can be tested.
Telegram API connectivity from the same environment succeeds.

## Minimal reproduction

With a configured, untracked `.env` file:

```bash
npm run probe:live
curl -fsSI https://api.build.hellominds.ai/
curl -fsSI https://api.telegram.org/
```

The installed client is `@animocabrands/minds-client-lib@0.1.3`. Its published
implementation fixes the Builder API base URL to
`https://api.build.hellominds.ai`; the application does not override it.

## Expected behavior

1. The Builder API hostname resolves and accepts an authenticated request.
2. `getConversation(alias)` resolves each configured conversation.
3. `eventsIterator({ alias, signal })` opens both SSE streams so a new human
   Telegram event can be observed on each configured alias.
4. Only after both events are observed, the probe sends its silent confirmation
   to the authorized creator's private Telegram chat.

## Actual behavior

The application probe exits before alias validation with:

```text
Waiting up to 180000ms for one new human event on each configured alias.
Live prerequisite probe failed: Network error: fetch failed
```

The header-only connectivity checks return:

```text
curl: (6) Could not resolve host: api.build.hellominds.ai
```

The Telegram check reaches `api.telegram.org` and returns an HTTP redirect,
confirming that general outbound connectivity and DNS are available in the same
run.

## Sanitized evidence

- No API keys, bot tokens, aliases, user IDs, chat IDs, message bodies, or
  transcript content are included in this report.
- `./verify.sh phase-1` passes the TypeScript/foundation suites and fails only
  the live Minds aliases and creator-only Telegram delivery predicate.
- The live probe fails before the Telegram delivery step, so no creator or
  member received a probe message from the failed runs.

## Safe workaround status

There is no safe application-side workaround while the official client host is
fixed and does not resolve. VibeCheck has not substituted Telegram polling,
historical rows, seeded data, or another transport for the required live Minds
SSE evidence. The live gate should be rerun once the documented Builder API host
resolves or the provider publishes an updated official endpoint/client.
