---
id: T2
title: "Domain: resolve default TTL + compute expired state"
layer: "domain"
deps: ["T1"]
acs: ["AC-01", "AC-03", "AC-04"]
files_hint: ["src/shorten.js"]
owner: "TBD"
estimate: "M"
status: "blocked"
---

# T2 — Default TTL + expiry state

## Why
Resolve a link's lifetime at creation (chosen or default) and decide whether a link is expired at a given moment ([sad.md](../sad.md) §4, [spec.md](../spec.md) AC-04). Backs AC-01/03/04.

## What
In `src/shorten.js`, extend `createLink` to record the expiry moment from a given lifetime or the resolved default, and add an `isExpired(link, now)` predicate that is correct at the boundary. Every link ends with a well-defined expiry state.

## Definition of Done
- [ ] createLink records an expiry moment from a given lifetime or the default
- [ ] isExpired is correct exactly at the boundary moment
- [ ] a link created without a lifetime still has a defined expiry state
- [ ] no HTTP concerns in this file

## Notes
**Blocked on open question §8** — the default lifetime is undecided; the agent must ask the human before implementing ([spec.md](../spec.md) §8, autonomy-boundary demo). Depends on the migrated column (T1).
