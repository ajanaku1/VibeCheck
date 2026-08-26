# Data Model: VibeCheck Community Recovery Agent

All timestamps are UTC ISO-8601 strings at the TypeScript boundary and integer Unix milliseconds in SQLite. IDs are opaque UUIDs unless an external system supplies the identifier. JSON columns are validated by Zod before write and after read.

## CreatorIdentity

Represents the single configured steward. It is primarily configuration-backed; the database retains only the latest verified display fields needed by the dashboard.

| Field | Type | Rules |
|---|---|---|
| `telegramUserId` | string | Numeric string; must exactly equal configured authorized ID |
| `displayName` | string | 1–128 characters; from verified Telegram payload |
| `username` | string \| null | Verified Telegram value; not used for authorization |
| `photoUrl` | string \| null | HTTPS URL only; display-only |
| `lastAuthenticatedAt` | timestamp | Updated only after signature, freshness, and authorization checks |

## AuthSession

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `tokenHash` | string | Unique SHA-256 hash; raw token exists only in the cookie |
| `telegramUserId` | string | Must reference the authorized creator |
| `createdAt` | timestamp | Immutable |
| `expiresAt` | timestamp | Eight hours after creation |
| `revokedAt` | timestamp \| null | Set on logout |

Valid only when unrevoked, unexpired, and still equal to the configured creator ID.

## Community

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Exactly one configured row |
| `telegramChatRef` | string | Non-public stable reference; never returned by API |
| `displayName` | string | Creator-visible configured name |
| `mindsSourceAlias` | string | Stable alias for the live Telegram community conversation |
| `observationStatus` | enum | `learning`, `observing`, `delayed`, `error` |
| `timingProfile` | enum | `demo`, `standard` |
| `lastObservedAt` | timestamp \| null | Latest committed human observation |
| `lastError` | string \| null | Sanitized operational summary; no secrets |

## MemberReference

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `communityId` | UUID | Foreign key |
| `externalRefHash` | string | Unique per community; keyed hash of source member identifier |
| `displayLabel` | string | Minimal staged label used in evidence |
| `firstSeenAt` | timestamp | Immutable |
| `lastActiveAt` | timestamp | Updated from observed human messages |
| `activityCount` | integer | Non-negative |

Raw member chat IDs are not exposed to the UI or used as outbound notification targets.

## CommunityContext

Evidence-backed context created from Mind interpretation and accepted source references.

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `communityId` | UUID | Foreign key |
| `kind` | enum | `norm`, `relationship` |
| `statement` | string | 1–500 characters |
| `memberRefs` | UUID[] | Relationship facts require at least two members |
| `evidenceObservationIds` | UUID[] | Non-empty; every reference must resolve |
| `confidence` | number | 0–1 inclusive |
| `status` | enum | `active`, `superseded` |
| `createdAt` | timestamp | Immutable |
| `supersededAt` | timestamp \| null | Required only for superseded context |

## Observation

Immutable source evidence or an explicitly internal signal.

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `communityId` | UUID | Foreign key |
| `source` | enum | `minds_telegram_group`, `minds_creator_chat`, `scheduler` |
| `sourceFingerprint` | string | Unique when supplied by Minds; deduplication key |
| `sessionRef` | string | Stable staged-session label or derived time bucket |
| `memberRefId` | UUID \| null | Null for scheduler/system observations |
| `occurredAt` | timestamp | Source time, not ingestion time |
| `ingestedAt` | timestamp | Server receipt time |
| `evidenceExcerpt` | string | Minimal necessary excerpt, maximum 500 characters |
| `contentDigest` | string | SHA-256 digest for correlation and duplicate checks |
| `visibility` | enum | `internal`, `case_evidence` |

## ReasoningRun

Tracks every live Mind call without elevating its output to observed fact.

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `inputDigest` | string | Unique for the same analysis kind and observation set |
| `analysisKind` | enum | `baseline`, `fracture`, `recovery`, `draft` |
| `engineAlias` | string | Stable Minds conversation alias |
| `inputObservationIds` | UUID[] | Non-empty and resolvable |
| `status` | enum | `pending`, `succeeded`, `timed_out`, `invalid`, `failed` |
| `response` | JSON \| null | Validated `minds-analysis.schema.json` payload only |
| `errorCode` | string \| null | Sanitized stable code |
| `startedAt` | timestamp | Immutable |
| `completedAt` | timestamp \| null | Required after terminal status |

## RecoveryCase

One durable fracture record. `Learning` is the community's pre-case observation status, not a persisted Recovery Case state.

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key; creator-facing case identity |
| `communityId` | UUID | Foreign key |
| `fractureKey` | string | Stable hash of community, members, and relationship/topic context |
| `trigger` | enum | `escalating_conflict`, `post_conflict_silence` |
| `state` | enum | `needs_review`, `monitoring`, `recovery_detected`, `resolved`, `unresolved`, `dismissed` |
| `confidence` | number | 0–1 inclusive |
| `uncertainty` | string | Required, 1–500 characters |
| `openedAt` | timestamp | First eligible evidence time |
| `updatedAt` | timestamp | Last event time |
| `monitoringStartedAt` | timestamp \| null | Set only after `Sent` |
| `resolutionDueAt` | timestamp \| null | Derived from active timing profile |
| `dismissedUntil` | timestamp \| null | Derived from active timing profile |
| `outcomeSummary` | string \| null | Required for resolved/unresolved outcome |
| `version` | integer | Incremented on mutation for optimistic checks |

Constraints:

- At most one non-terminal case for the same `fractureKey`.
- A new equivalent case cannot open before `dismissedUntil`.
- All state changes are transactionally paired with a CaseEvent.
- State cannot be updated by a generic repository method; only transition commands may write it.

## CaseParticipant

Joins a case to its affected members and their role (`affected`, `counterparty`). At least two participants are required for an escalating-conflict case.

## CaseEvidence

Joins a case to an Observation or CommunityContext with a role:

- `observed_change`
- `remembered_context`
- `escalation_indicator`
- `silence_signal`
- `return_signal`
- `constructive_interaction`

An observation can be linked once per case/role. Recovery eligibility requires both `return_signal` and `constructive_interaction` for the affected participant, with the latter tied to the original relationship or conflict context.

## InterventionPlan

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `caseId` | UUID | One current plan per case |
| `suggestedText` | string | Mind-authored, 1–2,000 characters |
| `finalText` | string \| null | Set by Approve or Edit |
| `finalizedBy` | enum \| null | `approve`, `edit` |
| `finalizedAt` | timestamp \| null | Does not change case state |
| `sentConfirmedAt` | timestamp \| null | Set only by separate creator `Sent` command |

## CaseEvent

Append-only audit timeline.

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `caseId` | UUID | Foreign key |
| `idempotencyKey` | string | Unique per case |
| `eventType` | enum | See event list below |
| `actor` | enum | `community_member`, `mind`, `creator`, `system`, `external_service` |
| `provenance` | enum | `observation`, `remembered_context`, `mind_inference`, `creator_decision`, `external_operation` |
| `summary` | string | Creator-safe, 1–500 characters |
| `evidenceRefs` | UUID[] | May reference observations/context; all must resolve |
| `fromState` | case state \| null | Null only for case opening |
| `toState` | case state | Resulting state, including unchanged event state |
| `occurredAt` | timestamp | Immutable |

Event types include `case_opened`, `evidence_appended`, `draft_approved`, `draft_edited`, `outreach_sent_confirmed`, `case_dismissed`, `recovery_detected`, `recovery_rejected`, `recovery_confirmed`, `case_expired`, `notification_attempted`, `notification_delivered`, `notification_delayed`, and `invalid_command`.

## NotificationDelivery

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `caseEventId` | UUID | One semantic notification per triggering event/kind |
| `kind` | enum | `initial_alert`, `final_copy`, `recovery_confirmation`, `command_help`, `delay_notice` |
| `recipientTelegramId` | string | Must equal configured creator ID |
| `payloadDigest` | string | Allows ambiguous-result reconciliation |
| `status` | enum | `pending`, `sent`, `unknown`, `failed` |
| `attemptCount` | integer | Non-negative |
| `telegramMessageId` | string \| null | Set on confirmed success |
| `lastAttemptAt` | timestamp \| null | Updated per attempt |
| `lastErrorCode` | string \| null | Sanitized |

Unique constraint: `(caseEventId, kind)`.

## IngestionCursor

Stores the last committed Minds fingerprint per alias. The cursor advances only in the same transaction that commits the corresponding observation, so reconnecting is safe.

## Timing Profiles

| Profile | Post-conflict silence | Dismissal cooling | Unresolved window |
|---|---:|---:|---:|
| `demo` | 90 seconds | 3 minutes | 10 minutes |
| `standard` | 48 hours | 24 hours | 7 days |

Eligibility uses `now >= deadline`; no transition occurs when `now < deadline`. Switching profiles recalculates future deadlines from their original anchor and never bypasses evidence or confirmation gates.

## State Transition Table

| Current | Input and guards | Next | Side effects |
|---|---|---|---|
| no case | Baseline exists; 3-message/two-member exchange; 2 verified escalation indicators | `needs_review` | Create case/event/plan; queue one initial alert |
| no case | Related conflict then affected-member silence reaches profile threshold | `needs_review` | Create or enrich one case; queue one initial alert |
| `needs_review` | Creator Approve | `needs_review` | Store suggested text as final; return final copy |
| `needs_review` | Creator Edit with non-empty text | `needs_review` | Store edited final text; return final copy |
| `needs_review` | Creator `Sent` and final text exists | `monitoring` | Record creator-performed outreach; set deadline |
| `needs_review` | Creator Dismiss | `dismissed` | Set cooling deadline |
| `monitoring` | Affected member returns and relevant constructive interaction exists | `recovery_detected` | Append evidence; queue confirmation request |
| `monitoring` | Resolution deadline reached or creator confirms fracture remains | `unresolved` | Record outcome |
| `recovery_detected` | Creator confirms recovery | `resolved` | Record creator-confirmed outcome |
| `recovery_detected` | Creator rejects recovery | `monitoring` | Record rejection; continue observing |
| `recovery_detected` | Resolution deadline reached | `unresolved` | Record unconfirmed outcome |
| any state | Invalid/ambiguous command | unchanged | Append help/error event; explain allowed actions |

`resolved`, `unresolved`, and `dismissed` are terminal for that case record. Later eligible evidence after the applicable cooling/terminal rules opens a new case identity rather than rewriting history.
