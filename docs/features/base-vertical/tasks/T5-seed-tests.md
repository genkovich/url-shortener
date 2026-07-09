---
id: T5
title: "Seed test suite: unit + integration + e2e smoke (AC-01..05)"
feature: base-vertical
project: url-shortener
layer: tests
deps: ["T3"]
acs: ["AC-01", "AC-02", "AC-03", "AC-04", "AC-05"]
files_hint: ["tests/unit/shorten.test.js", "tests/integration/shorten.test.js", "tests/e2e/smoke.spec.js"]
wave: 4
priority: Must
estimate: S
blocks: []
owner: "genkovich"
status: done
context_budget: "~2500 tokens"
created: 2026-07-08
spec_refs: ["§5 AC-01", "§5 AC-05", "Test plan"]
sad_refs: ["§10 Quality requirements"]
openapi_paths: []
adr_refs: []
---

# T5 · Seed test suite across all three levels

**Feature:** [base-vertical](./_epic.md)
**Priority:** Must
**Estimate:** S
**Wave:** 4 (ui + tests)

> **Shipped.** Worked example — and the precedent every later feature's tests copy.

## Position in the sequence

- **Blocked by:** T3 — the integration suite needs `createApp(db)`.
- **Blocks:** — nothing. It shipped in parallel with T4.
- **Why this wave:** it is the only artifact of this feature that later features *execute*. A broken seed suite makes every later red→green cycle unreadable.

## Why (user story)

As a **maintainer**, I want each acceptance criterion of the shipped slice pinned by a test, so that the next feature can move fast without silently breaking the first one.

Spec §5 (AC-01 … AC-05) and the inline Test plan.

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#10-quality-requirements)
- 🗄  Data delta:   none — unit and integration open `:memory:`; e2e uses its own file DB (`data/e2e.db`)
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — the integration cases assert exactly these codes
- 📜 Relevant ADR: none
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01 … AC-05
- 🧬 Parity ref:   none — this *is* the parity ref for `input-validation` T5 and `link-expiry` T5

## Data delta

```
NO SCHEMA CHANGE.

Three levels, three databases:
  unit        openDb(':memory:')                    -- domain functions directly
  integration createApp(openDb(':memory:'))         -- HTTP seam via supertest
  e2e         DB_PATH=data/e2e.db on port 3100      -- real browser, real server

tests/e2e/reset-db.js deletes data/e2e.db + -wal + -shm BEFORE Playwright starts the
server, because Playwright boots webServer earlier than globalSetup.
```

## API contract

_API surface: none._ The integration suite drives the routes T3 declared.

## Acceptance criteria (GWT)

- [x] **AC-t5-1 (create — AC-01):** `POST /api/shorten` returns `201`, a 7-character `code`, and a `short_url` containing it.
- [x] **AC-t5-2 (follow + count — AC-02):** `GET /:code` returns `302` with the original `Location`, and `GET /api/stats/:code` then reports `clicks === 1`.
- [x] **AC-t5-3 (unknown code — AC-03):** `GET /api/stats/nope123` → `404`; `GET /nope123` → `404 { error: 'not found' }`.
- [x] **AC-t5-4 (invariant — AC-04):** Unit level: two `resolveLink` calls take `clicks` from `0` to `2`, and the URL behind the code never changes.
- [x] **AC-t5-5 (list — AC-05):** Unit level: `listLinks` returns both created links. Browser level: the new code appears in `#rows` after a submit.
- [x] **AC-t5-6 (broken body):** `POST` with `{"url": broken` → `400 { error: 'bad request' }`, proving the error middleware does not turn a client typo into a `500`.
- [x] **AC-t5-7 (no network):** The e2e smoke test shortens the server's own `/healthz`, so the suite passes with the machine offline.

## Checklist (atomic steps for impl-agent)

- [x] Step 1 — `tests/unit/shorten.test.js`: `generateCode` shape and non-repetition, then the five domain functions over a fresh `openDb(':memory:')` per test.
- [x] Step 2 — `tests/integration/shorten.test.js`: `createApp(openDb(':memory:'))` per test, driven with supertest. Five cases: create, follow+count, unknown stats, unknown follow, broken body.
- [x] Step 3 — `tests/e2e/smoke.spec.js`: one browser path — load, submit, see `#short`, see the code in `#rows`, follow the code, land on the target.
- [x] Step 4 — `tests/e2e/reset-db.js` wired into `playwright.config.js` as the first half of `webServer.command`.
- [x] Step 5 — `vitest.config.js` declares two projects (`unit`, `integration`) so `npm run test:fast` runs both and neither picks up `tests/e2e/`.

## Edge cases

| Case | Behaviour |
|---|---|
| List order | Not asserted. `created_at` has millisecond precision, so two links created back-to-back tie and the order is undefined. The test asserts membership with `arrayContaining`. An order assertion here would be a flaky test wearing the costume of a strict one. |
| Leftover e2e database | Deleted before the server starts, not in `globalSetup` — Playwright boots `webServer` first, and unlinking a file the server already holds open "works" on macOS/Linux and fails on Windows. |
| WAL side files | `reset-db.js` removes `.db`, `.db-wal` and `.db-shm`. Deleting only `.db` leaves a WAL that resurrects the previous run's rows. |
| e2e on the dev port | It is not: Playwright uses `3100` with `reuseExistingServer: false`, so a stray `npm run dev` on `3000` can never be the system under test. |
| **AC-05 is not in the integration suite** | It is covered at the unit level (`listLinks`) and through the browser (`#rows` contains the code). The inline Test plan in `spec.md` files AC-05 under *Integration*, which overstates what exists. Recorded rather than quietly "fixed" by adding a test nobody asked for — the next person to touch this suite should decide. |

## Definition of Done

- [x] Every checklist step done; AC-t5-1 … AC-t5-7 green.
- [x] `npm run test:fast` green (14 tests), `npm run test:e2e` green (1 test), `npm run lint` clean.
- [x] No test touches the network or the working database.
- [x] PR linked back to `tasks/T5-seed-tests.md`.
- [x] `tracker.md` updated: status `done`.
