---
status: Accepted
owner: "genkovich"
reviewers: ["Tech Lead"]
updated_at: "2026-07-10"
feature_size: "S"
---

# Test plan — qr-codes

## Levels
| Level | Scope | Strategy |
|---|---|---|
| Unit | `renderQrSvg` — returns a Promise of an SVG string, deterministic for a given text, never echoes its input into the markup | pure function tests, no db, no HTTP |
| Integration | `GET /api/qr/:code` returns `200` + `image/svg+xml` + the cache header for a known code, `404` for an unknown one, and leaves `clicks` untouched | drive the service through supertest with a pinned `Host` header |
| E2E-through-UI | the QR button on a table row shows the picture, and showing it does not move the row's click count | drive the frontend with Playwright and read the rendered image and the clicks cell |

## AC coverage
| AC | Test name | Level | Expected outcome |
|---|---|---|---|
| AC-01 | known code renders an svg | Unit + Integration | `200`, `content-type` starts with `image/svg+xml`, body has an `<svg …>` root and closes it |
| AC-02 | the svg encodes the absolute short_url | Integration | body `===` `await renderQrSvg('http://sho.rt/<code>')`, and `!==` `await renderQrSvg('<code>')` |
| AC-03 | unknown code refused | Integration | `404 { error: 'not found' }`, no svg |
| AC-04 | expired link refused | Integration | `410 { error: 'gone' }` — **written only once `link-expiry` is shipped** |
| AC-05 | response is cacheable | Integration | `Cache-Control: public, max-age=31536000, immutable` |
| AC-06 | QR button shows the picture | E2E | an `<img>` for that row's code is visible and has loaded |
| AC-07 | a QR request is not a click | Integration + E2E | `GET /api/stats/:code` reports the same `clicks` before and after |

## Edge cases / error paths
- **`clicks` before and after.** The whole point of AC-07. Read `GET /api/stats/:code`, request the QR several times, read again. Measured groundwork: `getStats` is a bare `SELECT` — calling it twice leaves `clicks` at `0` — while `resolveLink` takes it `0 → 1 → 2`. A test that only asserts `200` and `image/svg+xml` passes against the broken implementation.
- **The naive payload.** A route that renders `renderQrSvg(code)` instead of the absolute URL still answers `200` with a perfectly valid, perfectly scannable QR — one that resolves to the string `kmnj8D9`. The only assertion that catches it compares the body against a known-good render of the *expected* text, and asserts it differs from a render of the bare code.
- **A forgotten `await`.** `renderQrSvg` returns a Promise. `res.send(promise)` answers `200` with the body `[object Promise]` and the media type `image/svg+xml`. Asserting the body contains `<svg` is what separates this from a green test.
- **A rejected render.** Stub `renderQrSvg` to reject and assert `500 { error: 'internal error' }`. Without the route's `try/catch` this test does not fail — it never finishes, because Express 4 never answers. Measured on `4.22.2`: the client aborts, and with no `unhandledRejection` listener the process dies first.
- **`Content-Type` equality.** `res.send()` on a string appends `; charset=utf-8`, so the header is `image/svg+xml; charset=utf-8`. Assert with a prefix match. A strict equality assertion tempts the next maintainer to switch to `res.end()`, which drops Express's ETag (`app.get('etag')` is `"weak"`) to make a test pass.
- **`/api/qr/abc.svg`.** Express captures the whole segment, so `req.params.code` is the literal `abc.svg` and the lookup misses: `404`. Worth a test, because a frontend that appends `.svg` "for the browser" breaks with a status code nobody will connect to the suffix.
- **`/api/qr/` and `/api/qr/a/b`.** Both `404`, from Express's own routing rather than from our handler. The code parameter is never empty, which is why `renderQrSvg('')` is unreachable from the route.
- **A percent-encoded slash.** `GET /api/qr/a%2Fb` reaches the handler with `req.params.code === 'a/b'` (measured). It is a primary-key lookup, so it answers `404` like any other unknown code. Nothing is interpolated into SQL or into a path.
- **The `Host` header pins the payload.** `req.protocol` is `http` and `req.get('host')` is whatever the client sent (`app.get('trust proxy')` is `false`, measured). Setting `Host: sho.rt` in the test makes the expected payload the constant `http://sho.rt/<code>` instead of an ephemeral port. Measured through the existing route: `POST /api/shorten` with `Host: sho.rt` returns `short_url: "http://sho.rt/4OTjgqA"`.
- **AC-04 is not written yet.** No link can expire until `link-expiry` ships, so a `410` test would assert a branch that does not exist. Add the test in the same commit that adds the branch, asserting the body string `gone` that `link-expiry` defines.

## Test data
- known code: whatever `POST /api/shorten` returns for `https://example.com/very/long`
- pinned host: `sho.rt` — makes the expected payload `http://sho.rt/<code>`
- unknown code: `nosuch1`
- suffixed code: `<code>.svg`
- payload probe (unit): `http://sho.rt/<script>alert(1)</script>` — must not appear verbatim in the returned markup
- determinism probe (unit): the same text rendered twice
- expected-payload control (integration): `renderQrSvg('http://sho.rt/' + code)` vs `renderQrSvg(code)`

## NFR validation (load)
N/A — one primary-key read and one in-process render per request, no I/O and no write. The `immutable` cache header means a browser that has the picture never asks again, so the interesting number (requests avoided) is not observable from the server.

## CI placement
Unit in `tests/unit/qr.test.js` + integration in `tests/integration/qr.test.js`, both run by
`npm run test:fast` (per-task gate). E2E-through-UI in `tests/e2e/qr.spec.js`, run by
`npm run test:e2e` and included in `npm run gate`.
