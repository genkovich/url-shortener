---
id: T2
title: "App: GET /api/qr/:code — svg body, content-type, cache header, 404/410"
feature: qr-codes
project: url-shortener
layer: app
deps: ["T1"]
acs: ["AC-01", "AC-02", "AC-03", "AC-04", "AC-05", "AC-07"]
files_hint: ["src/app.js"]
wave: 2
priority: Must
estimate: S
blocks: [T3, T4]
owner: "TBD"
status: todo
context_budget: "~2500 tokens"
created: 2026-07-10
spec_refs: ["§5 AC-01", "§5 AC-03", "§5 AC-05", "§5 AC-07", "§6 Non-functional requirements"]
sad_refs: ["§4 Solution strategy", "§6 Runtime view", "§10 QG-1"]
openapi_paths: ["GET /api/qr/{code}"]
adr_refs: ["ADR-0001"]
---

# T2 · The route: an SVG, a cache header, and no click

**Feature:** [qr-codes](./_epic.md)
**Priority:** Must
**Estimate:** S
**Wave:** 2 (app)

## Position in the sequence

- **Blocked by:** T1 — there is nothing to `await`, and no dependency, before it.
- **Blocks:** T3 (the button needs a URL that answers), T4 (the suite drives it).
- **Why this wave:** the only HTTP change in the feature. It replaces one existing handler body, adds one header, and introduces the first `async` route in this codebase — which is where its whole risk lives.

## Why (user story)

As a **visitor**, I want `GET /api/qr/<my code>` to answer with a scannable picture, and to say plainly when the code is unknown, so that I never print a QR that leads nowhere.

Spec US-01, US-02. AC-01 (svg body), AC-02 (it encodes the absolute short URL), AC-03 (`404`), AC-04 (`410`, gated), AC-05 (cache header), AC-07 (`clicks` untouched).

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#6-runtime-view) — probe, render, send; and where the rejection goes
- 🗄  Data delta:   none — `src/app.js` contains no SQL and must not gain any
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — `GET /api/qr/{code}`: `200` / `404` / `410`, and the `Cache-Control` header
- 📜 Relevant ADR: [ADR-0001](../adr/0001-qrcode-dependency.md) — why the body is SVG text rather than a base64 PNG, and why `qrcode` is reached through `src/qr.js`
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01 … AC-05, AC-07
- 🧬 Parity ref:   `POST /api/shorten` in `src/app.js` — its `short_url` expression is the one this route must reuse character for character; and `GET /api/stats/:code`, the existing route that reads without counting

## Data delta

```
NO DB CHANGES IN THIS TASK — src/app.js contains no SQL and must not gain any.

The store is read through the EXISTING non-mutating reader:

  getStats(db, code)   -> { code, clicks, created_at } | null      SELECT only
  resolveLink(db, code)-> row, AND `UPDATE links SET clicks = clicks + 1`   ⛔ NOT HERE

Measured against openDb(':memory:'):
  getStats twice     -> clicks stays 0
  resolveLink twice  -> clicks goes 0 -> 1 -> 2

The payload is built from the REQUEST, never from links.url:

  `${req.protocol}://${req.get('host')}/${code}`      -- identical to src/app.js:25

That is why getStats' narrow projection (code, clicks, created_at — no `url`) is
enough today. It is also why it will NOT be enough for AC-04: it does not select
`expires_at`. See Edge cases.
```

## API contract

```
GET /api/qr/{code}

  -> 200  image/svg+xml                                   known code            (AC-01, AC-02)
          Cache-Control: public, max-age=31536000, immutable                    (AC-05)
          body: the SVG, encoding `{scheme}://{host}/{code}`
  -> 404  { error: 'not found' }                          unknown code          (AC-03)
  -> 410  { error: 'gone' }                               expired link          (AC-04)
          ⚠ ONLY once link-expiry ships. Not written, not tested, until then.
          The string is `gone` because link-expiry names the condition, not this feature.
  -> 500  { error: 'internal error' }                     the render rejected

Unchanged: GET /:code · GET /api/links · GET /api/stats/:code · POST /api/shorten.
`clicks` is not written on any branch of this route.
```

The route keeps its current position: the `501` stub is already declared above the catch-all `GET /:code`, inside the "ЗАГЛУШКИ" block of `src/app.js`. Only its body changes. Do not cite a line number for it — `src/app.js` moves.

## Acceptance criteria (GWT)

- [ ] **AC-t2-1 (svg for a known code — AC-01):** Given a link created through `POST /api/shorten`, when `GET /api/qr/<code>`, then `200`, the `content-type` **starts with** `image/svg+xml`, and the body contains `<svg`.
- [ ] **AC-t2-2 (the absolute short URL — AC-02):** Given the request carries `Host: sho.rt`, when `GET /api/qr/<code>`, then the body equals `await renderQrSvg('http://sho.rt/' + code)` and differs from `await renderQrSvg(code)`. `req.protocol` is `http` because `trust proxy` is `false` (measured), so the expected payload is a constant, not an ephemeral port.
- [ ] **AC-t2-3 (unknown code — AC-03):** Given a code no link owns, then `404 { error: 'not found' }`, and the body is JSON, not an SVG.
- [ ] **AC-t2-4 (cache header — AC-05):** Given any `200` from this route, then `Cache-Control` is exactly `public, max-age=31536000, immutable`. Given the `404`, then no `Cache-Control` is set — a refusal must never be cached for a year.
- [ ] **AC-t2-5 (a QR is not a click — AC-07):** Given a link with `clicks === N`, when its QR is requested three times, then `GET /api/stats/<code>` still reports `N`. Assert the counter, not the status.
- [ ] **AC-t2-6 (a rejected render answers — QG-3):** Given `renderQrSvg` rejects, when the route is driven, then the client receives `500 { error: 'internal error' }` from the existing error middleware. Without the `try/catch` this test does not fail; it never finishes.
- [ ] **AC-t2-7 (the route stays thin):** `src/app.js` contains no `QRCode`, no `SELECT`, and no QR option. `grep -nE "QRCode|SELECT|errorCorrection" src/app.js` returns nothing. The only new import is `renderQrSvg` from `./qr.js`.
- [ ] **AC-t2-8 (no regression):** `GET /:code` still redirects and still counts a click; `GET /metrics` and `DELETE /api/:code` still answer `501`; the existing integration suite passes unmodified.
- [ ] **AC-t2-9 (`410` is absent, deliberately):** Until `link-expiry` is shipped, `src/app.js` contains no `410` on this route and no reference to `expires_at`. A branch that cannot be reached cannot be tested, and an untested branch in a read path is worse than a missing one.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — RED: in `tests/integration/qr.test.js`, assert AC-t2-1. Today the route answers `501 {"error":"not implemented","feature":"qr-codes"}` (verified by driving `createApp(openDb(':memory:'))`), so it fails on the status.
- [ ] Step 2 — In `src/app.js`, import `renderQrSvg` from `./qr.js`, and `getStats` is already imported. Do **not** import `resolveLink` for this route; it is already imported for `GET /:code`, which is precisely why the mistake is one character away.
- [ ] Step 3 — Delete `app.get('/api/qr/:code', notImplemented('qr-codes'));` and write the handler in its place. Same line, same position above the catch-all. Leave the `notImplemented` helper and its two other users alone.
- [ ] Step 4 — The handler, in order: `if (!getStats(db, req.params.code)) return res.status(404).json({ error: 'not found' });` → build the absolute URL with the expression from **Data delta** → `try { const svg = await renderQrSvg(url); res.type('svg').set('Cache-Control', 'public, max-age=31536000, immutable').send(svg); } catch (err) { next(err); }`. Add `next` to the handler signature; it is the only reason it is there.
- [ ] Step 5 — Grow the suite through AC-t2-3 → AC-t2-4 → AC-t2-2 → AC-t2-5 → AC-t2-6, each red before green. AC-t2-2 needs `.set('Host', 'sho.rt')` on the supertest request; verified to work — `POST /api/shorten` with that header returns `short_url: "http://sho.rt/<code>"`.
- [ ] Step 6 — Prove AC-t2-6 the honest way *once*: comment out the `try/catch`, make `renderQrSvg` reject, and run the test. It will not report a failure — it will hang, or the process will die. Then restore the `try/catch`. A test whose failure mode you have not seen is not a test.
- [ ] Step 7 — Prove AC-t2-5 the honest way *once*: swap `getStats` for `resolveLink` and run the suite. Only AC-t2-5 goes red; AC-t2-1, AC-t2-2 and AC-t2-4 all stay green, because the SVG is perfect and the counter is silently wrong. Then swap it back.
- [ ] Step 8 — Run `npm run test:fast`. The seed suites must pass unmodified.

## Edge cases

| Case | Behaviour |
|---|---|
| `resolveLink` instead of `getStats` | The bug this task exists to prevent. `resolveLink` increments `clicks` (`src/shorten.js:32-37`; measured `0 → 1 → 2`), and its name is the one that fits "turn a code into a link". Every QR request would count as a follow, and the frontend would fire one per row on every table render. Nothing about the response would look wrong. AC-t2-5 and Step 7 are the only things standing between this feature and a click counter that means nothing. |
| An `async` handler without `try/catch` | Express 4 routes a **synchronous** `throw` to the error middleware; it never inspects the promise an `async` handler returns. Measured on `4.22.2` — the version installed — with `async () => { throw ... }`: no response is written, the client aborts, and with no `unhandledRejection` listener Node's default kills the process first. Not a `500`. Not a slow `500`. Nothing. Express 5 fixed it; `package.json` declares `^4.21.2`. |
| `res.send(renderQrSvg(url))` | `200`, `image/svg+xml`, `Cache-Control` present, body `[object Promise]`. Every header assertion passes. Only AC-t2-1's `<svg` check and AC-t2-2's body comparison catch it. |
| Encoding the bare code | `renderQrSvg(code)` yields a valid, scannable QR whose payload is `kmnj8D9`. A camera opens nothing. AC-t2-2's negative control — the body must *differ* from a render of the bare code — is what makes the positive assertion mean something. |
| `Content-Type` asserted by equality | `res.send()` appends `; charset=utf-8` to any string body's `Content-Type`, even one set explicitly beforehand (measured). The wire header is `image/svg+xml; charset=utf-8`, which is correct HTTP. The trap is the fix: switching to `res.setHeader` + `res.end` produces the exact string *and* silently drops Express's ETag (`app.get('etag')` is `"weak"` by default), so conditional requests stop working to satisfy an assertion. Match the prefix. |
| `Cache-Control` on the `404` | Never. `immutable` for a year on "this code does not exist" would poison the browser for a code created five minutes later. The header goes on the `200` branch only — set it next to `send(svg)`, not at the top of the handler. |
| `immutable` on a link that expires tomorrow | Accepted, and worth saying out loud. What is cached is an **image**, not a permission. A stale QR still resolves through `GET /:code`, which is where `link-expiry` enforces expiry and answers `410`. The visitor sees a picture and then sees the refusal. The alternative — a short `max-age` — would cache-bust a picture that provably cannot change while the code exists (`docs/CONTEXT.md`: a code maps to exactly one address for its lifetime). |
| `getStats` cannot serve AC-04 | Measured: it runs `SELECT code, clicks, created_at`, and its rows carry exactly those three keys. No `url` — irrelevant, since the payload comes from the request. No `expires_at` — decisive. When `link-expiry` lands, this branch needs a wider non-mutating reader: widen `getStats`, or add `findLink(db, code)` returning `SELECT *`. That pulls `src/shorten.js` into this task's file set *at that point*. Do not pre-build it, and do not reach for `resolveLink` because it happens to return the whole row. |
| The `410` body string | `gone`, not `expired`. `link-expiry` introduces `expires_at` and decides what an expired link is; this route only observes that condition, so it uses that feature's name for it. Inventing a synonym would give one condition two names and force every client to know both. If `link-expiry` renames it, this route changes with it. |
| `/api/qr/abc.svg` | `404`. Express captures the whole path segment, so `req.params.code` is the literal `abc.svg` (measured). Harmless here, and a landmine for T3: a frontend that appends `.svg` "so the browser knows" gets a `404` nobody will attribute to the suffix. |
| `/api/qr/a%2Fb` | Reaches the handler with `req.params.code === 'a/b'` (measured). It is a primary-key lookup, so it answers `404` like any other unknown code. Nothing is interpolated into SQL, and nothing is joined onto a filesystem path. |
| `Host` and `X-Forwarded-Proto` | `req.get('host')` is whatever the client sent, and `app.get('trust proxy')` is `false`, so `req.protocol` is `http` even behind a TLS terminator (both measured). The QR inherits both from the `short_url` expression it copies — it does not introduce them. Fixing them means a configured canonical base URL applied to `POST /api/shorten` in the same commit, or the picture and the API start disagreeing. Out of scope; see [sad.md](../sad.md#11-risks-and-technical-debt). |
| Route order | Already correct: the stub sits above `GET /:code`. Move it below and the catch-all swallows `/api/qr/x`, resolving a link whose code is `api` — and counting a click. |

## Definition of Done

- [ ] Every checklist step done; AC-t2-1 … AC-t2-9 green.
- [ ] `npm run test:fast` green; `npm run lint` clean.
- [ ] The handler is `async` **and** every `await` in it sits inside a `try/catch` whose `catch` calls `next(err)`.
- [ ] `resolveLink` does not appear anywhere in the QR route, and `GET /api/stats/<code>` reports the same `clicks` before and after three QR requests.
- [ ] The body is compared against a render of the expected absolute URL, and against a render of the bare code as a negative control.
- [ ] `Cache-Control` is present on the `200` and absent on the `404`.
- [ ] Step 6 and Step 7 were actually run, and each showed the failure mode described.
- [ ] `tests/integration/shorten.test.js` and `tests/unit/shorten.test.js` pass **unmodified**; `GET /:code` was not touched.
- [ ] PR linked back to `tasks/T2-qr-route.md`.
- [ ] `tracker.md` updated: status `done`.
