# VibeCheck browser state design

The browser is a read-only proof surface for the same recovery case used in Telegram. It never mutates a case and never substitutes sample data for protected live data.

## Session states

| State | Entry | Visible result | Exit |
|---|---|---|---|
| Public | No session cookie | Landing promise, process, privacy boundary, Telegram action, demo action | Start Telegram auth or demo |
| Authenticating | Telegram callback pending | Progress announcement; no protected fields | Authorized, denied, cancelled, or retryable error |
| Authorized | Verified identity equals configured creator | Recovery overview | Detail, logout, reload |
| Denied | Valid Telegram identity is not configured creator | Access-denied explanation with zero community/case data | Return to landing |
| Cancelled | Telegram flow closes without payload | Explicit cancelled state | Retry or return |
| Expired | Session lookup fails | Authentication-required state; no cached protected data | Reauthenticate |
| Unavailable | API/local dependency returns retryable failure | Sanitized retry state; no mock fallback | Retry |

## Recovery data states

| State | Presentation |
|---|---|
| Learning | Connected community plus evidence-gathering language |
| Empty live data | No cases yet; explain what evidence is still being learned |
| Needs Review | Awaiting creator action; observed change, remembered context, inference, and uncertainty |
| Monitoring | Creator acted personally; later evidence is being observed |
| Recovery Detected | Both evidence gates shown; creator confirmation remains required in Telegram |
| Resolved / Unresolved / Dismissed | Read-only outcome and complete chronological provenance timeline |
| Delayed / Error | Explicit observation status and sanitized retry guidance |

## Navigation and privacy

- Public landing, recovery overview, and case detail are distinct routes/states.
- Overview selects a case; detail returns to overview. Logout clears protected state.
- Demo Mode is persistently disclosed on every compressed-time protected surface.
- Public, denial, loading, cancelled, and error states contain no protected community name, people, excerpts, case IDs, raw transcript, prompt, or secret.
- Evidence labels are limited to community message, remembered context, Mind inference, creator decision, and external operation.

## Responsive behavior

- Mobile: one column, 44px targets, timeline content stacked under its provenance label.
- Desktop: overview may use a summary rail and case list; detail may use a sticky case summary beside the timeline.
- Motion only clarifies first reveal and state navigation; reduced motion removes it.
