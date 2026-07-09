---
id: T5
title: "Seed unit tests (supertest) for AC-01..04"
layer: "tests"
deps: ["T3"]
acs: ["AC-01", "AC-02", "AC-03", "AC-04"]
files_hint: ["tests/unit/shorten.test.js", "tests/integration/shorten.test.js"]
owner: "genkovich"
estimate: "S"
status: "done"
---

# T5 — Seed tests

## Why
Seed suite proving AC-01..04 on the shipped slice ([[../spec.md]] §5, Test plan). Precedent for every feature's tests.

## What
supertest-driven suite split across `tests/integration/shorten.test.js` (HTTP seam) and
`tests/unit/shorten.test.js` (domain functions): shortening returns a handle (AC-01),
following redirects and counts the visit (AC-02), stats for an unknown code report not
found (AC-03), and the domain invariant that a code maps to a stable url with a monotonic
click count (AC-04).

## Definition of Done
- [x] the suite runs green
- [x] each of AC-01..04 has a covering case
- [x] the unknown-code path is exercised

## Notes
Shares the read/list behaviour that the frontend (T4) also relies on. Uses a fresh in-memory database per run.
