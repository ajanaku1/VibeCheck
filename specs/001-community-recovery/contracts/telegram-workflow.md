# Telegram Creator Workflow Contract

The configured bot remains silent in the community. It sends only to `AUTHORIZED_TELEGRAM_CHAT_ID`, which must correspond to `AUTHORIZED_TELEGRAM_USER_ID`. The dashboard never provides mutation controls.

## Initial case alert

An initial alert contains, in order:

1. `Recovery Case <short-id> · Needs Review`
2. observed change
3. remembered norm/relationship context
4. minimal quoted or paraphrased evidence
5. Mind inference, confidence, and uncertainty, visibly labeled
6. suggested creator-written outreach
7. allowed replies: `Approve <case-id>`, `Edit <case-id>: <replacement>`, or `Dismiss <case-id>`

Only one alert may be delivered for the opening event. A retry edits or reconciles the same delivery record; it does not create a second semantic alert.

## Commands

Commands are case-insensitive for the action keyword. A short case ID may be omitted only when exactly one case is eligible for that action.

### Approve

```text
Approve <case-id>
```

Valid only in `needs_review`. Copies the suggested outreach to final outreach, returns the final copy, and leaves the case in `needs_review`.

### Edit

```text
Edit <case-id>: <replacement outreach text>
```

Valid only in `needs_review`. Replacement text must be 1–2,000 characters after trimming. Stores and returns the final copy and leaves the case in `needs_review`.

### Sent

```text
Sent <case-id>
```

Valid only in `needs_review` after Approve or Edit produced final copy. Records that the creator personally performed outreach and moves the case to `monitoring`. The bot never sends that outreach to the member.

### Dismiss

```text
Dismiss <case-id>
```

Valid only in `needs_review`. Moves to `dismissed` and starts the configured cooling period.

### Confirm recovery

```text
Confirm recovery <case-id>
```

Valid only in `recovery_detected`. Moves to `resolved` only when both stored recovery-evidence gates remain present.

### Reject recovery

```text
Not recovered <case-id>
```

Valid only in `recovery_detected`. Returns the case to `monitoring` and retains all evidence and history.

### Confirm fracture remains

```text
Still unresolved <case-id>
```

Valid in `monitoring` or `recovery_detected`. Moves the case to `unresolved` and records the creator's outcome.

## Invalid or ambiguous commands

The bot responds privately with the current case state and allowed next actions. It makes no state change. If multiple cases are eligible and no case ID is supplied, it lists only short IDs, state, and affected labels—never unrelated evidence.

## Recovery confirmation request

After both verified recovery signals are committed, the bot sends:

1. `Recovery Case <short-id> · Recovery Detected`
2. separate labels for member return and relevant constructive interaction
3. a concise Mind summary of what changed and remaining uncertainty
4. allowed replies: `Confirm recovery <case-id>`, `Not recovered <case-id>`, or `Still unresolved <case-id>`

This request is autonomous: it is triggered by new group evidence, not a new creator prompt. It is delivered once per `recovery_detected` event.

## Failure language

- Reasoning delayed: state that analysis is delayed and the case has not advanced.
- Persistence failure: do not claim an action succeeded; invite retry.
- Delivery result unknown: record an ambiguous delivery and reconcile before retrying.
- Unsupported command: explain valid commands without implying the action was performed.

All creator-facing messages disclose `Demo Mode` when compressed timing is active.
