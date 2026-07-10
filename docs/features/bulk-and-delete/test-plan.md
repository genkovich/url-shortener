---
status: Accepted
owner: "genkovich"
reviewers: ["Tech Lead"]
updated_at: "2026-07-10"
feature_size: "M"
---

# Test plan — bulk-and-delete

## Levels
| Level | Scope | Strategy |
|---|---|---|
| Unit | `deleteLink` (boolean outcome, no row left) and `createLinksBulk` (guards, order, per-item errors, dedup) | pure domain calls over `openDb(':memory:')` |
| Integration | `DELETE /api/:code` → `204` / `404`; `POST /api/shorten/bulk` → `200` / `400`; route order | drive the service through supertest |
| E2E-through-UI | the row delete button removes the row; the paste field creates a batch and renders per-line outcomes | drive the frontend and read the rendered table |

The important assertions in this feature are about **rows, not status codes**. A `400` says nothing about whether the first fifty links were written, and a `204` says nothing about whether a tombstone was left. Every AC below that mentions the store asserts the store.

## AC coverage
| AC | Test name | Level | Expected outcome |
|---|---|---|---|
| AC-01 | delete removes the link | Unit + Integration | `204`, empty body; gone from `GET /api/links`; `GET /:code` → `404` |
| AC-02 | delete of an unknown code | Unit + Integration | `404 { error: 'not found' }`; row count unchanged |
| AC-03 | batch of valid urls | Unit + Integration | `200`, `results.length === urls.length`, `results[i].url === urls[i]` |
| AC-04 | batch over the limit | Unit + Integration | `400 { error: 'too many urls' }`, **zero rows written** |
| AC-05 | empty batch | Unit + Integration | `400 { error: 'no urls' }` |
| AC-06 | one bad url among good ones | Unit + Integration | `200`; the bad entry carries `error` and no `code`; the neighbours exist as rows |
| AC-07 | duplicate url inside one batch | Unit + Integration | second entry `created: false` with the first entry's `code`; one row in the table |
| AC-08 | hard delete leaves nothing | Unit | zero rows after delete; the freed `code` can be inserted again |

## Edge cases / error paths

**Delete**

- Second `DELETE` of the same code → `404`, not `204`. This is a deliberate choice, and it is not a violation of HTTP idempotency: RFC 9110 defines an idempotent method by its *effect on the server* — the row is absent after one request and after two. What differs is the *response*. An API that answers `204` both times has a uniform response and no way to tell the caller "that code was never yours to delete". We keep the signal.
- `DELETE /api/links` → `404 { error: 'not found' }`. Not because `/api/links` is special, but because `DELETE /api/:code` matched it with `code = "links"` and there is no such link. **Measured, on today's code:** the `501` stub at `src/app.js:44` already answers `DELETE /api/links` with `{"error":"not implemented","feature":"bulk-and-delete"}`. This test pins today's truth so that a future literal `DELETE /api/links` cannot be added *above* the parameterised route without a red test. It cannot catch one added *below* — nothing can. That is why the rule is a comment in `src/app.js` and a hard rule in the epic.
- `DELETE /api/shorten/bulk` → `404` from Express itself, no route matched: `:code` does not span `/`.
- `res.status(204).json({ … })` sends no body and no `content-type`. Measured. Assert `res.text === ''`, and never write an assertion about a delete response body.
- Deleting a link that has clicks → the counter is destroyed with the row. Assert `GET /api/stats/<code>` → `404` afterwards, so the loss is documented by a test rather than discovered later.
- Delete, then re-create under the same code → succeeds. Measured: SQLite re-accepts a primary key whose row was deleted. Once `custom-alias` has shipped this is the re-claim path; until then, assert it with a direct `createLink` collision-free insert or a raw `INSERT`.

**Bulk**

- 100 entries → accepted. 101 → `400 { error: 'too many urls' }` **and zero rows**. The row count is the assertion. A guard placed after the loop, or inside it, passes a status-code-only test while leaving 100 links behind.
- 0 entries, `urls: []` → `400 { error: 'no urls' }`. `urls` absent, `urls: null`, `urls: 'https://x'` (a string, not an array) → the same `no urls`.
- **100 URLs at the 2048-character maximum never reach the route.** The body is 205 110 bytes and `express.json()`'s default limit is 100 kB; Express answers `413`, which this app's error middleware renders as `{ error: 'bad request' }`. Measured; the boundary is between 49 URLs (100 509 bytes, passes) and 50 (102 560 bytes, `413`). **Every test of AC-04 must use short URLs**, or it will assert `400 too many urls` against a `413 bad request` and fail for the wrong reason.
- The same URL twice in one array → the second entry sees a row that did not exist when the request began. This is **not** the same case as "the URL was already in the table": the first entry's `INSERT` has to be visible to the second entry's dedup `SELECT` within the same request. Measured: better-sqlite3 sees its own writes, both in autocommit and inside `db.transaction()`. Two natural implementations break it — collecting all inserts to run after the loop, and snapshotting the URL→code map once before the loop. Both produce two rows for one URL and both pass a test that only checks `created`. Assert `SELECT count(*)`.
- The same URL twice, both invalid → two entries, both carrying `error`. Refusals are not de-duplicated; there is nothing to point at.
- A batch wrapped in `db.transaction()` → forbidden. Measured: when one item throws inside the transaction, better-sqlite3 rolls the whole thing back and two successful inserts became **zero rows**. The loop catches `ValidationError` per item, so today nothing escapes; the wrapper would arm the failure for whoever adds the next `throw`.
- Non-`ValidationError` exceptions must **not** be caught per item. A disk error becoming `{ url, error: 'SQLITE_IOERR' }` inside a `200` is a lie told with a green status code. Assert that an unexpected throw propagates out of `createLinksBulk`.
- Entries that are not strings (`null`, `42`, `{}`) → `{ url: <as received>, error: 'url required' }`. `validateUrl`'s check 0 exists for exactly this (`input-validation` T1). The entry is echoed as received, because dropping it would shift every later index.
- `urls: [' https://example.com/a ']` (padded) and `urls: ['https://example.com/a']` in the same batch → one row, second entry `created: false`. Dedup keys on the trimmed string (`input-validation` AC-06 + AC-07).
- Result order under partial failure → `results[i].url === urls[i]` for **every** `i`, checked over a batch whose failures are at positions 0, in the middle, and last. Off-by-one in the error path is the failure this pins.
- A batch of exactly one URL → `200` with a one-element array, not a bare object. The shape does not collapse at `n = 1`.

## Test data
- valid short: `https://example.com/1` … `https://example.com/120` (short enough that 101 of them stay far under 100 kB)
- valid, needing normalization: `'  https://example.com/pad  '`
- duplicate pair: `['https://example.com/dup', 'https://example.com/dup']`
- pre-existing: create `https://example.com/old`, then include it in a batch
- invalid, one per `ValidationError.reason`: `''` (`url required`), `42` (`url required`), `'not a url'` (`malformed url`), `'javascript:alert(1)'` (`unsafe scheme`), `'https://e.com/' + 'x'.repeat(2040)` (`url too long`)
- batch sizes: `0`, `1`, `100`, `101`
- oversized body: 50 URLs of exactly 2048 characters → expect `413`, not `400`
- delete: an existing code, an unknown code (`'nosuch'`), the literal path `'links'`, and a code with clicks on it

## NFR validation (load)
N/A for delete — one statement, one indexed primary-key match.

For bulk, the only number worth watching is the batch's 100 autocommitted inserts. `src/db.js` enables WAL, so each commit appends to the write-ahead log. Not measured as a problem at `n = 100` and not optimised: the obvious optimisation is a wrapping transaction, and that is precisely what destroys partial success (see the edge case above). If it ever needs fixing, the answer is a transaction around the *successful* inserts only, decided after the loop — not around the loop.

## CI placement
Unit in `tests/unit/bulk-and-delete.test.js` + integration in `tests/integration/bulk-and-delete.test.js`, both run by
`npm run test:fast` (per-task gate). E2E-through-UI in `tests/e2e/bulk-and-delete.spec.js`, run by
`npm run test:e2e` and included in `npm run gate`.
