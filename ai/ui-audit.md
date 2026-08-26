# VibeCheck Production UI Audit

Date: 2026-08-18
Scope: `src/dashboard/`
Selected direction: hybrid — Patchwork Atlas landing, Threadline authenticated shell, Mending Table working pages

## Executive summary

The existing dashboard needs replacement rather than cosmetic polish. Its visual implementation is internally tidy, but its information architecture and runtime behavior belong to the superseded community-analytics product. It loads bundled member data before authentication, exposes excluded health/archetype/briefing concepts, and does not implement the required public, authorization, overview, or case-detail journey.

| Category | Critical | Major | Minor |
| --- | ---: | ---: | ---: |
| Product and privacy | 3 | 1 | 0 |
| Interaction | 1 | 2 | 0 |
| Visual and responsive | 0 | 3 | 1 |
| Accessibility | 0 | 2 | 1 |
| **Total** | **4** | **8** | **2** |

Overall assessment: needs major work.

## Top issues by priority

1. `src/dashboard/app.ts` imports and renders `MOCK_DATA` immediately, before any session or authorization check. Protected-looking member information is therefore public and disconnected from the evidence-limited API.
2. The primary view is a generic health score with archetypes, alerts, norms, and weekly briefing content explicitly excluded by `design.md` and FR-027.
3. No public landing page, Telegram authentication mount/callback, access-denied view, session resume, logout, recovery overview, or case-detail route exists.
4. No frontend client consumes `/api/auth/session`, `/api/recovery-overview`, or `/api/recovery-cases/:caseId`; the browser cannot prove the same live case as Telegram.
5. Inline `onclick="connectCommunity()"` and `onclick="loadData()"` handlers reference module-local functions, leaving empty/error recovery controls dead in the browser.
6. The 480px centered mobile shell leaves most desktop space unused and cannot express the selected Threadline navigation or Mending Table workbench layout.
7. Production security headers allow only same-origin assets, while `index.html` requests Google Fonts; those font requests are blocked when served by Fastify.
8. State transitions animate every tab change, including keyboard activation, and are applied through repeated inline style mutation instead of a focused navigation/state model.
9. The stylesheet uses fourteen font sizes, weakening hierarchy and exceeding the four-size production rule.
10. The selected Neighborhood Patch mark, mandatory palette, and structural shared-field/seam motif are absent.

## Heuristic scores

| Heuristic | Severity (0–4) | Notes |
| --- | ---: | --- |
| System status | 3 | Simulated loading only; no real session or recovery request state |
| Real-world match | 4 | Describes analytics rather than creator-led recovery |
| User control | 3 | No routing, back path, session resume, or logout |
| Consistency | 3 | Does not implement the selected brand or hybrid system |
| Error prevention | 2 | Dead recovery controls and no typed request distinctions |
| Recognition | 3 | Navigation exposes obsolete product categories |
| Flexibility | 2 | Mobile-only shell; no frequent-use desktop workflow |
| Minimalism | 3 | Unsupported metrics compete with the actual recovery job |
| Error recovery | 4 | Retry UI cannot reliably invoke its module-local handler |
| Help and explanation | 1 | Some plain-language state copy exists, but for the wrong product |

Average severity: 2.8 / 4.

## Visual inventory

- Border treatment: three radius tokens plus circles/pills. The hybrid will use one small radius and one structural patch radius; circles remain limited to status marks.
- Typography: fourteen sizes (`11px` through `48px`). Consolidate to four semantic tiers plus a fluid Atlas display size.
- Spacing: existing 4px scale is usable and should be retained as implementation discipline.
- Icons: outlined SVGs are consistent, but their categories are obsolete.
- Motion: no linear easing or `scale(0)` was found; reduced-motion support exists and should be retained.
- Automated UI-revamp scan: one hover-media warning; manual inspection shows the detected empty-state hover is already guarded, so it is a scanner false positive.

## Approved-hybrid implementation plan

1. Write failing Playwright journeys first for the public landing, authentication/cancel/error states, authorized overview, case detail, denial redaction, refresh, logout, and mobile/desktop behavior.
2. Add a typed browser API client that distinguishes unauthenticated, unauthorized, retryable, and unavailable responses without sample fallback.
3. Replace `index.html` with a semantic app shell, skip link, live region, exact selected mark, and Telegram widget mount point.
4. Build the Patchwork Atlas landing as its own view: approved headline, three recovery steps, compact case example, privacy boundary, Telegram action, and demo action.
5. Build the authenticated Threadline shell: Welcome/Cases/Thread structure, persistent demo disclosure, creator identity, observation state, logout, and responsive recovery progression.
6. Build Recovery Overview and Case Detail as Mending Table workbenches using only API projections. Keep provenance classes distinct and all case-changing actions in Telegram.
7. Replace the stylesheet with the selected palette, joined-field/seam tokens, responsive 390–1440px layouts, visible focus, 44px targets, reduced motion, and explicit loading/empty/error/denied states.
8. Remove the mock startup path and obsolete analytics surface, then run type checks, unit/contract/integration tests, Playwright journeys, axe checks, build, automated UI audit, visual review, simplify, and the independent done-criteria checker.

## Approval gate

Production implementation starts only after explicit approval of this plan.

## Remediation outcome

The approved replacement is implemented. The mock startup path and generic analytics surface were removed; authenticated reads now come from the typed API client. The final automated UI audit reports zero violations, and the responsive landing, overview, detail, denial, retry, session, logout, and accessibility journeys pass at desktop and mobile widths.
