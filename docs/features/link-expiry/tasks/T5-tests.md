---
id: T5
title: "Tests: unit + integration for AC-01..05"
feature: link-expiry
project: url-shortener
layer: tests
deps: ["T3"]
acs: ["AC-01", "AC-02", "AC-03", "AC-04", "AC-05"]
files_hint: ["tests/unit/expiry.test.js", "tests/integration/expiry.test.js"]
wave: 4
priority: Must
estimate: M
blocks: []
owner: "TBD"
status: todo
context_budget: "~3000 tokens"
created: 2026-07-09
spec_refs: ["§5 AC-01", "§5 AC-05", "§6 Non-functional requirements"]
sad_refs: ["§10 Quality requirements"]
openapi_paths: []
adr_refs: []
---

# T5 · Coverage sweep for AC-01 … AC-05

**Feature:** [link-expiry](./_epic.md)
**Priority:** Must
**Estimate:** M
**Wave:** 4 (ui + tests)

## Position in the sequence

- **Blocked by:** T3 — the integration cases need `410` from the route.
- **Blocks:** — nothing. It ships in parallel with T4.
- **Why this wave:** T1–T3 wrote most of these tests under TDD. This task is the audit: every spec AC has a covering case, the boundary is asserted from both sides, and the legacy `NULL` row is exercised.

## Why (user story)

As a **maintainer**, I want the expiry boundary and the legacy no-lifetime row pinned by tests, so that the two cases nobody reaches by hand are the two cases that cannot regress.

Spec §5 (AC-01 … AC-05), [test-plan.md](../test-plan.md) → AC coverage, [data-model.md](../data-model.md) → Test fixtures.

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#10-quality-requirements) — QG-1 correctness, QG-2 backwards-compat
- 🗄  Data delta:   [data-model.md](../data-model.md) — three fixtures: valid (`now + 1h`), expired (`now - 1h`), legacy (`NULL`)
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — the integration cases assert `302` / `404` / `410`
- 📜 Relevant ADR: [ADR-0001](../adr/0001-expiry-check-on-read.md)
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01 … AC-05
- 🧬 Parity ref:   `tests/unit/shorten.test.js` and `tests/integration/shorten.test.js` — the two seams and the `:memory:` per-test pattern

## Data delta

```
NO SCHEMA CHANGE. Both suites open their own database:
  createApp(openDb(':memory:'))   -- integration, per test
  openDb(':memory:')              -- unit, per test

Fixtures are built by INSERTing expires_at directly, never by sleeping:
  valid   expires_at = now + 3_600_000
  expired expires_at = now - 3_600_000
  legacy  expires_at = NULL
```

## API contract

_API surface: none._ The integration suite drives `GET /:code`, `GET /api/stats/:code` and
`GET /api/links` through supertest.

## Acceptance criteria (GWT)

- [ ] **AC-t5-1 (coverage — all):** Every one of AC-01 … AC-05 has at least one test whose name names it, matching the table in [test-plan.md](../test-plan.md).
- [ ] **AC-t5-2 (boundary — AC-03):** Two assertions, not one. `isExpired({ expires_at: 1000 }, 999)` is `false`; `isExpired({ expires_at: 1000 }, 1000)` is `true`.
- [ ] **AC-t5-3 (legacy row — AC-04):** A link with `expires_at IS NULL` follows with `302` and shows `active` in `listLinks`. This is the row nobody creates any more and everybody forgets.
- [ ] **AC-t5-4 (no click on `410` — AC-03):** After two expired follows, `GET /api/stats/:code` reports the click count the link started with.
- [ ] **AC-t5-5 (default applied — AC-04):** A link created with no `ttl_days` has a non-null `expires_at` equal to `created_at + default * DAY_MS`.
- [ ] **AC-t5-6 (list matches follow — AC-05):** For every fixture, `listLinks(db, now).expired` equals `resolveLink(db, code, now).expired`. A single test over all three fixtures, not three tests.
- [ ] **AC-t5-7 (no sleeping):** `grep -E "setTimeout|sleep|await new Promise" tests/unit/expiry.test.js tests/integration/expiry.test.js` returns nothing. Time is injected, never waited for.
- [ ] **AC-t5-8 (seed suites untouched):** `tests/unit/shorten.test.js` and `tests/integration/shorten.test.js` pass unmodified.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — Read the fixture table in [data-model.md](../data-model.md) and the coverage table in [test-plan.md](../test-plan.md). Build a `seedLink(db, { code, url, expiresAt, clicks })` helper; every case below uses it.
- [ ] Step 2 — `tests/unit/expiry.test.js`: `isExpired` at the boundary (both sides), on the legacy `null`, and on `undefined`. Then `createLink` with and without `ttlDays`, then `resolveLink` on all three fixtures, then `listLinks`.
- [ ] Step 3 — `tests/integration/expiry.test.js`: `GET /:code` on valid (`302`), expired (`410 { error: 'gone' }`) and unknown (`404`). `POST /api/shorten` with a valid `ttl_days`, without one, and with each rejected value from T3 AC-t3-7.
- [ ] Step 4 — Add AC-t5-4 as an explicit assertion: read `clicks`, follow twice, read again, compare. Asserting only the `410` would pass against a route that redirects the counter but not the visitor.
- [ ] Step 5 — Add AC-t5-6 over all three fixtures in one loop, comparing the two code paths against a single injected `now`.
- [ ] Step 6 — Run `npm run test:fast`. Then flip the boundary in `isExpired` from `>=` to `>` and confirm AC-t5-2 goes red. A suite that survives that flip is not testing the boundary. Revert.

## Edge cases

| Case | Behaviour |
|---|---|
| Injecting `now` vs sleeping | Always inject. A test that waits an hour does not run; a test that waits 10 ms is flaky on a loaded CI box. Both `isExpired` and `resolveLink` take `now` for exactly this reason. |
| `expires_at: undefined` | Non-expiring, same as `null`. SQLite returns `null`, but a hand-built fixture object easily omits the key — and a strict `!== null` check would then throw the fixture into "expired". |
| The default TTL in tests | Inject it: `resolveDefaultTtlDays({ DEFAULT_TTL_DAYS: '7' })`. Never read the real `process.env` in a test, and never mutate it — the next test file inherits whatever you left behind. |
| `ttl_days: 0` | Rejected by the route (`400`), accepted by the domain (an immediately-expired link). Both facts get a test; they are not in conflict, they are two different layers. |
| e2e for the badge | Lives in T4 (`tests/e2e/expiry.spec.js`), not here. `npm run test:fast` must not need a browser. |

## Definition of Done

- [ ] Every checklist step done; AC-t5-1 … AC-t5-8 green.
- [ ] `npm run test:fast` green; `npm run lint` clean.
- [ ] Every AC in [test-plan.md](../test-plan.md)'s coverage table maps to a named test.
- [ ] Step 6's mutation check was actually run, and AC-t5-2 actually went red.
- [ ] No test sleeps, and no test reads or writes the real `process.env`.
- [ ] PR linked back to `tasks/T5-tests.md`.
- [ ] `tracker.md` updated: status `done`.
