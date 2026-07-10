---
id: T3
title: "App: routes — 204/404 delete, 200/400 bulk, and the DELETE order rule"
feature: bulk-and-delete
project: url-shortener
layer: app
deps: ["T1", "T2"]
acs: ["AC-01", "AC-02", "AC-03", "AC-04", "AC-05", "AC-06", "AC-07"]
files_hint: ["src/app.js"]
wave: 2
priority: Must
estimate: S
blocks: [T4, T5]
owner: "TBD"
status: todo
context_budget: "~3000 tokens"
created: 2026-07-10
spec_refs: ["§5 AC-01", "§5 AC-02", "§5 AC-03", "§5 AC-04", "§5 AC-05", "§6 Non-functional requirements"]
sad_refs: ["§4 Solution strategy", "§6 Runtime view", "§8 Crosscutting concepts", "§10 QG-4"]
openapi_paths: ["POST /api/shorten/bulk", "DELETE /api/{code}"]
adr_refs: ["ADR-0001"]
---

# T3 · Two routes, and the one place their order matters

**Feature:** [bulk-and-delete](./_epic.md)
**Priority:** Must
**Estimate:** S
**Wave:** 2 (app)

## Position in the sequence

- **Blocked by:** T1 (the boolean that becomes `204`/`404`) and T2 (`BulkError` and the result array). Both, not either.
- **Blocks:** T4 (the frontend calls both routes), T5 (the integration suite drives them).
- **Why this wave:** the only HTTP change in the feature, and the only architectural act: deciding **where** `DELETE /api/:code` is declared.

## Why (user story)

As a **visitor**, I want deleting a link to succeed quietly and to tell me plainly when there was nothing to delete, and I want a batch to answer once, with one verdict per URL I sent.

Spec US-01, US-02. AC-01 … AC-07 all become observable over HTTP here. AC-08 stays a domain invariant and is proved in T1 and T5.

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#6-runtime-view) — both diagrams; the guards fire before the route sees a row
- 🗄  Data delta:   none — `src/app.js` contains no SQL and must not gain any
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — `DELETE /api/{code}`: `204` / `404`; `POST /api/shorten/bulk`: `200` / `400` / `413`
- 📜 Relevant ADR: [ADR-0001](../adr/0001-hard-delete.md) — because delete is hard, the route has no `deleted_at` to hide and no undo to offer
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01 … AC-07
- 🧬 Parity ref:   the `501` stub at `src/app.js:44` — `app.delete('/api/:code', notImplemented('bulk-and-delete'))` is this task's *predecessor*, not its neighbour. It is deleted, not left beside the real route.

## Data delta

```
NO DB CHANGES IN THIS TASK — src/app.js contains no SQL and must not gain any.
```

## API contract

```
DELETE /api/:code

  Response:
    204  (no body, no content-type)   deleteLink returned true          (AC-01)
    404  { error: 'not found' }       deleteLink returned false         (AC-02)

POST /api/shorten/bulk    { urls: string[] }

  Response:
    200  [ { url, code, created } | { url, error } ]   one entry per input entry,
                                                       in input order            (AC-03, AC-06, AC-07)
    400  { error: 'no urls' }        urls absent, not an array, or empty         (AC-05)
    400  { error: 'too many urls' }  more than 100 entries; nothing written      (AC-04)
    413  { error: 'bad request' }    body over express.json()'s 100 kB limit —
                                     produced by the parser and the existing
                                     error middleware, NOT by this route

Unchanged: POST /api/shorten · GET /:code · GET /api/links · GET /api/stats/:code
```

`BulkError.reason` → `400` for both values. Map on `reason`, never on the message text.
`200`, not `207 Multi-Status`: the reasoning is in [sad.md](../sad.md#4-solution-strategy).

### Route order — the whole architectural content of this task

```
app.post('/api/shorten', …)
app.post('/api/shorten/bulk', …)   ← needs NO ordering care. Measured: /api/shorten is a
                                     literal path and does not match a longer one, and an
                                     Express path parameter never spans '/'. Registered
                                     alone, POST /api/shorten/bulk answers 404.

  …every literal DELETE /api/<name> route goes HERE, above the next line…

app.delete('/api/:code', …)        ← matches ANY single-segment path under /api.
                                     Measured on today's code: the 501 stub already answers
                                     DELETE /api/links with { error: 'not implemented' }.

app.get('/:code', …)               ← stays last (architecture-map, Route order)
```

## Acceptance criteria (GWT)

- [ ] **AC-t3-1 (delete succeeds — AC-01):** Given a link under `abc`, when `DELETE /api/abc`, then `204`, an **empty** response body, `GET /abc` → `404`, and `abc` is absent from `GET /api/links`.
- [ ] **AC-t3-2 (delete of an unknown code — AC-02):** Given no such link, when `DELETE /api/nosuch`, then `404 { error: 'not found' }`.
- [ ] **AC-t3-3 (second delete — AC-02):** Given `abc` was just deleted, when `DELETE /api/abc` again, then `404`, not `204`. Deliberate: see **Edge cases**.
- [ ] **AC-t3-4 (`DELETE /api/links` reaches the param route):** `404 { error: 'not found' }` — the same answer as any unknown code, because `code = "links"`. This test pins today's behaviour; it cannot prevent a future literal route from being added below.
- [ ] **AC-t3-5 (bulk happy path — AC-03):** Given `{ urls: [u1, u2, u3] }` all valid, when `POST /api/shorten/bulk`, then `200`, `body.length === 3`, and `body[i].url === urls[i]` for each `i`.
- [ ] **AC-t3-6 (bulk over the limit — AC-04):** Given 101 **short** URLs, then `400 { error: 'too many urls' }` and `GET /api/links` returns exactly what it returned before. Short, because 101 long ones never reach the route (see **Edge cases**).
- [ ] **AC-t3-7 (empty batch — AC-05):** `{ urls: [] }` → `400 { error: 'no urls' }`. So do `{}`, `{ urls: null }` and `{ urls: 'https://x' }`.
- [ ] **AC-t3-8 (partial success — AC-06):** Given `{ urls: ['https://a.example', 'not a url', 'https://b.example'] }`, then `200`; `body[1]` has `error` and no `code`; and `GET /api/links` shows two links.
- [ ] **AC-t3-9 (dedup — AC-07):** Given the same URL twice in one batch, then `body[0].created === true`, `body[1].created === false`, both codes equal, and `GET /api/links` shows one link.
- [ ] **AC-t3-10 (routes stay thin):** `src/app.js` holds no SQL, no batch limit and no URL rule. `grep -nE "SELECT|INSERT|DELETE FROM|MAX_BULK_URLS|validateUrl" src/app.js` returns nothing.
- [ ] **AC-t3-11 (the stub is gone):** `grep -n "bulk-and-delete" src/app.js` returns nothing. `notImplemented` survives only for `/metrics` and `/api/qr/:code`.
- [ ] **AC-t3-12 (no regression):** A malformed JSON body still yields `400 { error: 'bad request' }`; `POST /api/shorten` is unchanged; `GET /:code` still redirects. The existing suites pass unmodified.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — RED: in `tests/integration/bulk-and-delete.test.js`, assert AC-t3-1. Today the route answers `501`, so it fails on the status.
- [ ] Step 2 — In `src/app.js`, import `deleteLink`, `createLinksBulk` and `BulkError` beside `createLink`.
- [ ] Step 3 — Add `app.post('/api/shorten/bulk', …)` directly under `app.post('/api/shorten', …)`. Read `const { urls } = req.body ?? {}` and pass it straight through. Do not pre-filter, do not count, do not trim — T2 owns every decision about the array.
- [ ] Step 4 — Wrap the call: `try { res.json(createLinksBulk(db, urls)); } catch (err) { if (err instanceof BulkError) return res.status(400).json({ error: err.reason }); throw err; }`. `res.json(array)` sends `200` and a top-level array, matching `GET /api/links`.
- [ ] Step 5 — **Delete** the line `app.delete('/api/:code', notImplemented('bulk-and-delete'));` from the stub block. Do not leave it beside the real route "for reference".
- [ ] Step 6 — Add `app.delete('/api/:code', …)` **below every `/api/*` route and above `GET /:code`**. Body: `return deleteLink(db, req.params.code) ? res.status(204).end() : res.status(404).json({ error: 'not found' });`
- [ ] Step 7 — Write the comment above it, in the file, in the same voice as the existing `// --- Redirect (тримати ПІСЛЯ /api/*…)` note: this route matches **any** single-segment path under `/api`, so a literal `DELETE /api/<name>` must be declared above it.
- [ ] Step 8 — Use `res.status(204).end()`, never `.json(…)`. A `204` discards its body silently (measured), so `.json()` would compile, pass a status-code test, and quietly send nothing.
- [ ] Step 9 — Grow the suite through AC-t3-2 → AC-t3-3 → AC-t3-4 → AC-t3-7 → AC-t3-6 → AC-t3-8 → AC-t3-9 → AC-t3-5, each red before green.
- [ ] Step 10 — Verify by hand once: `curl -i -X DELETE localhost:3000/api/<code>` shows `204` with no `Content-Type` and no body, and `curl -i -X DELETE localhost:3000/api/links` shows `404`. The second is the finding worth seeing.
- [ ] Step 11 — Run `npm run test:fast`. The seed suites must pass unmodified.

## Edge cases

| Case | Behaviour |
|---|---|
| `res.status(204).json({ ok: true })` | Sends `204` with **no body and no `content-type`** (measured). The object vanishes. It is not an error, it is not a warning, and no test that checks only the status will notice. Use `.end()`. |
| Second `DELETE` of the same code | `404`, not `204`. A deliberate choice about the *response*, not a breach of idempotency: RFC 9110 defines an idempotent method by its effect on the server, and the effect is the same — no row. Answering `204` twice would give a uniform response and lose the only signal that says "that code was never there". A caller who wants the uniform behaviour can treat `404` as success; a caller who wants the signal cannot invent it. |
| `DELETE /api/links` | `404 { error: 'not found' }` — swallowed by `:code`. Measured on today's code, the `501` stub already answers it with `{"error":"not implemented","feature":"bulk-and-delete"}`. When bulk delete is built, its literal route must go **above** this one. AC-t3-4 pins the current answer, and will go red if the route is added above — which is the correct place. Added below, it stays green and the bug ships. Nothing can test that away; hence Step 7's comment. |
| `POST /api/shorten/bulk` shadowed by `POST /api/shorten` | It is not, and the belief that it is is the reason this row exists. Measured (express 4.22.2): with only `POST /api/shorten` registered, `POST /api/shorten/bulk` answers `404`; a literal path does not match a longer one, and `:code` never spans `/`. Do not "fix" the order. |
| `DELETE /api/shorten/bulk` | `404` from Express, no route matched — two segments, and `:code` is one. |
| 101 URLs of 2048 characters | `413 { error: 'bad request' }`, produced by `express.json()` and the existing error middleware **before this route runs**. Measured: the ceiling falls between 49 URLs (100 509 bytes) and 50 (102 560 bytes). An integration test for `too many urls` must therefore use short URLs, or it asserts `400` against a `413` and fails for a reason that has nothing to do with the limit it is testing. |
| `res.json(array)` for the batch | A top-level JSON array, `200`. Matches `GET /api/links`, which already returns one. The *request* takes `{ urls }` rather than a bare array so that a later option (a TTL, a prefix) does not have to change the shape of the request. |
| A `catch` around `createLinksBulk` that swallows everything | The route's `catch` re-throws anything that is not a `BulkError`, exactly as `input-validation` T3's `catch` re-throws anything that is not a `ValidationError`. Extend that block; do not open a second `try`. |
| `DELETE /api/` (no segment) | `404` from Express — no route matched (measured). `req.params.code` is therefore always a non-empty string, and the route needs no guard. |

## Definition of Done

- [ ] Every checklist step done; AC-t3-1 … AC-t3-12 green.
- [ ] `npm run test:fast` green; `npm run lint` clean.
- [ ] `app.delete('/api/:code', …)` is declared **below every literal `/api` route** and **above** `app.get('/:code', …)`, and carries the comment from Step 7 explaining why.
- [ ] `grep -n "204" src/app.js` shows `.end()`, never `.json(`.
- [ ] `grep -n "notImplemented('bulk-and-delete')" src/app.js` returns nothing.
- [ ] `tests/integration/shorten.test.js` and `tests/unit/shorten.test.js` pass **unmodified**.
- [ ] The `catch` still re-throws anything that is neither `ValidationError` nor `BulkError`.
- [ ] PR linked back to `tasks/T3-routes.md`.
- [ ] `tracker.md` updated: status `done`.
