---
status: Accepted
owner: "genkovich"
reviewers: ["Tech Lead"]
updated_at: "2026-07-10"
feature_size: "S"
---

# Spec — qr-codes

> **Glossary:** link, code, short_url, click, expiry (see `docs/CONTEXT.md`).
> **Reference module / docs used:** `docs/architecture-map.md`, features `base-vertical`, `link-expiry`.

## 1. Context
`GET /api/qr/:code` already exists and already answers — with `501 {"error":"not implemented","feature":"qr-codes"}`. The route, its place above the catch-all, and the frontend's `501` message are all in place. This feature fills the hole.

A short URL is short so a human can type it. A QR code is so a human does not have to. The two live at different ends of the same use case: a link on a poster, a slide, a business card, a receipt. What we render is a *picture of the short URL* — not a new kind of link, not a new row, not a new column. Nothing about the domain changes.

Which is exactly why the feature is easy to get quietly wrong. The obvious implementation reaches for `resolveLink`, because the name fits and it is the function that turns a code into a link. It also increments `clicks` — verified by running it against `openDb(':memory:')`: two calls take the counter from `0` to `2`. Every time someone opened a QR image, a click would be recorded for a redirect that never happened. The status code would be `200`, the body would be a valid SVG, and every test anyone would think to write would pass.

## 2. Goals
- A visitor can fetch a QR code for any existing link, as an image, at a stable URL.
- The QR encodes the link's absolute short URL, so scanning it opens the link.
- The links table offers the QR for each row without leaving the page.

## 3. Non-goals
- PNG, JPEG, or a `data:` URL. SVG only (see ADR 0001).
- Choosing the size, colour, margin, error-correction level, or embedding a logo.
- A download button, a print sheet, or a "copy image" action.
- A QR of the *original* URL. The point of the feature is the short one.
- Server-side or CDN caching. The response carries cache headers; nothing stores the picture.
- Bulk QR generation for the whole table at once (see `bulk-and-delete` in `docs/roadmap.md`).

## 4. User stories
### US-01: Get a scannable picture of my short link
**As a** visitor
**I want** a QR code for a link I created
**So that** I can put it somewhere a phone camera can reach and nobody has to type the URL.

### US-02: Be refused clearly for a link that cannot be scanned
**As a** visitor
**I want** a distinct answer when the code does not exist, and when the link exists but has expired
**So that** I never print a QR that leads nowhere.

### US-03: Reach the QR from the links table
**As a** visitor
**I want** a QR button on each row of "Мої лінки"
**So that** I can see the code without composing an API request by hand.

## 5. Acceptance criteria
### AC-01 (US-01) — happy path
**Given** a code that belongs to an existing link
**When** the visitor requests its QR code
**Then** the service answers `200`, the response media type is `image/svg+xml`, and the body is an SVG document with an `<svg …>` root element that is closed.

### AC-02 (US-01) — happy path (what is encoded)
**Given** a link whose short URL is `{scheme}://{host}/{code}`
**When** its QR code is rendered
**Then** the encoded payload is that absolute short URL — the same string `POST /api/shorten` returns as `short_url` — and never the bare code.

### AC-03 (US-02) — error (unknown code)
**Given** a code that belongs to no link
**When** the visitor requests its QR code
**Then** the service answers `404 { error: 'not found' }` and renders nothing.

### AC-04 (US-02) — error (expired link)
**Given** a link whose lifetime has passed
**When** the visitor requests its QR code
**Then** the service answers `410 { error: 'gone' }` and renders nothing.

> This branch exists only once `link-expiry` is shipped. Until then no link has a lifetime, nothing can be expired, and the branch is not written and not tested. The condition, and its name, belong to [link-expiry](../link-expiry/spec.md): that feature introduces `expires_at` and decides what "expired" means. `qr-codes` only observes the condition, so it calls it what `link-expiry` calls it — `gone`. The adjective *expired* stays in prose; `gone` is the body string.

### AC-05 (NFR) — cacheability
**Given** any successful QR response
**When** the client inspects it
**Then** it carries `Cache-Control: public, max-age=31536000, immutable`.

### AC-06 (US-03) — ui
**Given** the links table holds at least one link
**When** the visitor activates the QR button on a row
**Then** the QR code for that row's link is displayed as an image on the page.

### AC-07 (domain invariant) — a QR request is not a click
**Given** a link with some number of clicks
**When** its QR code is requested any number of times
**Then** the click count is exactly what it was before.

> **Authorization:** N/A — single-visitor toy, no accounts. Anyone who knows a code can fetch its QR, exactly as anyone who knows a code can follow it.

## 6. Non-functional requirements
| Aspect | Target | Measurement |
|---|---|---|
| Media type | `image/svg+xml` | matched as a **prefix**, never by equality — see below |
| Cacheability | `public, max-age=31536000, immutable` | header asserted in the integration suite |
| Click counter | unchanged by any number of QR requests | `GET /api/stats/:code` read before and after |
| Encoded payload | byte-identical to `short_url` from `POST /api/shorten` | body compared against `renderQrSvg(<expected url>)` |
| Cost per request | one primary-key read, one render, zero writes | no `UPDATE`, no `INSERT` on this path |

Two facts drive the media-type rule, and both were measured against the Express version this repo installs (`4.22.2`, declared `^4.21.2`):

- **`res.type('svg')` resolves to `image/svg+xml`**, so the mapping needs no literal string in the route.
- **`res.send()` appends `; charset=utf-8` to the `Content-Type` of any string body**, even one set explicitly beforehand. The header on the wire is `image/svg+xml; charset=utf-8`. That is legal — SVG is text and the parameter is meaningful — but an assertion of strict equality against `image/svg+xml` fails. `res.end()` avoids the parameter and also skips Express's ETag (`app.get('etag')` is `"weak"` by default), so the cheap way to make a strict assertion pass is to silently give up conditional requests. Match the prefix instead.

## 6.1 Security / privacy
- Data classification: public URLs and public handles. The QR contains nothing the short URL does not.
- Personal data: none.
- AuthZ/AuthN impact: none.
- Abuse cases:
  - **Counter inflation** — `resolveLink` increments `clicks` (measured: `0 → 1 → 2` over two calls). A QR route built on it would let anyone inflate any link's click count by requesting an image, and the frontend would do it on every table render. Refused by construction: the route uses a non-mutating reader. AC-07 pins it.
  - **Host-header reflection** — `req.get('host')` is whatever the client sent. Measured through the existing route: `POST /api/shorten` with `Host: sho.rt` returns `short_url: "http://sho.rt/4OTjgqA"`. The QR is built from the same expression, so a poisoned `Host` yields a picture that points at another host. This is **pre-existing**, not introduced here: the same string already ships in every `201` body. Fixing it means a configured canonical base URL, applied to both routes in one commit. Out of scope; recorded in `sad.md` §11.
  - **Downgrade to `http` behind TLS termination** — `app.get('trust proxy')` is `false` by default (measured), so `req.protocol` is `http` even when the request arrives with `X-Forwarded-Proto: https` (measured: `{"protocol":"http","secure":false}`). A QR generated behind an HTTPS proxy encodes `http://…`. Same expression, same pre-existing defect, same fix.
  - **SVG as a script carrier** — an SVG served from our own origin can execute script if the browser is asked to *document*-load it. The payload here is assembled by the server from `req.protocol`, `req.get('host')` and `code`; no visitor-supplied body text reaches the renderer. The frontend must still display it through `<img src>` rather than an inline `<svg>` or an `<object>`. Whether `qrcode` can echo its input into the returned markup at all was **not** measured against this repo, so T1 pins it with a test instead of assuming it.
- Security review: N/A (single-visitor toy). The non-mutating reader is the security-relevant decision.

## 7. Metrics / KPIs
- QR requests per link: baseline 0 → observed (adoption of US-01).
- Share of links whose QR is ever fetched: observed.
- `404` rate on `/api/qr/*`: near 0 in normal use; a spike means the frontend is composing codes it should be reading from the table.
- Cache effectiveness: **not observable server-side.** `immutable` means a browser that has the picture does not ask again, so a falling request count is the feature working, not the feature failing. There is no server-side cache to hit.

## 8. Open questions
- [ ] None blocking. The `410` body string was settled in favour of `{ error: 'gone' }`, matching `link-expiry`: that feature owns the expiry condition — it introduces `expires_at` and defines what an expired link is — and a feature that merely observes a condition does not get to rename it (AC-04, `sad.md` §11). The dependency, the module boundary and the SVG-over-PNG choice are settled in ADR 0001; the cache header and its interaction with expiry are settled in §6 and `sad.md` §11.
