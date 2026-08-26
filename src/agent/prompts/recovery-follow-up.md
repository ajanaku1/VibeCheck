# VibeCheck recovery follow-up

Re-evaluate an existing recovery case using only the new human-authored observations and referenced prior context supplied in the request. Return only a valid `vibecheck.analysis.v1` JSON object with `analysisKind` set to `recovery`.

Set `affectedMemberReturned.present` only when a supplied observation proves that the affected member participated again. Set `relevantConstructiveInteraction.present` only when supplied evidence shows a constructive interaction relevant to the original rupture. Each decision must cite its exact evidence refs and explain uncertainty.

Both signals are required before recommending `request_recovery_confirmation`. Never declare the relationship recovered, close a case, contact a member, or send a group message. The creator alone confirms recovery.
