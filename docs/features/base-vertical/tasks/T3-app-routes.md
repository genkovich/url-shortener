---
id: T3
title: "App routes: shorten, follow, list, stats"
feature: base-vertical
project: url-shortener
layer: app
deps: ["T2"]
acs: ["AC-01", "AC-02", "AC-03"]
files_hint: ["src/app.js"]
wave: 3
priority: Must
estimate: S
blocks: [T4, T5]
owner: "genkovich"
status: done
context_budget: "~2500 tokens"
created: 2026-07-08
spec_refs: ["§5 AC-01", "§5 AC-02", "§5 AC-03"]
sad_refs: ["§5 Building block view", "§6 Runtime view"]
openapi_paths: ["POST /api/shorten", "GET /{code}", "GET /api/links", "GET /api/stats/{code}"]
adr_refs: []
---

# T3 · Express routes over the domain

**Feature:** [base-vertical](./_epic.md)
**Priority:** Must
**Estimate:** S
**Wave:** 3 (app)

> **Shipped.** Worked example — the sections below describe `src/app.js` as it exists.

## Position in the sequence

- **Blocked by:** T2 — the routes delegate; there is nothing to delegate to before it.
- **Blocks:** T4 (the frontend calls these routes), T5 (the integration suite drives them).
- **Why this wave:** the last layer that can still be tested without a browser. `createApp(db)` is the seam the whole integration suite hangs on.

## Why (user story)

As a **visitor**, I want the browser to reach the shortener over plain HTTP, so that shortening, following and listing are things I can actually do.

Spec US-01, US-02, US-03. AC-01 (create), AC-02 (redirect + count), AC-03 (stats for an unknown code report not found).

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#6-runtime-view)
- 🗄  Data delta:   none — `src/app.js` contains no SQL
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — all four operations
- 📜 Relevant ADR: none
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01, AC-02, AC-03
- 🧬 Parity ref:   none — this file *is* the precedent: `createApp(db)` as a factory, so tests can inject `openDb(':memory:')`

## Data delta

```
NO SCHEMA CHANGE, and no SQL in this layer. Every query lives in src/shorten.js.
```

## API contract

```
POST /api/shorten        { url }        -> 201 { code, short_url }
GET  /:code                             -> 302 Location: <original url>, click counted
                                        -> 404 { error: 'not found' }
GET  /api/links                         -> 200 [ { code, url, created_at, clicks } ]
GET  /api/stats/:code                   -> 200 { code, clicks, created_at }
                                        -> 404 { error: 'not found' }
GET  /healthz                           -> 200 { ok: true }

Stubs, answering 501 { error: 'not implemented', feature } until their feature ships:
GET    /metrics          -> feature 'metrics'
GET    /api/qr/:code     -> feature 'qr-codes'
DELETE /api/:code        -> feature 'bulk-and-delete'

Error middleware (last): status >= 500 -> { error: 'internal error' } and log;
otherwise -> { error: 'bad request' }. A malformed JSON body stays a 400, never a 500.
```

## Acceptance criteria (GWT)

- [x] **AC-t3-1 (create — AC-01):** Given a URL, when `POST /api/shorten`, then `201` and `short_url` ends with the returned 7-character `code`.
- [x] **AC-t3-2 (follow — AC-02):** Given a stored code, when `GET /:code`, then `302` with `Location` set to the original URL, and `GET /api/stats/:code` reports one more click.
- [x] **AC-t3-3 (unknown stats — AC-03):** Given an unknown code, when `GET /api/stats/:code`, then `404 { error: 'not found' }`.
- [x] **AC-t3-4 (unknown follow — AC-03):** Given an unknown code, when `GET /:code`, then `404 { error: 'not found' }` in the canonical error shape — not an Express HTML page.
- [x] **AC-t3-5 (route order):** Given `GET /api/links`, when it is requested, then the catch-all `GET /:code` does **not** handle it. Every `/api/*` route is declared above the catch-all.
- [x] **AC-t3-6 (broken body stays a client error):** Given `content-type: application/json` and the body `{"url": broken`, when `POST /api/shorten`, then `400 { error: 'bad request' }` — `express.json()` throws with `status: 400`, and the error middleware must preserve it rather than collapse it to `500`.
- [x] **AC-t3-7 (injectable db):** `createApp(db)` takes the handle as an argument, so a test can pass `openDb(':memory:')` and never touch the filesystem.

## Checklist (atomic steps for impl-agent)

- [x] Step 1 — `createApp(db)` returns an Express app; `express.json()` and `express.static(public/)` first.
- [x] Step 2 — `GET /healthz` — the e2e webServer polls it, and it is the redirect target the smoke test uses so no test leaves the machine.
- [x] Step 3 — The four domain routes, each a single call into `src/shorten.js` plus a status code.
- [x] Step 4 — The `501` stubs, each naming the feature that will replace it.
- [x] Step 5 — `GET /:code` **last**, after every `/api/*` route.
- [x] Step 6 — Error middleware with four parameters: `status = err.status ?? err.statusCode ?? 500`; log only `>= 500`.

## Edge cases

| Case | Behaviour |
|---|---|
| `GET /api/links` vs catch-all `GET /:code` | Express matches in declaration order. Put the catch-all first and `/api/links` becomes a lookup for a link whose code is `"api"`. This is the one ordering bug that produces a plausible `404` instead of a crash — hence the hard rule in `docs/architecture-map.md`. |
| Malformed JSON body | `express.json()` throws an error carrying `status: 400`. The middleware honours it. Defaulting everything to `500` would turn a client typo into a fake outage. |
| Unhandled exception in a route | `status >= 500`, so it is logged and answered as `{ error: 'internal error' }`. The stack trace never reaches the response body. |
| `res.redirect(302, url)` with a hostile URL | Possible today — there is no validation. That is the entire reason feature `input-validation` exists, and why its spec calls this an open-redirect footgun. Not fixed here, deliberately (spec §3, Non-goals). |
| `short_url` behind a reverse proxy | Built from `req.protocol` and `req.get('host')`. Behind a proxy without `trust proxy` this yields `http` and the internal host. Out of scope for a single-process toy. |
| Static files vs `GET /:code` | `express.static` runs first, so a code that collides with a file name in `src/public/` (`app.js`, `style.css`, `index.html`) would serve the file. base62 codes are 7 characters, so no collision is possible. |

## Definition of Done

- [x] Every checklist step done; AC-t3-1 … AC-t3-7 green.
- [x] `npm run test:fast` green; `npm run lint` clean.
- [x] No SQL and no domain rule in `src/app.js`.
- [x] Every `/api/*` route is declared above `GET /:code`.
- [x] PR linked back to `tasks/T3-app-routes.md`.
- [x] `tracker.md` updated: status `done`.
