---
id: T5
title: "Tests: unit + integration for AC-01..07"
feature: input-validation
project: url-shortener
layer: tests
deps: ["T3"]
acs: ["AC-01", "AC-02", "AC-03", "AC-04", "AC-05", "AC-06", "AC-07"]
files_hint: ["tests/unit/validation.test.js", "tests/integration/validation.test.js"]
wave: 3
priority: Must
estimate: S
blocks: []
owner: "TBD"
status: todo
context_budget: "~3000 tokens"
created: 2026-07-09
spec_refs: ["§5 AC-01", "§5 AC-07", "§6 Non-functional requirements"]
sad_refs: ["§10 Quality requirements"]
openapi_paths: []
adr_refs: []
---

# T5 · Coverage sweep for AC-01 … AC-07

**Feature:** [input-validation](./_epic.md)
**Priority:** Must
**Estimate:** S
**Wave:** 3 (ui + tests)

## Position in the sequence

- **Blocked by:** T3 — the integration cases need the route's status codes.
- **Blocks:** — nothing. It ships in parallel with T4.
- **Why this wave:** under TDD, T1–T3 already wrote most of these tests, one per red→green cycle. This task is the **audit**: prove every spec AC has a covering case, add the ones the cycles skipped, and delete nothing.

## Why (user story)

As a **maintainer**, I want each acceptance criterion to have a test that fails when that criterion breaks, so that the suite is a statement about the product and not a statement about the code that happens to exist.

Spec §5 (AC-01 … AC-07), test plan → AC coverage.

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#10-quality-requirements) — QG-1 safety, QG-2 backwards-compat, QG-3 no duplicates
- 🗄  Data delta:   none
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — the integration cases assert exactly these codes
- 📜 Relevant ADR: none
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01 … AC-07
- 🧬 Parity ref:   [test-plan.md](../test-plan.md) — the AC-coverage table and the test-data list are the source of the cases below

## Data delta

```
NO DB CHANGES IN THIS TASK. Both suites open their own database:
  createApp(openDb(':memory:'))   -- integration, per test
  openDb(':memory:')              -- unit, per test
```

## API contract

_API surface: none._ The integration suite drives `POST /api/shorten` and `GET /api/links`
through supertest; it defines no contract of its own.

## Acceptance criteria (GWT)

- [ ] **AC-t5-1 (coverage — all):** Every one of AC-01 … AC-07 has at least one test whose name names it. A reviewer can map the table in [test-plan.md](../test-plan.md) onto test names without guessing.
- [ ] **AC-t5-2 (boundary — AC-05):** Two assertions, not one: 2048 characters accepted, 2049 refused.
- [ ] **AC-t5-3 (nothing stored on refusal — AC-02..05):** For each rejected input, `listLinks(db)` is empty afterwards. Asserting only the `400` would let a route that rejects *after* inserting pass.
- [ ] **AC-t5-4 (one row on repeat — AC-07):** After posting the same URL twice, `GET /api/links` returns exactly one entry, and both responses carry the same `code` with statuses `201` then `200`.
- [ ] **AC-t5-5 (all four unsafe schemes — AC-03):** `javascript:`, `data:`, `file:` and `ftp:` are each asserted. A single `javascript:` case would pass against a blocklist, which ADR-0001 forbids.
- [ ] **AC-t5-6 (regression — AC-01):** The seed suites `tests/unit/shorten.test.js` and `tests/integration/shorten.test.js` run unmodified and green.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — Read the AC-coverage table and the test-data list in [test-plan.md](../test-plan.md). Every literal you need is already there: `https://example.com/a`, `javascript:alert(1)`, `data:text/html,x`, `file:///etc/passwd`, `ftp://host/f`, `not a url`, `http://`, the padded variant, and the over-long variant.
- [ ] Step 2 — In `tests/unit/validation.test.js`, cover the guard directly: AC-02, AC-03 (four schemes), AC-04, AC-05 (both boundary sides), AC-06, plus dedup AC-07 through `createLink` over `openDb(':memory:')`.
- [ ] Step 3 — In `tests/integration/validation.test.js`, cover the HTTP seam: AC-01 (`201`), AC-02/03/04/05 (`400` with the exact `error` string), AC-06 (stored value trimmed, read back through `GET /api/links`), AC-07 (`201` then `200`, one link listed).
- [ ] Step 4 — Add AC-t5-3 as a shared helper: reject, then assert `GET /api/links` is `[]`. Use it in every rejection case rather than repeating it by hand.
- [ ] Step 5 — Run `npm run test:fast`. Then run it once more with the guard deliberately weakened (drop `ftp:` from the allowlist) and confirm a test goes red. A suite that stays green under a broken guard is not covering AC-03. Revert the weakening.

## Edge cases

| Case | Behaviour |
|---|---|
| Uppercase scheme `HTTP://…` | Asserted as **accepted** and returned unchanged. It belongs to AC-03's test group even though it is a happy path — the allowlist comparison is the thing under test. |
| Exactly 2048 characters | Build it, do not hand-write it: `'https://example.com/' + 'a'.repeat(2048 - 20)`. Hard-coding a 2048-character literal into the test is how the boundary silently drifts. |
| `"   "` (whitespace only) | Belongs to AC-02, not AC-04. It is empty after trim; it never reaches the parser. |
| Dedup across suites | Each test opens its own `:memory:` database. Never share one between `it` blocks — the dedup cases would then depend on execution order. |
| e2e for the inline error | Lives in T4 (`tests/e2e/validation.spec.js`), not here. `npm run test:fast` must not need a browser. |

## Definition of Done

- [ ] Every checklist step done; AC-t5-1 … AC-t5-6 green.
- [ ] `npm run test:fast` green; `npm run lint` clean.
- [ ] Every AC in [test-plan.md](../test-plan.md)'s coverage table maps to a named test.
- [ ] Step 5's mutation check was actually run, and a test actually went red.
- [ ] PR linked back to `tasks/T5-tests.md`.
- [ ] `tracker.md` updated: status `done`.
