---
id: T3
title: "App: 400 on invalid, 200 on dedup hit, 201 on new"
feature: input-validation
project: url-shortener
layer: app
deps: ["T2"]
acs: ["AC-01", "AC-02", "AC-03", "AC-04", "AC-05", "AC-06", "AC-07"]
files_hint: ["src/app.js"]
wave: 2
priority: Must
estimate: S
blocks: [T4, T5]
owner: "TBD"
status: todo
context_budget: "~3000 tokens"
created: 2026-07-09
spec_refs: ["§5 AC-01", "§5 AC-02", "§5 AC-07"]
sad_refs: ["§4 Solution strategy", "§6 Runtime view"]
openapi_paths: ["POST /api/shorten"]
adr_refs: ["ADR-0001"]
---

# T3 · Map the domain outcome to `400` / `200` / `201`

**Feature:** [input-validation](./_epic.md)
**Priority:** Must
**Estimate:** S
**Wave:** 2 (app)

## Position in the sequence

- **Blocked by:** T2 — the route reads `created` from `createLink` to choose between `201` and `200`, and catches the `ValidationError` T1 defined.
- **Blocks:** T4 (the frontend renders the `error` string this route produces), T5 (the integration suite drives this route).
- **Why this wave:** the only HTTP change in the feature. It must stay thin: three outcomes, three status codes, zero rules.

## Why (user story)

As a **visitor**, I want a clear refusal when my input is bad, and my existing code back when I resubmit the same URL, so that the service tells me what happened instead of failing silently or duplicating my link.

Spec US-01, US-02, US-03. This task is where all seven ACs become observable over HTTP.

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#6-runtime-view) — the full `invalid` / `already stored` / `new` fork
- 🗄  Data delta:   none — the route touches no SQL
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — `POST /api/shorten`: `201`, `200`, `400`
- 📜 Relevant ADR: [ADR-0001](../adr/0001-reject-at-edge-allowlist-schemes.md) — validation belongs to the domain; the route only translates its outcome
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01 … AC-07
- 🧬 Parity ref:   `GET /api/stats/:code` in `src/app.js` — the existing shape of `res.status(404).json({ error: 'not found' })`

## Data delta

```
NO DB CHANGES IN THIS TASK — src/app.js contains no SQL and must not gain any.
```

## API contract

```
POST /api/shorten
  Request:  { "url": "https://example.com/a" }

  Response:
    201 { code, short_url }   new link stored                (AC-01)
    200 { code, short_url }   url already stored — same code (AC-07)
    400 { error }             ValidationError.reason         (AC-02..AC-06)
                              error ∈ 'url required' | 'url too long'
                                    | 'malformed url' | 'unsafe scheme'

Unchanged: GET /:code · GET /api/links · GET /api/stats/:code
```

`short_url` is built exactly as today: `${req.protocol}://${req.get('host')}/${code}`.
A `200` carries the same body shape as a `201` — only the status distinguishes them.

## Acceptance criteria (GWT)

- [ ] **AC-t3-1 (new — AC-01):** Given an unseen valid URL, when `POST /api/shorten`, then `201` with `{ code, short_url }` and `short_url` ends in `code`.
- [ ] **AC-t3-2 (dedup — AC-07):** Given the same URL posted twice, when the second `POST` runs, then `200` with the **same** `code`, and `GET /api/links` still lists one link.
- [ ] **AC-t3-3 (empty — AC-02):** Given `{ "url": "" }` or `{}` (field absent), when `POST`, then `400 { error: 'url required' }` and `GET /api/links` is still empty.
- [ ] **AC-t3-4 (unsafe scheme — AC-03):** Given `{ "url": "javascript:alert(1)" }`, when `POST`, then `400 { error: 'unsafe scheme' }`, nothing stored.
- [ ] **AC-t3-5 (malformed — AC-04):** Given `{ "url": "not a url" }`, when `POST`, then `400 { error: 'malformed url' }`, nothing stored.
- [ ] **AC-t3-6 (too long — AC-05):** Given a 2049-character URL, when `POST`, then `400 { error: 'url too long' }`, nothing stored.
- [ ] **AC-t3-7 (trim — AC-06):** Given `{ "url": "  https://example.com/a  " }`, when `POST`, then `201`, and `GET /api/links` shows the URL without surrounding whitespace.
- [ ] **AC-t3-8 (no regression):** A malformed JSON body still yields `400 { error: 'bad request' }` from the error middleware, **not** `500` — the existing integration test asserts this and must keep passing.
- [ ] **AC-t3-9 (route stays thin):** `src/app.js` contains no scheme list, no length constant and no `URL` parsing. Grep proves it.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — RED: in `tests/integration/validation.test.js`, assert AC-t3-3 (`POST {"url": ""}` → `400 { error: 'url required' }`). Today it returns `201`, so the test fails on the status.
- [ ] Step 2 — In `src/app.js`, import `ValidationError` alongside `createLink` from `./shorten.js`.
- [ ] Step 3 — Wrap the `POST /api/shorten` body in `try`/`catch`. In the happy path destructure `const { code, created } = createLink(db, url)` and respond `res.status(created ? 201 : 200).json({ code, short_url })`.
- [ ] Step 4 — In the `catch`, handle exactly one type: `if (err instanceof ValidationError) return res.status(400).json({ error: err.reason });` then `throw err;`. Re-throwing is load-bearing — a swallowed unknown error would become a silent `400` and hide a real bug behind a client-error status.
- [ ] Step 5 — Delete the `// ⚠ Валідації НЕМА` comment above the route. It is now false.
- [ ] Step 6 — Grow the suite through AC-t3-4 → AC-t3-5 → AC-t3-6 → AC-t3-7 → AC-t3-2 → AC-t3-1, each red before green.
- [ ] Step 7 — Run `npm run test:fast`: `tests/integration/shorten.test.js` must pass **unmodified**, AC-t3-8 included.

## Edge cases

| Case | Behaviour |
|---|---|
| `{}` — no `url` field at all | `400 'url required'`. `req.body?.url` is `undefined`, and `validateUrl` rejects non-strings (T1, check 0). Without that check this path is a `TypeError` → `500`. |
| Malformed JSON in the body | `400 'bad request'`, produced by `express.json()` before the handler runs. The route never sees it. Do not "improve" this into `'malformed url'` — it is a different failure, at a different layer. |
| An unexpected exception inside `createLink` | Re-thrown, reaches the error middleware, becomes `500 'internal error'` and gets logged. Catching everything as `400` would be the single most damaging line in this task. |
| Dedup hit | `200`, not `201`. Getting this backwards still passes a naive AC-07 test (the code matches!) while the contract lies about a resource having been created. |
| `short_url` behind a proxy | Still built from `req.get('host')`, exactly as before. Trust-proxy handling is out of scope and unchanged by this task. |

## Definition of Done

- [ ] Every checklist step done; AC-t3-1 … AC-t3-9 green.
- [ ] `npm run test:fast` green; `npm run lint` clean.
- [ ] `tests/integration/shorten.test.js` and `tests/unit/shorten.test.js` pass **unmodified**.
- [ ] `grep -E "http:|https:|2048|new URL" src/app.js` returns nothing — no rule leaked into the route.
- [ ] The `catch` re-throws anything that is not a `ValidationError`.
- [ ] PR linked back to `tasks/T3-app-mapping.md`.
- [ ] `tracker.md` updated: status `done`.
