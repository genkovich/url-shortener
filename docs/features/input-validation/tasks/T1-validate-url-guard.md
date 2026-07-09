---
id: T1
title: "Domain: validateUrl guard (trim, non-empty, scheme allowlist, host, length)"
layer: "domain"
deps: []
acs: ["AC-02", "AC-03", "AC-04", "AC-05", "AC-06"]
files_hint: ["src/shorten.js"]
owner: "TBD"
estimate: "S"
status: "todo"
---

# T1 — validateUrl guard

## Why
The create path stores whatever it is given ([[../spec.md]] §1). Add a pure domain guard that rejects bad input and normalizes good input, so routes stay thin and the rule is unit-testable ([[../sad.md]] §4, [[../adr/0001-reject-at-edge-allowlist-schemes.md]]). Backs AC-02..06.

## What
`validateUrl(raw)` in `src/shorten.js`: trim the input; reject empty; parse with the platform `URL`; require a host; require the scheme to be in the `http`/`https` allowlist (case-insensitive); reject length above the max (2048). Return the normalized (trimmed) URL, or throw a typed validation error the route maps to 400. No new dependency.

## Definition of Done
- [ ] empty / whitespace-only input is rejected (AC-02)
- [ ] non-`http`/`https` schemes are rejected (AC-03)
- [ ] unparseable / host-less input is rejected (AC-04)
- [ ] input over the max length is rejected (AC-05)
- [ ] a valid padded URL is returned trimmed (AC-06)
- [ ] the guard is a pure function, unit-tested without HTTP

## Notes
**Practice step 1 anchor:** the `sdd-implement` skill drives this task and the **first red→green cycle is AC-02** (empty url → validation error) — the smallest honest failing test before any guard code exists. Foundation for dedup (T2) and the route mapping (T3).
