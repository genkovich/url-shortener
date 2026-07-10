---
id: T1
title: "Domain: deleteLink(db, code) — hard delete, boolean outcome"
feature: bulk-and-delete
project: url-shortener
layer: domain
deps: []
acs: ["AC-01", "AC-02", "AC-08"]
files_hint: ["src/shorten.js"]
wave: 1
priority: Must
estimate: S
blocks: [T3]
owner: "TBD"
status: todo
context_budget: "~2000 tokens"
created: 2026-07-10
spec_refs: ["§5 AC-01", "§5 AC-02", "§5 AC-08", "§6 Non-functional requirements", "§6.1 Security / privacy"]
sad_refs: ["§4 Solution strategy", "§6 Runtime view", "§10 QG-1"]
openapi_paths: []
adr_refs: ["ADR-0001"]
---

# T1 · `deleteLink` — the first destructive domain function

**Feature:** [bulk-and-delete](./_epic.md)
**Priority:** Must
**Estimate:** S
**Wave:** 1 (domain)

## Position in the sequence

- **Blocked by:** — nothing. First task, one file, one statement.
- **Blocks:** T3 — the route turns this function's boolean into `204` or `404` and has nothing to turn before it.
- **Why this wave:** deletion destroys state. The rule that decides *what survives a delete* is settled before HTTP, before a button, and before anyone can press it twice. Note that T2 shares this file and this wave; see the epic's **Waves** section before you both start typing.

## Why (user story)

As a **visitor**, I want a link I delete to be gone — not hidden, not marked, gone — so that it stops resolving and stops appearing in my list, and so that the code it held can be used again.

Spec US-01. AC-01 (the link is removed), AC-02 (an unknown code is not found), AC-08 (nothing survives, and the code is free).

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#6-runtime-view) — the delete diagram: one statement, and `changes` is the whole answer
- 🗄  Data delta:   none — no column, no migration. That absence is the decision, not an omission (ADR-0001)
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — `DELETE /api/{code}`: `204` / `404`; the mapping itself is T3
- 📜 Relevant ADR: [ADR-0001](../adr/0001-hard-delete.md) — why soft delete's `deleted_at` was refused, and what it would have cost every future `SELECT`
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01, AC-02, AC-08
- 🧬 Parity ref:   `resolveLink` in `src/shorten.js` — same shape: takes `db` first, returns a plain value, knows nothing about HTTP

## Data delta

```
NO DB CHANGES IN THIS TASK — and none in this feature. No deleted_at, no archive table,
no ALTER TABLE anywhere. If you are writing SQL other than the DELETE below, stop and
re-read ADR-0001.

Write pattern:
  DELETE FROM links WHERE code = ?     -- ? is the code, verbatim (case-sensitive PK)

Outcome:
  info.changes === 1  → a row was removed  → return true
  info.changes === 0  → no such code       → return false

Signature:
  deleteLink(db, code) -> boolean

Reads that must NOT change:
  resolveLink · listLinks · getStats — none of them gains a WHERE clause. There is nothing
  to exclude, because there is nothing left behind. This is QG-1.
```

## API contract

_API surface: none — internal task._ T3 turns `true` into `204` and `false` into `404 { error: 'not found' }`.

```
deleteLink(db, code) -> true | false

  true   ->  204, no body                          (AC-01)
  false  ->  404 { error: 'not found' }            (AC-02)
```

No error type is introduced. `ValidationError` and `AliasError` exist because their callers must
distinguish *why* something was refused; here there is one reason and it needs no name. A boolean
that the route reads once is smaller than an exception thrown to be caught two lines later.

## Acceptance criteria (GWT)

- [ ] **AC-t1-1 (existing code — AC-01):** Given a link stored under `abc`, when `deleteLink(db, 'abc')` runs, then it returns `true` and `resolveLink(db, 'abc')` is `null`.
- [ ] **AC-t1-2 (unknown code — AC-02):** Given an empty database, when `deleteLink(db, 'nosuch')` runs, then it returns `false` and the table is untouched. Start here: it is the shortest red test in the feature.
- [ ] **AC-t1-3 (second delete — AC-02):** Given `abc` was just deleted, when `deleteLink(db, 'abc')` runs again, then it returns `false`. The second call is not an error and not a success; it is a report that there was nothing there.
- [ ] **AC-t1-4 (no tombstone — AC-08):** After deleting `abc`, `SELECT count(*) FROM links` is `0`. Asserted with a raw count, not by calling `listLinks`, which could be hiding the row for us.
- [ ] **AC-t1-5 (the code is free — AC-08):** After deleting `abc`, inserting a new link under the code `abc` succeeds and resolves to the new URL. The primary key was released, not reserved.
- [ ] **AC-t1-6 (neighbours untouched — AC-01):** Given three links, when one is deleted, then the other two keep their `url`, `clicks` and `created_at` byte-identical. Deleting by primary key must not be able to touch a second row, and the test says so out loud.
- [ ] **AC-t1-7 (clicks die with the row — AC-08):** Given `abc` has `clicks = 7`, when it is deleted, then `getStats(db, 'abc')` is `null`. The counter is a column of the row. This test exists to document the loss, not to celebrate it.
- [ ] **AC-t1-8 (case-sensitive — AC-02):** Given `Foo` exists, when `deleteLink(db, 'foo')` runs, then it returns `false` and `Foo` survives. SQLite compares `TEXT PRIMARY KEY` with the binary collation, exactly as `custom-alias` relies on.
- [ ] **AC-t1-9 (purity):** `deleteLink` performs no `SELECT` before its `DELETE`, and `src/shorten.js` still imports nothing from Express.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — RED: in `tests/unit/bulk-and-delete.test.js`, assert AC-t1-2 (`deleteLink(db, 'nosuch') === false`). It must fail because `deleteLink` does not exist.
- [ ] Step 2 — In `src/shorten.js`, export `deleteLink(db, code)`. One prepared statement, `DELETE FROM links WHERE code = ?`, and `return info.changes === 1`.
- [ ] Step 3 — Do **not** add a `SELECT` first to "check if it exists". The driver already tells you: `.run()` returns `{ changes, lastInsertRowid }`. A probe would add a statement, a window between check and delete, and nothing else.
- [ ] Step 4 — Compare with `=== 1`, not with `> 0`. `code` is the primary key, so a delete removes at most one row. A `> 0` invites the reader to wonder when it could be two.
- [ ] Step 5 — Grow the suite through AC-t1-1 → AC-t1-3 → AC-t1-4 → AC-t1-5 → AC-t1-6 → AC-t1-7 → AC-t1-8, each red before green.
- [ ] Step 6 — Open `resolveLink`, `listLinks` and `getStats` and change nothing in them. Then `grep -n "deleted_at\|is_deleted\|ALTER TABLE" src/` and confirm it is silent. That grep is AC-t1-4's real assertion.
- [ ] Step 7 — Do **not** touch `src/app.js`. The `501` stub stays until T3.

## Edge cases

| Case | Behaviour |
|---|---|
| Deleting a code twice | `true`, then `false`. Measured against this driver: `.run()` reports `changes = 1` on the first call and `0` on both the second and on a code that never existed. The route will turn the second into a `404`. That is a deliberate choice about the *response*, not a break of HTTP idempotency — RFC 9110 defines an idempotent method by its effect on the server, and the effect is identical: no row. An API that answers `204` twice has a uniform response and no way to say "that code was never there". |
| The code is freed for re-use | Measured: after `DELETE FROM links WHERE code = 'c1'`, `INSERT` with `code = 'c1'` succeeds and stores the new URL. AC-t1-5 pins it. This is what a `deleted_at` tombstone would have taken away, and what `custom-alias` needs — see ADR-0001. It is also the feature's sharpest edge: a short URL shared a year ago now resolves to whatever link took the code. |
| `SELECT` before `DELETE` | Rejected. Two statements where one suffices, and the pair could in principle disagree. `better-sqlite3` is synchronous and single-process, so today they cannot — which is an argument for not writing the second statement, not for trusting it. |
| `changes > 0` instead of `=== 1` | Both work today. `=== 1` also documents that `code` is a primary key. If a future `DELETE` here can remove two rows, something much worse has already happened. |
| `deleteLink(db, 'foo')` for a link stored as `Foo` | `false`. Uniqueness is case-sensitive (SQLite binary collation), which is the same rule `custom-alias` ADR-0001 depends on. Folding case here would let a visitor delete a link they cannot follow. |
| `code` is `undefined` or `null` | `false`, in both cases. Measured on `better-sqlite3@11.10.0`: `.run(null)` and `.run(undefined)` both bind SQL `NULL`, match no row, and report `changes = 0`. Neither throws. (`.run()` with no argument at all does throw — `RangeError: Too few parameter values were provided` — but no caller can produce that.) T3 never passes either value: `req.params.code` is always a non-empty string, because `DELETE /api/` matches no route (measured: `404`). Do not add a guard for a value the route cannot produce. |
| A future table with a foreign key into `links` | Would make this function silently wrong (orphans, or a constraint error surfacing as a `500`). Recorded in SAD §11: the decision has to be revisited *before* such a table is written. |

## Definition of Done

- [ ] Every checklist step done; AC-t1-1 … AC-t1-9 green.
- [ ] `npm run test:fast` green; `npm run lint` clean.
- [ ] `grep -rn "deleted_at\|is_deleted\|ALTER TABLE" src/` returns nothing.
- [ ] `resolveLink`, `listLinks` and `getStats` are byte-identical to their state before this task.
- [ ] A deleted code can be inserted again — asserted by a test, not by reading ADR-0001.
- [ ] `deleteLink` issues exactly one SQL statement.
- [ ] PR linked back to `tasks/T1-delete-link.md`.
- [ ] `tracker.md` updated: status `done`.
