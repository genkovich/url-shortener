---
id: T5
title: "Tests: unit + integration for AC-01..05"
layer: "tests"
deps: ["T3"]
acs: ["AC-01", "AC-02", "AC-03", "AC-04", "AC-05"]
files_hint: ["tests/unit/expiry.test.js", "tests/integration/expiry.test.js"]
owner: "TBD"
estimate: "M"
status: "todo"
---

# T5 — Tests

## Why
Prove AC-01..05, including the boundary moment and the legacy no-lifetime case ([spec.md](../spec.md) §5, [data-model.md](../data-model.md) fixtures).

## What
Unit suite in `tests/unit/expiry.test.js` + integration suite in
`tests/integration/expiry.test.js`: a lifetime is recorded at creation (AC-01), a valid link
redirects (AC-02), an expired link is refused as gone (AC-03), the default-lifetime invariant
holds (AC-04), and list state stays consistent with follow behaviour (AC-05); with boundary
and legacy no-lifetime fixtures.

## Definition of Done
- [ ] the suite runs green
- [ ] each of AC-01..05 has a covering case
- [ ] the boundary moment and a legacy no-lifetime link are both exercised

## Notes
Fixtures per [data-model.md](../data-model.md) (valid, expired, legacy no-lifetime). Depends on the read-path guard (T3).
