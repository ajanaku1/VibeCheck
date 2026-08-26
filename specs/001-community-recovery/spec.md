# Feature Specification: VibeCheck Community Recovery Agent

**Feature Branch**: `001-community-recovery`

**Created**: 2026-08-13

**Status**: Approved

**Input**: User description: "Transform VibeCheck into a Telegram-first Community Recovery Agent. A live Mind silently observes one staged creator community, remembers norms and relationships across sessions, opens one persistent case for escalating conflict or post-conflict silence, privately guides the creator through a human-led intervention, autonomously follows up when recovery evidence appears, and records only creator-confirmed resolution. Provide a public landing page, Telegram sign-in for one pre-authorized creator, and a read-only dashboard showing the same live case timeline."

## Clarifications

### Session 2026-08-13

- Q: How should VibeCheck compress multi-day observation and follow-up timing during the staged demo? → A: Use a clearly visible Demo Mode with shortened windows while retaining a separate documented Standard Mode with real-world timing.
- Q: What minimum evidence should move a Monitoring case to Recovery Detected? → A: The affected member must return and participate in at least one constructive interaction involving the original relationship or conflict context.
- Q: What minimum evidence should open an escalating-conflict Recovery Case? → A: Require established relationship or norm context, a multi-message exchange involving both members, and clear escalation that departs from that baseline.
- Q: Which time windows should the two timing profiles use? → A: Demo Mode uses a 90-second post-conflict silence threshold, 3-minute dismissal cooling period, and 10-minute unresolved window; Standard Mode uses 48 hours, 24 hours, and 7 days respectively.
- Q: How should the creator confirm that they personally sent the approved outreach? → A: Approve or Edit returns the final copy while the case remains Needs Review; a separate private `Sent` reply records the intervention and advances the case to Monitoring.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recover a Community Relationship (Priority: P1)

As the authorized creator, I want VibeCheck to remember how members normally relate, recognize a meaningful fracture across separate sessions, and privately guide me through a recovery case so I can intervene before a valuable community relationship disappears.

**Why this priority**: This is the product's defining value and the shortest complete proof that the Mind provides memory, continuity, and autonomous action rather than generic message classification.

**Independent Test**: Stage three separated community sessions. The first establishes a norm and constructive member relationship; the second contains an escalating conflict or post-conflict silence and results in exactly one unprompted private case alert; the creator approves or edits an outreach plan; the third contains recovery evidence and results in an unprompted confirmation request. The case becomes Resolved only after creator confirmation.

**Acceptance Scenarios**:

1. **Given** VibeCheck is learning from an authorized staged community, **when** members demonstrate a repeated constructive interaction and a community norm, **then** VibeCheck retains that context without posting in the community.
2. **Given** retained norm or relationship context from an earlier session, **when** a later exchange contains at least three messages with contributions from both involved members and at least two escalation indicators that depart from the retained baseline, **then** VibeCheck opens exactly one Recovery Case and privately alerts the creator without a new creator prompt.
3. **Given** a conflict involving a previously active member, **when** that member subsequently becomes silent during the configured observation window, **then** VibeCheck appends the silence evidence to the related case or opens one case if none exists, without sending a duplicate alert.
4. **Given** a case in Needs Review, **when** the creator replies Approve or supplies an edited outreach message, **then** the chosen intervention is retained, final copy is returned, and the case remains Needs Review until the creator separately replies `Sent`; only that reply records the intervention and advances the case to Monitoring.
5. **Given** a case in Needs Review, **when** the creator dismisses it, **then** the case becomes Dismissed and equivalent evidence cannot immediately reopen it during the cooling period.
6. **Given** a case in Monitoring, **when** the affected member returns and participates in at least one constructive interaction involving the original relationship or conflict context, **then** VibeCheck advances the case to Recovery Detected, autonomously summarizes what changed, and asks the creator to confirm the outcome.
7. **Given** a case in Recovery Detected, **when** the creator confirms recovery, **then** the case becomes Resolved and retains the confirmed outcome and intervention learning.
8. **Given** apparent recovery evidence, **when** the creator rejects recovery or does not confirm it, **then** the case does not become Resolved.

---

### User Story 2 - Access a Private Recovery Dashboard (Priority: P2)

As the pre-authorized creator, I want to sign in from a clear public product page and view my community's cases so I can inspect the same evidence and state history that VibeCheck used in Telegram.

**Why this priority**: Private access and evidence transparency make the recovery system understandable and credible, but the recovery loop still delivers its core value through Telegram without this visual surface.

**Independent Test**: Authenticate as the configured creator and open the Recovery Overview and one case timeline. Repeat with a different valid Telegram identity and verify that no community or case information is disclosed.

**Acceptance Scenarios**:

1. **Given** a public visitor, **when** they open VibeCheck, **then** they see the recovery promise, three-step explanation, privacy boundary, a case example, Continue with Telegram, and Watch the Demo.
2. **Given** the pre-authorized creator completes Telegram authentication, **when** authorization succeeds, **then** they enter their connected community's Recovery Overview.
3. **Given** a different valid Telegram identity completes authentication, **when** authorization is evaluated, **then** the user receives an access-denied state and no protected community or case data.
4. **Given** authentication fails, is cancelled, or expires, **when** the visitor attempts dashboard access, **then** they receive an explicit retry or reauthentication state rather than sample data.
5. **Given** the authorized creator opens Recovery Overview, **when** live case data is available, **then** they see creator identity, logout, observation status, case counts, cases awaiting action, recent outcomes, and a chronological case list.
6. **Given** the creator selects a case, **when** Recovery Case Detail opens, **then** it shows one ordered, read-only timeline whose events identify timestamp, source, actor classification, evidence, and resulting state.
7. **Given** the creator logs out, **when** they revisit a protected view, **then** protected case data remains inaccessible until they authenticate again.

---

### User Story 3 - Understand Failures and Uncertainty (Priority: P3)

As the creator, I want VibeCheck to distinguish evidence from inference and expose failures or insufficient context so I can trust that it is not inventing a crisis or silently changing a case.

**Why this priority**: Trustworthy uncertainty and failure behavior are essential for sensitive community decisions, although the primary recovery journey can first be demonstrated using known-good staged inputs.

**Independent Test**: Present isolated negativity, incomplete observations, an unsupported creator command, a repeated related message, and a failed external operation. Verify that none fabricates evidence, creates an unjustified case, contacts a member, or advances case state.

**Acceptance Scenarios**:

1. **Given** only isolated negative language or low-confidence evidence, **when** VibeCheck analyzes it, **then** the signal remains an internal observation and no creator alert is sent.
2. **Given** an open case receives related evidence, **when** the evidence is processed, **then** it is appended to that case and does not create a duplicate case or alert.
3. **Given** the creator sends a command that is invalid for the current case state, **when** VibeCheck interprets it, **then** it explains the allowed next actions without changing state.
4. **Given** observation, reasoning, notification, persistence, or dashboard retrieval fails, **when** the failure occurs, **then** the affected operation reports a recoverable delayed or error state and the case does not silently advance.
5. **Given** a recovery case contains remembered context and inference, **when** the creator views its alert or timeline, **then** observed evidence, remembered context, Mind inference, uncertainty, and creator decisions are distinguishable.

### Edge Cases

- A conflict arrives before VibeCheck has enough earlier context to distinguish a fracture from ordinary disagreement.
- Several rapid messages refer to the same disagreement while a case is being opened.
- A member becomes silent for reasons unrelated to the observed conflict.
- Recovery-like activity appears but involves a different member or topic.
- The creator edits an outreach draft but does not confirm that outreach was performed.
- The creator confirms recovery before the system has recorded recovery evidence.
- The creator rejects recovery after the member returns.
- A dismissed pattern reappears during and after its cooling period.
- The observation window expires without recovery evidence.
- A Telegram identity is valid but not the configured creator.
- Authentication succeeds while protected case data is unavailable.
- A private creator command names no case while multiple cases await action.
- An external operation succeeds after the user-facing request has already reported a delay.
- Staged demo timing is compressed enough that the apparent elapsed time could be mistaken for production timing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The product MUST present a public landing page with the approved recovery promise, three-step explanation, compact case example, privacy boundary, Telegram sign-in action, and demo action.
- **FR-002**: The product MUST authenticate visitors using Telegram identity and MUST authorize dashboard access separately against one pre-configured creator identity.
- **FR-003**: The product MUST deny protected community and case data to unauthenticated and unauthorized visitors and MUST never substitute sample data for protected live data.
- **FR-004**: The creator MUST be able to end their authenticated dashboard session, after which protected views require authentication again.
- **FR-005**: VibeCheck MUST receive observable messages from one configured staged Telegram community while remaining silent in that community.
- **FR-006**: VibeCheck MUST NOT send messages, labels, warnings, intervention drafts, or moderation actions to affected community members.
- **FR-007**: VibeCheck MUST retain evidence-backed community norms and member relationship context across separate observation sessions.
- **FR-008**: VibeCheck MUST treat isolated negativity and low-confidence signals as internal observations rather than creator-facing Recovery Cases.
- **FR-009**: VibeCheck MUST support exactly two creator-facing case triggers in the MVP: escalating interpersonal conflict and silence by a previously active member after related conflict.
- **FR-010**: A creator-facing case MUST include a unique case identity, current state, people involved, observed change, remembered context, minimal evidence, confidence, uncertainty, and suggested creator outreach.
- **FR-011**: Related evidence MUST update the existing case, and concurrent or repeated processing MUST NOT create duplicate cases or duplicate creator alerts.
- **FR-012**: VibeCheck MUST privately alert the creator when sufficient evidence opens a case, without requiring a contemporaneous creator prompt.
- **FR-013**: For a case in Needs Review, VibeCheck MUST accept creator actions to approve the draft, replace it with an edited draft, dismiss the case, or record a separately confirmed `Sent` action after final copy exists.
- **FR-014**: VibeCheck MUST preserve the creator's selected or edited intervention, return the final copy, and keep the case in Needs Review until the creator separately replies `Sent`; only that reply records that the creator performed outreach personally and advances the case to Monitoring.
- **FR-015**: Dismissal MUST place equivalent case evidence into a cooling period during which it cannot reopen the same fracture immediately.
- **FR-016**: A Monitoring case MUST accumulate later evidence while retaining its earlier evidence, creator decisions, and state history across sessions.
- **FR-017**: VibeCheck MUST advance a Monitoring case to Recovery Detected only after the affected member both returns and participates in at least one constructive interaction involving the original relationship or conflict context; it MUST then autonomously inform the creator what changed and request outcome confirmation.
- **FR-018**: A case MUST become Resolved only after recovery evidence exists and the creator explicitly confirms recovery.
- **FR-019**: A case MUST remain open when the creator rejects recovery and MUST become Unresolved when its observation window expires without confirmed recovery or when the creator confirms the fracture remains.
- **FR-020**: Every state change MUST add a chronological event identifying when it occurred, its source, its actor classification, its evidence or decision, and the resulting state.
- **FR-021**: Recovery Overview MUST show the authenticated creator, connected community, observation status, open/resolved/unresolved counts, cases awaiting creator action, recent outcomes, and chronological cases.
- **FR-022**: Recovery Case Detail MUST show the same live case used in Telegram as a read-only ordered timeline and MUST expose no dashboard control that mutates case state.
- **FR-023**: Creator-facing alerts and case views MUST distinguish observed evidence, remembered context, Mind inference, uncertainty, and creator decisions.
- **FR-024**: Unsupported creator commands MUST explain the actions allowed for the referenced case's current state without changing that state.
- **FR-025**: Failed or delayed authentication, observation, reasoning, persistence, notification, or retrieval MUST produce an explicit recoverable state and MUST NOT fabricate evidence or silently advance a case.
- **FR-026**: The staged nature and compressed timing of the demonstration MUST be disclosed while all displayed Mind actions, stored context, case transitions, and autonomous notifications remain genuine.
- **FR-027**: The MVP MUST exclude direct member contact, punitive moderation, generic health or sentiment scoring, member archetype scoring, knowledge-gap detection, weekly briefings, multiple communities, community switching, open registration, invitations, billing, team roles, and unsupported adoption or uptime claims.
- **FR-028**: The product MUST provide verification coverage for authentication and authorization, all permitted and forbidden state transitions, duplicate suppression, and external-operation failure handling.
- **FR-029**: Sensitive community evidence MUST be visible only to the authorized creator and MUST be limited to the minimum context needed to explain a recovery case.
- **FR-030**: Time-dependent case behavior MUST operate in one of two explicit profiles. Demo Mode MUST use a 90-second post-conflict silence threshold, a 3-minute dismissal cooling period, and a 10-minute unresolved-case window. Standard Mode MUST use a 48-hour post-conflict silence threshold, a 24-hour dismissal cooling period, and a 7-day unresolved-case window. Changing the profile MUST NOT bypass any evidence or creator-confirmation requirement.
- **FR-031**: Escalating interpersonal conflict MUST require retained norm or relationship context, an exchange of at least three messages with at least one contribution from each involved member, and at least two escalation indicators that depart from the retained baseline. Escalation indicators are direct personal criticism, contemptuous or dismissive phrasing, repeated hostile contradiction after an attempted de-escalation, or explicit intent to disengage from the relationship or community.

### Non-Functional Requirements

- **NFR-001**: The landing page, authentication/error states, overview, and case timeline MUST support keyboard-only navigation with a visible focus indicator; use semantic landmarks and programmatic names; announce asynchronous status changes; preserve at least 4.5:1 contrast for normal text; provide at least 44-by-44 CSS-pixel touch targets for primary controls; and suppress non-essential motion when the user prefers reduced motion.
- **NFR-002**: For the staged data volume, authenticated dashboard reads MUST complete within 500 milliseconds at the 95th percentile under a 10-request local concurrency check; newly eligible evidence MUST be durably recorded within 15 seconds of ingestion; and the first private creator-notification attempt MUST begin within 15 seconds after its triggering transition commits.
- **NFR-003**: After a process restart or Telegram webhook retry, VibeCheck MUST resume from persisted observation work and deadlines so that every eligible observation is eventually processed without duplicating a case, state event, or semantic creator notification.
- **NFR-004**: The submission deployment MUST use HTTPS, one continuously running Node.js process, and writable durable storage for the SQLite database. Startup MUST fail closed with an actionable configuration error when production HTTPS origin, persistence path, identity allowlist, or required Minds/Telegram credentials are absent.

### Key Entities

- **Creator Identity**: The authenticated Telegram identity of the single authorized steward, including authorization status and active session state.
- **Community**: The one configured staged Telegram group, its observation status, and its association with the authorized creator.
- **Member Reference**: A stable reference to a staged community participant used to associate observations without exposing unnecessary profile information.
- **Community Context**: Evidence-backed norms and relationship observations retained across sessions, including confidence and source references.
- **Observation**: A timestamped piece of community evidence or an internal low-confidence signal, linked to involved member references and an originating session.
- **Recovery Case**: The durable record for one community fracture, including trigger, people involved, state, evidence, remembered context, confidence, uncertainty, suggested and selected intervention, follow-up window, and confirmed outcome.
- **Case Event**: An immutable chronological entry recording observed evidence, Mind inference or action, creator decision, external-operation status, and any resulting case state.
- **Intervention Plan**: The outreach text approved or edited by the creator, the finalized copy returned to them, and the separate `Sent` confirmation that records they performed outreach personally.
- **Recovery Evidence**: Later observed behavior showing both the affected member's return and at least one constructive interaction involving the original relationship or conflict context. It can justify requesting creator confirmation but cannot resolve the case alone.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An authorized creator can move from the public landing page through Telegram sign-in to Recovery Overview in no more than 60 seconds during the staged walkthrough.
- **SC-002**: All attempts by an authenticated but unauthorized Telegram identity expose zero protected community names, member references, evidence, or case records.
- **SC-003**: In the canonical three-session scenario, VibeCheck accurately recalls at least one earlier norm and one earlier member-relationship observation when opening the later case.
- **SC-004**: The canonical exchange produces exactly one Recovery Case and one initial creator alert only after it satisfies FR-031; removing the retained baseline, either member's participation, or one of the two required escalation indicators produces no case.
- **SC-005**: One hundred percent of case alerts in the canonical scenario contain observed change, remembered context, minimal evidence, confidence, uncertainty, and a suggested creator action.
- **SC-006**: Approve and Edit leave the case in Needs Review, `Sent` alone advances a finalized intervention to Monitoring, and Dismiss, recovery rejection, and recovery confirmation each produce only their documented state outcome in all acceptance scenarios.
- **SC-007**: In the canonical recovery scenario, the affected member's return plus one relevant constructive interaction triggers a creator follow-up without any new creator prompt; either signal alone triggers no confirmation request.
- **SC-008**: Zero cases reach Resolved without both recorded recovery evidence and explicit creator confirmation.
- **SC-009**: The same canonical case identity and complete event sequence are visible in both the creator's Telegram workflow and the authenticated dashboard timeline.
- **SC-010**: Isolated negative language, repeated evidence, invalid commands, and simulated external failures produce zero fabricated observations, duplicate cases, duplicate alerts, or silent state advances.
- **SC-011**: VibeCheck sends zero messages to affected community members throughout all staged acceptance scenarios.
- **SC-012**: The complete working-product demonstration, including authentication, three separated sessions, autonomous alert, creator intervention, autonomous follow-up, confirmation, and dashboard proof, lasts between 90 and 120 seconds, with a target of 105–115 seconds.
- **SC-013**: Every visible case event identifies its timestamp, evidence source, actor classification, and resulting state without requiring the creator to infer provenance.
- **SC-014**: A first-time reviewer can correctly describe the difference between VibeCheck and a generic sentiment dashboard after watching the walkthrough once: VibeCheck follows a fracture through intervention to creator-confirmed recovery.
- **SC-015**: Every demo surface that depends on compressed timing visibly identifies Demo Mode, and the same canonical scenario follows the same state order and evidence gates in both timing profiles.
- **SC-016**: Each timing profile applies its documented silence, cooling, and unresolved thresholds exactly at the boundary: no transition occurs one instant before its threshold, and the documented transition becomes eligible at the threshold.
- **SC-017**: Automated accessibility checks report zero serious or critical violations on the landing, auth failure, overview, and case-detail states at 360-pixel and 1440-pixel viewport widths, and each journey can be completed using only the keyboard with visible focus and announced asynchronous state changes.
- **SC-018**: With the canonical staged data set, dashboard reads meet the 500-millisecond p95 target at 10-request local concurrency, and timestamps show both eligible-evidence persistence and the first notification attempt occurring within their respective 15-second limits.
- **SC-019**: Replaying canonical Telegram webhook updates before and after a forced process restart produces the same observation count, one case identity, one event per semantic transition, and one semantic notification per triggering event as an uninterrupted run.
- **SC-020**: The production configuration gate rejects a non-HTTPS public origin, an ephemeral or unwritable database path, a missing creator allowlist, and missing required Minds or Telegram credentials before any observation consumer starts.

## Assumptions

- The competition entry remains in the Moderation & Community Assistance track and must be submitted by August 28, 2026, 23:59 HKT.
- The demo community and its messages are staged and use consenting participants or clearly fictional identities.
- Telegram identity authentication is available to the public landing page, and the authorized creator's Telegram identifier is configured before the walkthrough.
- The app-owned Telegram bot can read the configured group through its authenticated webhook; the live VibeCheck Mind is reachable through the stable engine alias; creator delivery is private.
- The creator performs member outreach outside VibeCheck and explicitly confirms that action in their private chat.
- Demo Mode shortens time windows for a reproducible walkthrough; Standard Mode retains real-world timing. Both preserve the same ordered states, evidence requirements, and creator-confirmation gate.
- The MVP is optimized for a reliable single-community demonstration, not production-scale throughput or multi-tenant onboarding.
- Existing landing/dashboard visual assets may be reused only where they do not imply mock data or excluded features.
- Community evidence is sensitive and remains private to the authorized creator.
- The project's generated Spec Kit constitution is still an unratified template; it introduces no normative constraints until explicitly completed and approved.
