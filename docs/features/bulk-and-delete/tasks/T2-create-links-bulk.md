---
id: T2
title: "Domain: createLinksBulk(db, urls) — per-item validation, dedup, order"
feature: bulk-and-delete
project: url-shortener
layer: domain
deps: []
acs: ["AC-03", "AC-04", "AC-05", "AC-06", "AC-07"]
files_hint: ["src/shorten.js"]
wave: 1
priority: Must
estimate: M
blocks: [T3]
owner: "TBD"
status: todo
context_budget: "~3000 tokens"
created: 2026-07-10
spec_refs: ["§5 AC-03", "§5 AC-04", "§5 AC-05", "§5 AC-06", "§5 AC-07", "§6 Non-functional requirements"]
sad_refs: ["§4 Solution strategy", "§6 Runtime view", "§10 QG-2", "§10 QG-3"]
openapi_paths: []
adr_refs: []
---

# T2 · `createLinksBulk` — a loop that is allowed to half-succeed

**Feature:** [bulk-and-delete](./_epic.md)
**Priority:** Must
**Estimate:** M
**Wave:** 1 (domain)

## Position in the sequence

- **Blocked by:** — nothing. It calls `createLink`, which already exists.
- **Blocks:** T3 — the route needs `BulkError` to answer `400`, and the result array to answer `200`.
- **Why this wave:** partial success is a domain property, not a serialization detail. If the loop cannot half-succeed against the store, no response shape can rescue it. **T1 shares this file and this wave** — see the epic's **Waves** section. The two functions never call each other; the only conflict is the editor's.

## Why (user story)

As a **visitor**, I want to submit a list of URLs and be told what happened to each one, so that a single typo in the middle of fifty bookmarks costs me one line, not the batch.

Spec US-02. AC-03 (order and length), AC-04 (over the limit, nothing written), AC-05 (empty batch), AC-06 (partial success), AC-07 (dedup per item).

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#6-runtime-view) — the bulk diagram: two guards outside the loop, a `catch` inside it
- 🗄  Data delta:   none — the batch inserts the same rows `POST /api/shorten` inserts, one at a time
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — `BulkItemCreated` and `BulkItemRefused`; the HTTP mapping is T3
- 📜 Relevant ADR: none — the batch needs no decision beyond the ones `input-validation` already made
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-03 … AC-07
- 🧬 Parity ref:   `createLink` in `src/shorten.js` (feature `input-validation`) — it already validates, trims and de-duplicates, and it already returns `{ code, created }`. Call it. Do not read its body into this one.
- 🧬 Dedup rule:   [input-validation spec §5](../../input-validation/spec.md#5-acceptance-criteria) — AC-07 is the rule this task applies per item; AC-06 is the trim it keys on

## Data delta

```
NO DB CHANGES IN THIS TASK — no column, no index, no migration. The batch writes rows through
createLink and nothing else.

Constant introduced in src/shorten.js:
  MAX_BULK_URLS = 100                     -- spec §6

Order of checks (first failure wins — this order is the contract):
  1. !Array.isArray(urls) || urls.length === 0  → throw BulkError('no urls')
  2. urls.length > MAX_BULK_URLS                → throw BulkError('too many urls')
  → BOTH before the loop. Neither touches the store.

Then, for each url, in input order:
  try   { const { code, created } = createLink(db, url)   -- validates, trims, dedups
          results.push({ url, code, created }) }
  catch (err) {
          if (!(err instanceof ValidationError)) throw err;   -- a DB fault is not a per-item error
          results.push({ url, error: err.reason }) }

  `url` in the result is the INPUT entry, echoed verbatim — not createLink's trimmed form.
  A refused entry has no trimmed form, and one field cannot mean two things.

NO TRANSACTION around the loop. Each createLink autocommits. See Edge cases.

Signature:
  createLinksBulk(db, urls) -> Array<{ url, code, created } | { url, error }>
```

## API contract

_API surface: none — internal task._ T3 maps `BulkError.reason` to `400 { error: reason }` and the array to `200`.

```
class BulkError extends Error
  .name   = 'BulkError'
  .reason = 'no urls' | 'too many urls'

Route mapping (T3):  both reasons -> 400 { error: reason }
```

`reason` values are short lowercase phrases, matching `ValidationError` and the `{ error: '<short>' }`
convention in `docs/architecture-map.md`. A separate error class — rather than reusing
`ValidationError` — because these two refusals are about the **batch**, and the route must never
report them at the same altitude as "the URL at index 7 is malformed".

## Acceptance criteria (GWT)

- [ ] **AC-t2-1 (empty batch — AC-05):** Given `urls = []`, when `createLinksBulk` runs, then it throws `BulkError` with `reason === 'no urls'`. Also for `undefined`, `null`, `{}` and the string `'https://x'` — anything that is not a non-empty array.
- [ ] **AC-t2-2 (over the limit — AC-04):** Given 101 valid URLs, when `createLinksBulk` runs, then it throws `BulkError` with `reason === 'too many urls'` **and `SELECT count(*) FROM links` is `0`**. The row count is the assertion; the exception is not.
- [ ] **AC-t2-3 (the boundary — AC-04):** Exactly 100 URLs are accepted and produce 100 rows. Exactly 101 are refused and produce none. Two assertions, from both sides.
- [ ] **AC-t2-4 (order and length — AC-03):** Given `n` URLs, when the batch runs, then `results.length === n` and `results[i].url === urls[i]` for every `i` — including a batch whose failures sit at index `0`, in the middle, and at `n - 1`.
- [ ] **AC-t2-5 (partial success — AC-06, QG-2):** Given `['https://a.example', 'not a url', 'https://b.example']`, then `results[1]` carries `error: 'malformed url'` and no `code`, and **the table holds two rows** — `a` and `b`. Read the table, not the result array.
- [ ] **AC-t2-6 (dedup against the store — AC-07):** Given `https://example.com/x` is already stored under code `K`, when a batch contains it, then its entry is `{ url, code: 'K', created: false }` and no second row appears.
- [ ] **AC-t2-7 (dedup inside one batch — AC-07):** Given `['https://d.example', 'https://d.example']` against an empty table, then `results[0].created === true`, `results[1].created === false`, both carry the **same** `code`, and `SELECT count(*)` is `1`. The second entry must see a row that did not exist when the call began.
- [ ] **AC-t2-8 (refusals are not de-duplicated — AC-06):** Given `['not a url', 'not a url']`, then both entries carry `error` and the table is empty. There is nothing to point the second one at.
- [ ] **AC-t2-9 (unexpected errors propagate):** Given a `db` whose `prepare` throws something that is not a `ValidationError`, when `createLinksBulk` runs, then that error escapes. It must not become `{ url, error: '…' }` inside a successful batch.
- [ ] **AC-t2-10 (each reason survives the loop — AC-06):** A batch containing `''`, `42`, `'not a url'`, `'javascript:alert(1)'` and a 2049-character URL yields, in order, `url required`, `url required`, `malformed url`, `unsafe scheme`, `url too long`. The reasons come from `ValidationError`; this task invents none.
- [ ] **AC-t2-11 (purity):** `createLinksBulk` performs no HTTP work, opens no transaction, and `src/shorten.js` still imports nothing from Express.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — RED: in `tests/unit/bulk-and-delete.test.js`, assert AC-t2-1 (`createLinksBulk(db, [])` throws `no urls`). It must fail because `createLinksBulk` does not exist.
- [ ] Step 2 — Confirm `createLink` already validates and de-duplicates: `git log --oneline src/shorten.js` and look for `input-validation` T1/T2. If it does not, that feature has not shipped and **this task is blocked** — say so, and stop. Re-implementing `validateUrl` here is the one failure mode this checklist exists to prevent.
- [ ] Step 3 — In `src/shorten.js`, export `class BulkError extends Error` with `name` and `reason` per **API contract**, and the constant `MAX_BULK_URLS = 100`.
- [ ] Step 4 — Export `createLinksBulk(db, urls)` with the two guards from **Data delta**, both **before** any loop, any `prepare`, and any `INSERT`.
- [ ] Step 5 — Write the loop with `for (const url of urls)` and push in order. Do **not** use `map` with an `async` callback, and do **not** collect the inserts to apply afterwards: entry `n` must see what entry `n - 1` wrote (AC-t2-7).
- [ ] Step 6 — In the `catch`, re-throw anything that is not a `ValidationError` **first**, then push the refusal. Writing it the other way round swallows database faults into a `200`.
- [ ] Step 7 — Do **not** wrap the loop in `db.transaction()`. It is the single most tempting change on this page and it deletes the feature; see **Edge cases**.
- [ ] Step 8 — Grow the suite through AC-t2-2 → AC-t2-5 → AC-t2-7 → AC-t2-6 → AC-t2-4 → AC-t2-8 → AC-t2-10 → AC-t2-9, each red before green.
- [ ] Step 9 — Run `npm run test:fast`. The seed suites and `input-validation`'s suites must pass unmodified.

## Edge cases

| Case | Behaviour |
|---|---|
| Wrapping the loop in `db.transaction()` | **Forbidden.** Measured on this driver: with two successful `INSERT`s followed by a `throw` inside `db.transaction()`, the table held **0 rows** afterwards. The same loop with a per-item `catch` and no transaction held 2. Partial success is what this endpoint is for, and a transaction is the one construct that cannot coexist with it. The `catch` sits inside the loop, so nothing escapes today — the wrapper would arm the failure for whoever adds the next `throw`. |
| Checking the 100-limit inside or after the loop | The bug this task is most likely to ship. A 101-item batch would create 100 links and *then* answer `400 too many urls`. Every status-code-only test passes. AC-t2-2 counts rows, which is why it counts rows. |
| The same URL twice in one array | The second entry's dedup `SELECT` must see the row the first entry inserted **during this same call**. Measured: `better-sqlite3` sees its own writes, both in autocommit and inside a transaction. Two natural implementations break this — collecting all inserts to run after the loop, and reading the URL→code map once before it. Both leave two rows for one URL, and both pass a test that only inspects `created`. AC-t2-7 asserts `count(*) === 1`. |
| The same URL twice, but it was already in the table | A *different* case, and easier: both entries are plain dedup hits (`created: false`), and neither depends on the other. Worth its own test precisely because it passes under the broken implementations above, so it cannot stand in for AC-t2-7. |
| `catch` without an `instanceof` check | A disk error, a locked database or a typo in a column name becomes `{ url, error: 'SQLITE_IOERR' }` inside a `200`. That is a lie told with a green status code, and it is indistinguishable from a bad URL to every caller. Re-throw first. |
| A non-string entry (`null`, `42`, `{}`) | `{ url: <the entry, as received>, error: 'url required' }`. `validateUrl`'s check 0 exists for exactly this. Echoing it back keeps `results[i]` aligned with `urls[i]`; dropping it would shift every later index and silently corrupt the caller's mapping. The response schema types `url` as a string and this entry will not be one — the wart is documented in `openapi.yaml`, and it is cheaper than either alternative. |
| `' https://x '` and `'https://x'` in one batch | One row. `createLink` keys dedup on the **trimmed** string (`input-validation` T2). Both entries share a `code`; the second reports `created: false`. Each result still echoes its own untrimmed input. |
| A batch of exactly one URL | An array of one result. The shape does not collapse to a bare object at `n = 1`, and T3 does not special-case it. |
| 100 URLs at the 2048-character maximum | Never reaches this function. `express.json()` caps the body at 100 kB, and 50 such URLs already make 102 560 bytes (measured) → `413` from the parser. `MAX_BULK_URLS` is a product rule that only short URLs can reach. Unit tests hit it directly; integration tests must use short URLs. |
| 100 autocommitted inserts | Accepted. `src/db.js` runs the database in WAL mode, so each commit appends to the log. Not measured as a problem at `n = 100`, and not "fixed" with a transaction — see the first row of this table. |

## Definition of Done

- [ ] Every checklist step done; AC-t2-1 … AC-t2-11 green.
- [ ] `npm run test:fast` green; `npm run lint` clean.
- [ ] A 101-item batch leaves **zero** rows — asserted by counting, not by reading the source.
- [ ] `grep -n "transaction" src/shorten.js` returns nothing.
- [ ] `grep -nE "new URL\(|protocol|trim\(\)" src/shorten.js` shows only `validateUrl`'s own body — `createLinksBulk` re-implements no validation.
- [ ] The `catch` re-throws every error that is not a `ValidationError`, proven by AC-t2-9.
- [ ] `src/shorten.js` still imports nothing from `express`.
- [ ] PR linked back to `tasks/T2-create-links-bulk.md`.
- [ ] `tracker.md` updated: status `done`.
