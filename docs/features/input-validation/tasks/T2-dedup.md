---
id: T2
title: "Domain: dedup — reuse existing code for an already-stored normalized url"
layer: "domain"
deps: ["T1"]
acs: ["AC-07"]
files_hint: ["src/shorten.js"]
owner: "TBD"
estimate: "S"
status: "todo"
---

# T2 — Dedup

## Why
The same URL shortened twice should not create two rows ([spec.md](../spec.md) §5 AC-07, [sad.md](../sad.md) §10 QG-3). Reuse the existing code instead. Runs on the normalized URL from T1 so padded and unpadded forms collapse together.

## What
In `createLink` (`src/shorten.js`), after validation, look up the normalized URL; if a link already exists, return its code and insert nothing; otherwise create as today. Keep the lookup simple (a scan/query by url — no index needed at toy scale, [sad.md](../sad.md) §11).

## Definition of Done
- [ ] shortening an already-stored (normalized) URL returns the existing code
- [ ] no second row is created for a duplicate
- [ ] a genuinely new URL still creates a fresh code

## Notes
Dedup keys on the trimmed URL, so `" https://x "` and `"https://x"` are the same link. Consumed by the route (T3), which returns 200 for a dedup hit vs 201 for a new create.
