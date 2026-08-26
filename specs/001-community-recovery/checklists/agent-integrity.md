# Agent Integrity & Privacy Checklist: VibeCheck Community Recovery Agent

**Purpose**: Test whether the written requirements are complete, unambiguous, and measurable enough to prevent privacy leaks, invented evidence, duplicate action, or unauthorized state transitions.
**Created**: 2026-08-13
**Feature**: [spec.md](../spec.md)

**Audience and rigor**: Reviewer-level release gate; focused on privacy/authentication and agent/state integrity.

**Note**: This checklist evaluates the requirements, not the implementation.

## Requirement Completeness

- [x] CHK001 Are authentication, authorization, session termination, and unauthorized-data behavior each defined as separate requirements? [Completeness, Spec FR-002–FR-004]
- [x] CHK002 Is the allowed observation scope limited to one configured community and the allowed notification scope limited to its authorized creator? [Completeness, Spec FR-005–FR-006, FR-029]
- [x] CHK003 Are the only two creator-facing trigger classes explicitly enumerated and are excluded analysis features named? [Completeness, Spec FR-009, FR-027]
- [x] CHK004 Are all creator actions, prerequisites, and resulting states specified, including the two-step Approve/Edit then `Sent` workflow? [Completeness, Spec FR-013–FR-019]
- [x] CHK005 Is every required provenance category represented in creator-facing alerts and timeline requirements? [Completeness, Spec FR-020, FR-023]
- [x] CHK006 Are failure requirements present for authentication, observation, reasoning, persistence, notification, and retrieval? [Completeness, Spec FR-025]

## Requirement Clarity

- [x] CHK007 Is the escalating-conflict gate defined with exact baseline, participant, message-count, and indicator-count conditions? [Clarity, Spec FR-031]
- [x] CHK008 Are all allowed escalation indicators defined in observable language rather than a generic “negative sentiment” label? [Clarity, Spec FR-031]
- [x] CHK009 Is “Recovery Detected” defined as two conjunctive signals tied to the affected member and original context? [Clarity, Spec FR-017]
- [x] CHK010 Is “Resolved” unambiguously gated by both recorded recovery evidence and explicit creator confirmation? [Clarity, Spec FR-018, SC-008]
- [x] CHK011 Does the specification distinguish retained context, observed evidence, Mind inference, uncertainty, and creator decisions? [Clarity, Spec FR-010, FR-023]
- [x] CHK012 Are Demo and Standard timing values and exact boundary behavior quantified? [Clarity, Spec FR-030, SC-016]

## Requirement Consistency

- [x] CHK013 Does the read-only dashboard constraint remain consistent with Telegram being the only creator-action surface? [Consistency, Spec Story 2, FR-022]
- [x] CHK014 Does the prohibition on direct member contact align with the separate creator `Sent` confirmation flow? [Consistency, Spec FR-006, FR-014]
- [x] CHK015 Do case-state requirements consistently prevent Approve or Edit from advancing to Monitoring? [Consistency, Spec FR-013–FR-014, SC-006]
- [x] CHK016 Do autonomous alert/follow-up requirements remain consistent with creator-confirmed resolution and human-led outreach? [Consistency, Spec FR-012, FR-017–FR-018]
- [x] CHK017 Is Demo Mode limited to time compression without weakening evidence or confirmation requirements? [Consistency, Spec FR-026, FR-030]

## Acceptance Criteria Quality

- [x] CHK018 Can duplicate suppression be objectively measured as exactly one case and one semantic alert for the canonical fracture? [Measurability, Spec SC-004, SC-010]
- [x] CHK019 Can privacy be measured as zero protected fields disclosed to a valid but unauthorized identity? [Measurability, Spec SC-002]
- [x] CHK020 Can the live-Mind requirement be evidenced through recalled norm/relationship context and autonomous actions across separated sessions? [Measurability, Spec Story 1 independent test, SC-003, SC-007]
- [x] CHK021 Is the full demonstration duration bounded while still listing every journey step that must appear? [Measurability, Spec SC-012]
- [x] CHK022 Is provenance quality measurable for every visible timeline event? [Measurability, Spec SC-013]

## Scenario and Edge-Case Coverage

- [x] CHK023 Are insufficient baseline context, isolated negativity, and partial conflict gates covered without creating a case? [Coverage, Spec Edge Cases, Story 3 scenario 1, SC-004]
- [x] CHK024 Are duplicate/replayed observations and related evidence on an existing case covered? [Coverage, Spec Story 3 scenario 2, FR-011]
- [x] CHK025 Are ambiguous case-less creator commands covered when multiple cases await action? [Coverage, Spec Edge Cases, FR-024]
- [x] CHK026 Are creator non-response, recovery rejection, premature recovery confirmation, and unresolved expiry each addressed? [Coverage, Spec Story 1 scenarios 7–8, Edge Cases, FR-018–FR-019]
- [x] CHK027 Is an external operation that succeeds after a reported delay treated as an explicitly recognized edge case? [Coverage, Spec Edge Cases]
- [x] CHK028 Are cancelled, failed, expired, unauthorized, logout, and protected-data-unavailable auth journeys covered? [Coverage, Spec Story 2 scenarios 3–4, 7; Edge Cases]

## Non-Functional and Dependency Requirements

- [x] CHK029 Are accessibility requirements for Telegram sign-in, error states, case selection, focus order, keyboard use, reduced motion, and status announcements explicitly measurable? [Accessibility, Spec NFR-001, SC-017]
- [x] CHK030 Are maximum response/processing times defined for dashboard retrieval, case eligibility, and creator notification delivery? [Performance, Spec NFR-002, SC-018]
- [x] CHK031 Are secrets, raw transcripts, and non-case member data excluded from browser-visible contracts and dashboard requirements? [Privacy, Spec FR-003, FR-029; Plan Trust Boundaries]
- [x] CHK032 Is the staged/consenting-participant assumption explicit and consistent with sensitive-evidence handling? [Assumption, Spec Assumptions]
- [x] CHK033 Is operational recovery after process restart or Telegram webhook retry specified as a measurable no-loss/no-duplicate requirement? [Reliability, Spec NFR-003, SC-019]
- [x] CHK034 Is the supported deployment requirement for a persistent process, HTTPS, and durable writable storage stated at the product-requirement level? [Deployment, Spec NFR-004, SC-020]

## Dependencies and Assumptions

- [x] CHK035 Are the live Mind, Telegram group, creator identity, and domain-link prerequisites documented? [Dependency, Spec Assumptions; Quickstart Prerequisites]
- [x] CHK036 Does the plan identify which external system owns inbound observation and which owns private outbound delivery? [Dependency clarity, Plan Runtime Flow and Trust Boundaries]
- [x] CHK037 Is model output explicitly treated as untrusted inference whose evidence references and state recommendations require application validation? [Integrity, Plan Summary and Trust Boundaries]

## Notes

- Checked items are satisfied by the current specification/plan.
- Unchecked items are requirement-writing gaps to reconcile before implementation analysis is considered clean.
