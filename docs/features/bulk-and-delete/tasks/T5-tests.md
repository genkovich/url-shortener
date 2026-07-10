---
id: T5
title: "Tests: unit + integration for AC-01..08"
feature: bulk-and-delete
project: url-shortener
layer: tests
deps: ["T3"]
acs: ["AC-01", "AC-02", "AC-03", "AC-04", "AC-05", "AC-06", "AC-07", "AC-08"]
files_hint: ["tests/unit/bulk-and-delete.test.js", "tests/integration/bulk-and-delete.test.js"]
wave: 3
priority: Must
estimate: M
blocks: []
owner: "TBD"
status: todo
context_budget: "~3500 tokens"
created: 2026-07-10
spec_refs: ["§5 AC-01", "§5 AC-08", "§6 Non-functional requirements"]
sad_refs: ["§10 Quality requirements"]
openapi_paths: []
adr_refs: ["ADR-0001"]
---

# T5 · Coverage sweep for AC-01 … AC-08

**Feature:** [bulk-and-delete](./_epic.md)
**Priority:** Must
**Estimate:** M
**Wave:** 3 (ui + tests)

## Position in the sequence

- **Blocked by:** T3 — the integration cases need `204`, `404` and `400` from the routes.
- **Blocks:** — nothing. It ships in parallel with T4.
- **Why this wave:** T1–T3 wrote most of these tests under TDD. This is the audit, and it has one theme: **assert the store, not the status code.** Three of this feature's four ways to be quietly wrong produce a perfectly correct status code while leaving the wrong rows behind.

## Why (user story)

As a **maintainer**, I want the three silent failures pinned by tests — a `400` that already wrote 100 rows, a `204` that left a row behind, a duplicate that became two rows — so that the ways this feature can lie are the ways it cannot.

Spec §5 (AC-01 … AC-08), [test-plan.md](../test-plan.md) → AC coverage.

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#10-quality-requirements) — QG-1 no ghost rows, QG-2 partial success is real, QG-3 nothing written above the limit, QG-4 route order
- 🗄  Data delta:   none — both suites open `:memory:`
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — the integration cases assert `204` / `404` / `200` / `400` and the two batch `error` strings
- 📜 Relevant ADR: [ADR-0001](../adr/0001-hard-delete.md) — AC-08 is this ADR expressed as an assertion
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01 … AC-08
- 🧬 Parity ref:   [test-plan.md](../test-plan.md) — the AC-coverage table and the test-data list are the source of every literal below

## Data delta

```
NO SCHEMA CHANGE. Both suites open their own database:
  createApp(openDb(':memory:'))   -- integration, per test
  openDb(':memory:')              -- unit, per test

Row counts are read with a raw statement, never through listLinks():
  db.prepare('SELECT count(*) AS c FROM links').get().c
A reader that filters would hide exactly the bug AC-08 exists to catch.
```

## API contract

_API surface: none._ The integration suite drives `DELETE /api/:code`, `POST /api/shorten/bulk`,
`GET /:code`, `GET /api/links` and `GET /api/stats/:code` through supertest.

## Acceptance criteria (GWT)

- [ ] **AC-t5-1 (coverage — all):** Every one of AC-01 … AC-08 has at least one test whose name names it, matching the table in [test-plan.md](../test-plan.md).
- [ ] **AC-t5-2 (delete leaves nothing — AC-08, QG-1):** After a `204`, `SELECT count(*)` is `0`, `getStats` is `null`, and a fresh link can be created under the freed code. Three assertions, because "the row is gone" is three different claims.
- [ ] **AC-t5-3 (`204` has no body — AC-01):** The delete response's `text` is `''` and it carries no `content-type`. A test that asserts only `status === 204` passes against `res.status(204).json({…})`, which is a bug waiting for the day someone expects that body.
- [ ] **AC-t5-4 (second delete — AC-02):** The second `DELETE` of the same code answers `404`. Deliberate, and pinned so nobody "makes delete idempotent" without reading ADR-0001.
- [ ] **AC-t5-5 (nothing written above the limit — AC-04, QG-3):** A 101-item batch leaves `count(*) === 0`. **Use short URLs.** 101 URLs at the 2048-character maximum never reach the route — `express.json()` answers `413` first — and the test would fail against `{ error: 'bad request' }` for a reason unrelated to the limit.
- [ ] **AC-t5-6 (the boundary — AC-04):** 100 accepted → 100 rows. 101 refused → 0 rows. Two assertions, from both sides, exactly as `custom-alias` pins 3/32.
- [ ] **AC-t5-7 (partial success is real — AC-06, QG-2):** After a batch with one bad URL among two good ones, `GET /api/links` shows **two** links. Read the table. `results[i].created === true` is the claim under test, not the evidence for it.
- [ ] **AC-t5-8 (dedup inside one batch — AC-07):** `['https://d.example', 'https://d.example']` against an empty table → `created: true` then `created: false`, the same `code`, and `count(*) === 1`. This is the assertion that kills the "collect the inserts and run them after the loop" implementation, which passes every other test on this page.
- [ ] **AC-t5-9 (dedup against the store — AC-07):** A URL already stored returns its existing code with `created: false` and adds no row. A separate test from AC-t5-8: it passes under the broken implementation, so it cannot stand in for it.
- [ ] **AC-t5-10 (order under failure — AC-03):** For a batch whose refusals sit at index `0`, in the middle, and at `n - 1`, `results[i].url === urls[i]` for every `i`. Off-by-one in the error path is what this catches.
- [ ] **AC-t5-11 (unexpected errors are not swallowed):** With a `db` stub whose `prepare` throws a plain `Error`, `createLinksBulk` re-throws it. A `catch` without an `instanceof` turns a disk fault into `{ url, error: '…' }` inside a `200`.
- [ ] **AC-t5-12 (`DELETE /api/links` reaches the param route, QG-4):** It answers `404 { error: 'not found' }`. This documents the swallow. It does not prevent a future literal route from being added *below* `DELETE /api/:code` — nothing can — and the test's comment must say so, or the next reader will trust it too much.
- [ ] **AC-t5-13 (seed suites untouched):** `tests/unit/shorten.test.js` and `tests/integration/shorten.test.js` pass unmodified, as do `input-validation`'s suites.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — Read the test-data list in [test-plan.md](../test-plan.md). Every literal you need is there: the short-URL generator, the padded URL, the duplicate pair, one input per `ValidationError.reason`, the batch sizes `0 / 1 / 100 / 101`, and the 50 × 2048-character body that must produce `413`.
- [ ] Step 2 — `tests/unit/bulk-and-delete.test.js`: `deleteLink` (true, false, second call, no tombstone, freed code, neighbours untouched, case-sensitivity), then `createLinksBulk` (both guards, order, partial, both dedup cases, re-throw).
- [ ] Step 3 — `tests/integration/bulk-and-delete.test.js`: `204` with an empty body; `404` for an unknown code and for a second delete; `200` with an ordered array; `400 no urls` for `[]`, `{}`, `null` and a bare string; `400 too many urls` for 101 short URLs; `404` for `DELETE /api/links`.
- [ ] Step 4 — Add AC-t5-5 and AC-t5-7 as **row-count** assertions: read `SELECT count(*)` directly, before and after. Do not use `GET /api/links` as the oracle for "nothing was written" — it is one `SELECT` away from being the thing under test.
- [ ] Step 5 — Add AC-t5-2's third clause: delete a code, then create a link under that exact code and follow it. If `custom-alias` has shipped, claim it as an alias; if not, insert it directly. Either way the assertion is that the primary key was released.
- [ ] Step 6 — Add AC-t5-3: assert `res.text === ''`. Then temporarily change the route to `res.status(204).json({ ok: true })` and confirm the test stays **green** — it will, because a `204` discards the body. That is the point: the assertion protects the contract, and only a code review protects the call. Revert.
- [ ] Step 7 — Mutation pass. Run each of these, confirm the named test goes red, revert:
  - move the `urls.length > 100` guard below the loop → AC-t5-5 goes red (and only AC-t5-5).
  - wrap the loop in `db.transaction()` and let one `ValidationError` escape → AC-t5-7 goes red.
  - hoist the dedup lookup out of the loop into a map built before it → AC-t5-8 goes red, AC-t5-9 stays green.
  - change `changes === 1` to `changes >= 0` in `deleteLink` → AC-t5-4 goes red.
  A suite that survives any of these four is not testing what it claims.
- [ ] Step 8 — Run `npm run test:fast`.

## Edge cases

| Case | Behaviour |
|---|---|
| Asserting "nothing was written" via `GET /api/links` | Weak. `listLinks` is code, and a soft-delete regression would make it lie in exactly the direction the test looks. Count rows with a raw `SELECT count(*)`. This is the whole reason AC-08 exists as a spec-level AC and not as a note in the ADR. |
| Testing `too many urls` with realistic long URLs | Fails, and not for the reason you think. Measured: the body ceiling falls between 49 URLs of 2048 characters (100 509 bytes, passes) and 50 (102 560 bytes, `413 { error: 'bad request' }`). Use short URLs for the item limit, and reserve the long ones for a separate test that asserts the `413` on purpose. |
| One test for both dedup cases | Do not merge them. "The URL was already in the table" passes under an implementation that hoists the lookup out of the loop; "the URL appears twice in one array" does not. Merging them hides the second behind the first, and the second is the one that leaves two rows in production. |
| `res.ok` in an integration assertion | For `204` it is `true`; for `404` it is `false`. Both are meaningless here. Assert `res.status` and `res.text`. |
| A test that deletes and then asserts `GET /:code === 404` only | Incomplete. `resolveLink` returning `null` is compatible with a tombstone that `resolveLink` filters out. Count the rows. |
| Mutating `changes === 1` to `changes > 0` | Nothing goes red, and nothing should: `code` is the primary key, so the two expressions are equivalent. It is a readability choice, not a tested one. Do not add a test that pretends otherwise — Step 7 mutates to `>= 0` instead, which is a real bug (`404` would never be returned). |
| e2e for the button and the paste field | Lives in T4 (`tests/e2e/bulk-and-delete.spec.js`), not here. `npm run test:fast` must not need a browser. |

## Definition of Done

- [ ] Every checklist step done; AC-t5-1 … AC-t5-13 green.
- [ ] `npm run test:fast` green; `npm run lint` clean.
- [ ] Every AC in [test-plan.md](../test-plan.md)'s coverage table maps to a named test.
- [ ] Step 7's four mutations were actually run, and each turned a specific test red — and the third one turned exactly one of the two dedup tests red.
- [ ] Every "nothing was written" assertion reads `SELECT count(*)`, not `GET /api/links`.
- [ ] `grep -n "2048\|repeat(20" tests/integration/bulk-and-delete.test.js` shows long URLs only in the test that expects `413`.
- [ ] PR linked back to `tasks/T5-tests.md`.
- [ ] `tracker.md` updated: status `done`.
