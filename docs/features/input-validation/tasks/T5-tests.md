---
id: T5
title: "Tests: unit + integration for AC-01..07"
layer: "tests"
deps: ["T3"]
acs: ["AC-01", "AC-02", "AC-03", "AC-04", "AC-05", "AC-06", "AC-07"]
files_hint: ["tests/unit/validation.test.js", "tests/integration/validation.test.js"]
owner: "TBD"
estimate: "S"
status: "todo"
---

# T5 — Tests

## Why
Prove AC-01..07, including each rejection branch, trimming, and dedup ([spec.md](../spec.md) §5, [test-plan.md](../test-plan.md)). These become the step-1 ground-truth gate.

## What
Unit suite in `tests/unit/validation.test.js` + integration suite in
`tests/integration/validation.test.js`: a valid URL shortens (AC-01); empty/whitespace
refused (AC-02); unsafe schemes refused (AC-03); malformed refused (AC-04); over-length
refused (AC-05); a padded URL is stored trimmed (AC-06); the same URL reuses its code with
no second row (AC-07). Use the fixtures in [test-plan.md](../test-plan.md) and the boundary cases
(exactly-max length, uppercase scheme).

## Definition of Done
- [ ] the suite runs green
- [ ] each of AC-01..07 has a covering case
- [ ] boundary (max-length) and uppercase-scheme cases are exercised
- [ ] the existing seed tests still pass

## Notes
Drive integration cases through `createApp(openDb(':memory:'))` per the architecture-map testability convention (precedent: `tests/integration/shorten.test.js`; domain precedent: `tests/unit/shorten.test.js`). Depends on the route mapping (T3).
