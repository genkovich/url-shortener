---
id: T2
title: "Domain: generateCode, createLink, resolveLink, listLinks, getStats"
feature: base-vertical
project: url-shortener
layer: domain
deps: ["T1"]
acs: ["AC-01", "AC-02", "AC-04"]
files_hint: ["src/shorten.js"]
wave: 2
priority: Must
estimate: S
blocks: [T3]
owner: "genkovich"
status: done
context_budget: "~2000 tokens"
created: 2026-07-08
spec_refs: ["§5 AC-01", "§5 AC-02", "§5 AC-04"]
sad_refs: ["§5 Building block view", "§6 Runtime view"]
openapi_paths: []
adr_refs: ["ADR-0001"]
---

# T2 · Domain functions over the `db` handle

**Feature:** [base-vertical](./_epic.md)
**Priority:** Must
**Estimate:** S
**Wave:** 2 (domain)

> **Shipped.** Worked example — the sections below describe `src/shorten.js` as it exists.

## Position in the sequence

- **Blocked by:** T1 — every function takes the open handle as its first argument.
- **Blocks:** T3 — the routes are a thin translation of these five functions.
- **Why this wave:** the domain is where the product lives. It is written and tested before HTTP exists, and it never learns that HTTP exists.

## Why (user story)

As a **visitor**, I want a short handle that always resolves to my original address and counts every visit, so that the short link is usable and I can see how often it is used.

Spec US-01, US-02, US-03. AC-01 (create), AC-02 (redirect + count), AC-04 (a code maps to a stable URL; clicks only increase).

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#6-runtime-view) — create, then follow-and-count
- 🗄  Data delta:   none — reads and writes the `links` table T1 created
- 🌐 API contract: none — these functions know nothing about requests or status codes
- 📜 Relevant ADR: [ADR-0001](../../../adr/0001-base62-7-char-codes.md) — base62, 7 characters
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01, AC-02, AC-04
- 🧬 Parity ref:   none — this file *is* the precedent every later domain rule copies

## Data delta

```
NO SCHEMA CHANGE — T1 owns the table.

Statements used:
  SELECT 1 FROM links WHERE code = ?                              -- collision guard
  INSERT INTO links (code, url, created_at, clicks) VALUES (?, ?, ?, 0)
  SELECT * FROM links WHERE code = ?                              -- resolve
  UPDATE links SET clicks = clicks + 1 WHERE code = ?             -- count the visit
  SELECT * FROM links ORDER BY created_at DESC                    -- list
  SELECT code, clicks, created_at FROM links WHERE code = ?       -- stats

Exports:
  generateCode()          -> string, 7 chars from a 62-char alphabet
  createLink(db, url)     -> { code }
  resolveLink(db, code)   -> row | null      (increments clicks on a hit)
  listLinks(db)           -> row[]
  getStats(db, code)      -> { code, clicks, created_at } | null
```

## API contract

_API surface: none — internal. `src/app.js` (T3) is the only consumer._

## Acceptance criteria (GWT)

- [x] **AC-t2-1 (code shape — AC-01):** Given `generateCode()`, when it returns, then the value matches `/^[A-Za-z0-9]{7}$/`.
- [x] **AC-t2-2 (create — AC-01):** Given an empty database, when `createLink(db, url)` runs, then it returns a `code` and `resolveLink(db, code).url` is that `url`.
- [x] **AC-t2-3 (collision guard):** Given `generateCode()` returns a code already present, when `createLink` runs, then it regenerates before inserting. The primary key is never violated.
- [x] **AC-t2-4 (count — AC-02):** Given a stored link with zero clicks, when `resolveLink` is called twice, then `getStats(db, code).clicks` is `2`.
- [x] **AC-t2-5 (unknown code — AC-02):** Given a code that was never stored, when `resolveLink` or `getStats` is called, then it returns `null` — not `undefined`, not a throw.
- [x] **AC-t2-6 (invariant — AC-04):** Given any number of follows, then the code maps to the same URL throughout and `clicks` is monotonic non-decreasing (`docs/CONTEXT.md` → Invariants).
- [x] **AC-t2-7 (HTTP-free):** `src/shorten.js` imports nothing from `express` and takes no `req` / `res`.

## Checklist (atomic steps for impl-agent)

- [x] Step 1 — `ALPHABET` (base62) and `CODE_LEN = 7` as module constants; `generateCode()` draws from `randomInt` in `node:crypto`, not `Math.random`.
- [x] Step 2 — `createLink(db, url)`: loop `while (SELECT 1 … )` to regenerate on collision, then `INSERT` with `Date.now()`.
- [x] Step 3 — `resolveLink(db, code)`: `SELECT`, return `null` on a miss, otherwise `UPDATE clicks` and return the row.
- [x] Step 4 — `listLinks(db)` and `getStats(db, code)`; the latter coerces a missing row to `null` with `|| null`.
- [x] Step 5 — Unit-test all five over `openDb(':memory:')`.

## Edge cases

| Case | Behaviour |
|---|---|
| Code collision | Regenerate and retry. At 62⁷ ≈ 3.5 × 10¹² codes the probability is negligible, but the guard is one line and removes the entire failure class. |
| `resolveLink` on a miss | Returns `null` **before** any `UPDATE`, so a miss cannot increment a counter. |
| Clicks counted on read | `resolveLink` mutates. This is deliberate: the name says *resolve*, and the follow path is the only caller. `getStats` and `listLinks` are pure reads and never increment. |
| Two links created in the same millisecond | `created_at` ties. `listLinks` orders by `created_at DESC`, so their relative order is undefined. The seed unit test asserts membership, not order — asserting order here would be a flaky test dressed up as a strict one. |
| `randomInt` vs `Math.random` | `randomInt` is used because the code is a public handle. It is not a secret, but a predictable sequence would let anyone enumerate every link. |

## Definition of Done

- [x] Every checklist step done; AC-t2-1 … AC-t2-7 green.
- [x] `npm run test:fast` green; `npm run lint` clean.
- [x] No `express` import and no `db`-less global state in `src/shorten.js`.
- [x] PR linked back to `tasks/T2-domain-functions.md`.
- [x] `tracker.md` updated: status `done`.
