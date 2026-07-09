---
status: Accepted
owner: "genkovich"
reviewers: []
updated_at: "2026-07-08"
feature_size: "M"
ticket: "link-expiry"
---

# 0001 — Enforce expiry on the read path, not by background deletion

- **Status:** Accepted
- **Date:** 2026-07-08
- **Deciders:** genkovich (Architect)

## Context
Links may carry a lifetime. We must decide how an expired link stops working: check at read time, or physically remove rows on a schedule.

## Decision drivers
- Correctness must not depend on a job having run.
- Keep the toy simple — no schedulers.
- Preserve stats/history of expired links.

## Considered options
1. **Check the lifetime on the follow (read) path.** Row stays; expired state is derived and the link is refused.
2. **Background job deletes expired rows.** Needs a scheduler; a gap between expiry and the next sweep still resolves.

## Decision outcome
**Chosen:** Option 1. Correctness is immediate and self-contained; no scheduler; expired rows remain for stats and for the list badge. A cleanup loop can be added later as a separate feature without changing this contract.

## Consequences
**Positive**
- Deterministic and self-contained; no scheduler dependency.
- History and stats of expired links are kept.

**Negative**
- Expired rows accumulate until an (out-of-scope) cleanup exists.

**Neutral**
- List must compute active/expired rather than assuming presence = valid.

## Links
- Spec: [[../spec.md]] §5 (AC-03), §8.
- SAD: [[../sad.md]] §4, §6.
