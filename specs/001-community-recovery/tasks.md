# Tasks: VibeCheck Community Recovery Agent

**Input**: Design documents from `/specs/001-community-recovery/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`

**Tests**: Required by FR-028 and the repository workflow. For each behavior, write the named test first, run it to observe the expected failure, then implement.

**Organization**: Tasks are grouped by user story. Paths are repository-relative and every story has an independent acceptance target.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run concurrently because it targets different files and has no unmet dependency on another marked task
- **[Story]**: Maps work to the corresponding specification user story

## Phase 1: Setup

**Purpose**: Convert the mock-only Vite project into one buildable browser/server TypeScript application.

- [x] T001 Update runtime/dev dependencies and scripts for Fastify, cookies/static serving, official Minds client, Zod, Vitest, and Playwright in `package.json` and `package-lock.json`
- [x] T002 [P] Split browser/server/test compilation settings in `tsconfig.json`, `tsconfig.server.json`, and `vite.config.ts`
- [x] T003 [P] Create the planned source and test directory skeleton with barrel-free placeholder-free directories under `src/domain/`, `src/server/`, and `tests/`
- [x] T004 [P] Replace the environment template with all required non-secret settings and safe documentation in `.env.example`
- [x] T005 [P] Update ignore rules for SQLite files, sessions, coverage, build output, and local live-gate artifacts in `.gitignore`

---

## Phase 2: Foundational Infrastructure

**Purpose**: Establish validated configuration, persistence, shared contracts, and the service shell that block every user story.

**Critical**: No user-story implementation begins until this phase passes.

- [x] T006 [P] Write failing configuration tests for missing secrets, identity allowlist, timing profile, production HTTPS origin, and durable writable database path in `tests/unit/config.test.ts` (NFR-004, SC-020)
- [x] T007 [P] Write failing migration/repository tests for foreign keys, append-only events, active fracture uniqueness, cursor atomicity, and notification uniqueness in `tests/integration/database.test.ts` (FR-011, FR-020, NFR-003)
- [x] T008 [P] Write failing JSON Schema and OpenAPI parsing/shape tests in `tests/contract/contracts.test.ts` using `specs/001-community-recovery/contracts/`
- [x] T009 [P] Define shared case, evidence, provenance, command, timing, and read-model types with no `any` usage in `src/domain/types.ts`
- [x] T010 Implement typed environment parsing and fail-closed production validation in `src/server/config.ts` until T006 passes
- [x] T011 Implement SQLite connection policy, WAL/foreign-key setup, schema migrations, and transactional helper in `src/server/db/database.ts` and `src/server/db/migrations.ts`
- [x] T012 Implement typed repositories for identities, sessions, observations, context, reasoning runs, cases, events, interventions, deliveries, and cursors under `src/server/db/repositories/` until T007 passes
- [x] T013 [P] Implement reusable Zod boundary schemas matching the versioned contracts in `src/domain/validation.ts` until T008 passes
- [x] T014 [P] Implement structured redacted logging and stable operational error types in `src/server/logger.ts` and `src/server/errors.ts`
- [x] T015 Implement the dependency-injected Fastify application shell, security headers, problem responses, and health route in `src/server/app.ts`
- [ ] T016 Configure and run the fail-closed live prerequisite probe that proves the app-owned Telegram webhook, group read access, stable Minds engine alias, and creator-only delivery in `scripts/probe-live-integrations.ts` and `docs/integration-probe.md`

**Checkpoint**: The service starts with valid local configuration, fails closed with invalid production configuration, migrates an empty database, and exposes no protected feature data yet.

---

## Phase 3: User Story 1 — Recover a Community Relationship (Priority: P1) 🎯 MVP

**Goal**: Use the live VibeCheck Mind across three Telegram sessions to open one evidence-backed case, support creator-led intervention, autonomously detect recovery, and resolve only on creator confirmation.

**Independent Test**: Run the canonical three-session fixture through the real pipeline. It must recall prior context, stay silent in-group, create one case/alert after all conflict gates, keep Approve/Edit in Needs Review, move `Sent` to Monitoring, require both recovery signals, request confirmation autonomously, and resolve only after `Confirm recovery`.

### Tests for User Story 1 — write and observe failure first

- [x] T017 [P] [US1] Write exhaustive failing state-transition tests, including forbidden transitions and unchanged-state events, in `tests/unit/case-state.test.ts` (FR-013–FR-019, SC-006, SC-008)
- [x] T018 [P] [US1] Write failing exact-boundary tests for both timing profiles, profile changes, and identical evidence/state order across profiles in `tests/unit/timing-profile.test.ts` (FR-030, SC-015–SC-016)
- [x] T019 [P] [US1] Write failing conflict-gate tests for baseline, three messages, both members, two distinct indicator types, and isolated negativity in `tests/unit/conflict-eligibility.test.ts` (FR-008–FR-009, FR-031, SC-004)
- [x] T020 [P] [US1] Write failing recovery-gate tests for affected-member return plus context-relevant constructive interaction in `tests/unit/recovery-eligibility.test.ts` (FR-017–FR-019, SC-007–SC-008)
- [x] T021 [P] [US1] Write failing Mind-response tests for schema version, malformed JSON, unknown observation refs, non-human source rows, timeout, and late reply in `tests/integration/reasoning-service.test.ts` (FR-007, FR-023, FR-025)
- [x] T022 [P] [US1] Write failing replay/concurrency tests proving one observation, case, event, and semantic notification per idempotency key in `tests/integration/observation-pipeline.test.ts` (FR-011, SC-004, SC-010, NFR-003)
- [x] T023 [P] [US1] Write failing creator-command journey tests for Approve, Edit, Sent, Dismiss, Confirm recovery, Not recovered, and Still unresolved in `tests/integration/creator-commands.test.ts` (FR-013–FR-019)
- [x] T024 [P] [US1] Write failing deadline restart tests for silence, cooling, unresolved expiry, and persisted resumption in `tests/integration/deadline-scheduler.test.ts` (FR-015, FR-019, FR-030, NFR-003)
- [x] T025 [P] [US1] Write failing Telegram allowlist/delivery tests proving private creator-only output, no group/member sends, and retry deduplication in `tests/integration/telegram-notifier.test.ts` (FR-006, FR-012, SC-011)

### Implementation for User Story 1

- [x] T026 [P] [US1] Implement the pure case transition table and invariant errors in `src/domain/case-state.ts` until T017 passes
- [x] T027 [P] [US1] Implement Demo/Standard durations, exact deadline math, and safe profile recalculation in `src/domain/timing-profile.ts` until T018 passes
- [x] T028 [US1] Implement deterministic conflict and recovery eligibility predicates over validated evidence refs in `src/domain/eligibility.ts` until T019 and T020 pass
- [x] T029 [P] [US1] Replace the obsolete custom REST wrapper with the official client adapter, alias setup, history, reply, and abortable SSE methods in `src/server/integrations/minds-adapter.ts`
- [x] T030 [P] [US1] Implement creator-allowlisted Bot API `sendMessage` with no inbound polling or group delivery in `src/server/integrations/telegram-adapter.ts`
- [x] T031 [P] [US1] Replace generic profiling/briefing prompts with the evidence-reference JSON analysis contract in `src/agent/prompts/recovery-analysis.md` and `src/agent/prompts/recovery-follow-up.md` (FR-007–FR-010, FR-017, FR-023)
- [x] T032 [P] [US1] Rewrite the VibeCheck Mind playbook to remain silent in-group, preserve uncertainty, never contact members, and follow the Telegram workflow contract in `src/agent/skill.md` (FR-005–FR-006, FR-027)
- [x] T033 [US1] Implement validated stable-alias Mind calls, input digests, reply correlation, and delayed/invalid outcomes in `src/server/services/reasoning-service.ts` until T021 passes
- [x] T034 [US1] Implement transactional case opening/updating, evidence linking, transition events, interventions, recovery decisions, and outcome recording in `src/server/services/case-service.ts` until T017–T024 pass
- [x] T035 [US1] Implement authenticated Telegram webhook ingestion, message-ID deduplication, durable observation work, and bounded analysis batches in `src/server/services/telegram-webhook-receiver.ts` and `src/server/services/observation-worker.ts`
- [x] T036 [US1] Implement post-commit outbox delivery, ambiguous-result handling, and provenance-labeled Mind-authored Telegram messages in `src/server/services/notification-service.ts` until T025 passes
- [x] T037 [US1] Implement private command parsing, actionable-case disambiguation, allowed-action help, and transition dispatch in `src/server/services/command-service.ts` until T023 passes
- [x] T038 [US1] Implement restart-safe deadline polling and due-work reconciliation in `src/server/services/deadline-scheduler.ts` until T024 passes
- [x] T039 [US1] Wire the Telegram receiver, durable worker, stable Mind engine, scheduler, and graceful shutdown into `src/server/index.ts`
- [x] T040 [US1] Create idempotent engine-alias and Telegram-webhook configuration scripts, then wire static serving plus graceful shutdown in `src/server/index.ts`

**Checkpoint**: User Story 1 works without any dashboard. The creator can complete the full recovery loop privately in Telegram, and the database contains one auditable case timeline.

---

## Phase 4: User Story 2 — Access a Private Recovery Dashboard (Priority: P2)

**Goal**: Present the public recovery landing page, authenticate the one creator with Telegram, and show the same live case and timeline through read-only protected views.

**Independent Test**: Authenticate as the configured creator and load overview/detail; authenticate with another valid Telegram identity and observe zero protected fields; refresh, logout, and revisit protected routes; exercise cancelled, expired, and service-unavailable states without sample data.

### Tests for User Story 2 — write and observe failure first

- [x] T041 [P] [US2] Write failing Telegram HMAC, payload-freshness, timing-safe comparison, and exact-ID authorization tests in `tests/unit/telegram-auth.test.ts` (FR-002–FR-003)
- [x] T042 [P] [US2] Write failing session lifecycle tests for hashed tokens, cookie flags, expiry, revocation, and stale creator configuration in `tests/integration/session-service.test.ts` (FR-002–FR-004)
- [x] T043 [P] [US2] Write failing Fastify contract tests for every endpoint/status/body in `specs/001-community-recovery/contracts/openapi.yaml` in `tests/contract/dashboard-api.test.ts` (FR-003, FR-021–FR-025)
- [x] T044 [P] [US2] Write failing data-leak tests proving unauthorized/error responses contain no community, member, evidence, case, prompt, or secret fields in `tests/integration/authorization.test.ts` (FR-003, FR-029, SC-002)
- [x] T045 [P] [US2] Write failing Playwright journeys for landing, Telegram callback states, overview, detail, reload, denial, logout, and visible Demo Mode disclosure on every compressed-time surface at mobile/desktop widths in `tests/e2e/creator-dashboard.spec.ts` (FR-001–FR-004, FR-021–FR-022, FR-026, SC-001, SC-015)

### Implementation for User Story 2

- [x] T046 [P] [US2] Implement Telegram payload normalization, HMAC verification, freshness enforcement, and authorization result types in `src/server/auth/telegram-auth.ts` until T041 passes
- [x] T047 [P] [US2] Implement opaque session creation/lookup/revocation and secure cookie policy in `src/server/auth/session-service.ts` until T042 passes
- [x] T048 [US2] Implement public auth config, Telegram auth, session, and logout routes in `src/server/api/auth-routes.ts`
- [x] T049 [US2] Implement evidence-limited overview/detail projections and protected read-only routes in `src/server/api/recovery-routes.ts` until T043 and T044 pass
- [x] T050 [P] [US2] Replace the old multi-tab health markup with semantic landing/dashboard route shells and Telegram widget mount point in `src/dashboard/index.html`
- [x] T051 [P] [US2] Implement a typed fetch client that distinguishes unauthenticated, unauthorized, retryable, and unavailable states in `src/dashboard/api.ts`
- [x] T052 [P] [US2] Implement the approved public promise, three steps, compact case example, privacy boundary, Telegram action, and demo action in `src/dashboard/views/landing.ts`
- [x] T053 [P] [US2] Implement creator identity, observation status, timing disclosure, counts, awaiting-action cases, outcomes, and chronological case list in `src/dashboard/views/overview.ts`
- [x] T054 [P] [US2] Implement the read-only evidence/provenance/state timeline in `src/dashboard/views/case-detail.ts`
- [x] T055 [US2] Replace mock-data startup with session-aware client routing, auth callback, retry, detail navigation, and logout in `src/dashboard/app.ts`
- [x] T056 [US2] Rebuild responsive visual states, persistent Demo Mode disclosure, visible focus, 44px targets, reduced motion, contrast, and live-region behavior in `src/dashboard/styles.css` until T045 passes (NFR-001, SC-015, SC-017)

**Checkpoint**: User Story 2 proves the same live case as Telegram and exposes no mock or protected data before authorization.

---

## Phase 5: User Story 3 — Understand Failures and Uncertainty (Priority: P3)

**Goal**: Make uncertainty, invalid inputs, integration delays, and operational failures visible without inventing evidence or advancing state.

**Independent Test**: Inject isolated negativity, unknown evidence refs, duplicate messages, an invalid command, a Minds timeout/late reply, a database failure, and ambiguous Telegram delivery. Each outcome is explicit and recoverable, while case state and evidence integrity remain correct.

### Tests for User Story 3 — write and observe failure first

- [x] T057 [P] [US3] Write a failing fault-matrix integration suite covering observation, reasoning, persistence, delivery, and retrieval failure boundaries in `tests/integration/failure-matrix.test.ts` (FR-025, SC-010)
- [x] T058 [P] [US3] Write failing provenance projection tests that reject unlabeled or unresolved evidence and distinguish all actor/source classes in `tests/unit/provenance.test.ts` (FR-020, FR-023, SC-013)
- [x] T059 [P] [US3] Write failing UI-state tests for loading, cancelled auth, access denied, retryable failure, delayed observation, empty live data, and no sample fallback in `tests/unit/dashboard-states.test.ts` (FR-003, FR-025)

### Implementation for User Story 3

- [x] T060 [P] [US3] Implement provenance-safe case-event and read-model construction in `src/domain/provenance.ts` until T058 passes
- [x] T061 [US3] Add explicit stage-specific failure recording, retry policy, late-result reconciliation, and no-advance guards to `src/server/services/observation-pipeline.ts`, `src/server/services/reasoning-service.ts`, and `src/server/services/notification-service.ts` until T057 passes
- [x] T062 [US3] Add invalid/ambiguous command event recording and state-specific recovery help to `src/server/services/command-service.ts` (FR-024)
- [x] T063 [US3] Add delayed/error observation status and sanitized diagnostic projection to `src/server/api/recovery-routes.ts`
- [x] T064 [US3] Implement accessible loading, empty-live-data, cancelled, denied, expired, delayed, and retry UI states without sample substitution in `src/dashboard/app.ts` and `src/dashboard/styles.css` until T059 passes
- [x] T065 [US3] Add redaction assertions and correlation IDs across integration boundaries in `src/server/logger.ts`

**Checkpoint**: All three stories work independently, and the error paths are as demonstrable as the happy path.

---

## Phase 6: Polish and Cross-Cutting Release Gates

**Purpose**: Prove performance, accessibility, live integrations, demo truthfulness, maintainability, and submission readiness.

- [ ] T066 [P] Add automated accessibility scans and keyboard/live-region assertions for all required view states in `tests/e2e/accessibility.spec.ts` (NFR-001, SC-017)
- [ ] T067 [P] Add the 10-request p95 dashboard check and ingestion-to-notification timestamp assertions in `tests/integration/performance.test.ts` (NFR-002, SC-018)
- [x] T068 [P] Create deterministic canonical staged messages and a disclosed no-network rehearsal in `tests/fixtures/canonical-scenario.ts`, `scripts/seed-demo.ts`, and `scripts/rehearse-demo.ts`
- [ ] T069 Create the fail-closed live Minds/Telegram acceptance runner with restart/reconnect proof in `scripts/verify-live-demo.ts` (SC-003–SC-012, SC-019)
- [ ] T070 Replace stale generic setup/product claims with exact architecture, privacy, configuration, test, and live-demo instructions in `README.md` and `docs/demo-runbook.md`
- [ ] T071 Replace or re-record the demo asset with a 105–115 second truthful live walkthrough, wire Watch Demo to it, and record a blind first-time-reviewer comprehension check that distinguishes recovery from sentiment analytics in `video/vibecheck-demo.mp4`, `src/dashboard/views/landing.ts`, and `docs/demo-comprehension.md` (FR-026, SC-012, SC-014–SC-015)
- [ ] T072 Run the repository's simplify workflow, then remove duplicated logic, split functions over 30 lines where warranted, replace every TypeScript `any`, group over-wide component props, and audit async error handling across `src/` and `tests/`
- [ ] T073 Run lint, all test layers, production build, secret scan, dependency audit, and the full `specs/001-community-recovery/quickstart.md` rehearsal; record non-secret evidence in `docs/verification.md`
- [ ] T074 Run `speckit.converge` against `specs/001-community-recovery/spec.md`, reconcile discovered drift in the approved artifacts, and record the convergence result in `docs/verification.md`
- [ ] T075 Create `done-when.md` from SC-001–SC-020 and run `/Users/mac/Vibecoding/loop/guardrails/claude-check.sh done-when.md --dir /Users/mac/Vibecoding/VibeCheck` with non-degraded access; retain the passing report path in `docs/verification.md`

---

## Dependencies and Execution Order

### Phase dependencies

- Phase 1 has no dependencies.
- Phase 2 depends on Phase 1 and blocks all stories.
- User Story 1 depends on Phase 2 and is the functional MVP.
- User Story 2 depends on the Phase 2 read repositories but can be built against canonical database fixtures while User Story 1 integrations are unfinished.
- User Story 3 depends on the core services from User Story 1 and UI/API surfaces from User Story 2.
- Phase 6 depends on all selected stories; T069 also requires configured live Minds and Telegram access.

### Within each story

- Tests are authored and observed failing before their implementation task.
- Pure domain rules precede repositories/services that use them.
- Persistence commits precede external notifications.
- Integrations precede process wiring.
- Story checkpoints must pass before proceeding to cross-cutting polish.

### Parallel opportunities

- Setup T002–T005 can proceed after T001's dependency choices are known.
- Foundation tests T006–T008 and types T009 target distinct files.
- US1 pure-rule tests T017–T020, integration test scaffolds T021–T025, prompts T031–T032, and adapters T029–T030 are independent after Phase 2.
- US2 auth tests T041–T042, API/privacy tests T043–T044, E2E test T045, and the three view modules T052–T054 target distinct files.
- US3 tests T057–T059 target distinct layers.
- Cross-cutting tests T066–T068 are independent before the live gate.

## Parallel Example: User Story 1

```text
T017 case-state tests       | T018 timing tests          | T019 conflict-gate tests
T020 recovery-gate tests    | T021 reasoning tests       | T025 Telegram delivery tests
T029 Minds adapter          | T030 Telegram adapter      | T031/T032 Mind contract copy
```

The shared services T033–T039 are then completed in dependency order.

## Parallel Example: User Story 2

```text
T041 Telegram auth tests    | T042 session tests         | T043 API contract tests
T044 privacy tests          | T045 browser journeys
T052 landing view           | T053 overview view         | T054 case-detail view
```

T055 integrates the views after the typed API client T051 is available.

## Implementation Strategy

### MVP first

1. Complete Setup and Foundation.
2. Complete User Story 1 using test-first slices.
3. Stop and run its independent Telegram recovery journey.
4. Add User Story 2 to prove the same live case visually.
5. Add User Story 3 failure/uncertainty hardening.

### Release discipline

- Never substitute a fixture for a live integration while claiming the live gate passed.
- Keep all rehearsals visibly labeled and separate from `verify:live-demo`.
- Do not mark a task complete from code inspection alone; run its named check.
- Do not begin the final demo recording until T069 has passed.
