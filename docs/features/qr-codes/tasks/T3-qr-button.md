---
id: T3
title: "Frontend: QR button in the links table"
feature: qr-codes
project: url-shortener
layer: ui
deps: ["T2"]
acs: ["AC-06"]
files_hint: ["src/public/app.js", "src/public/index.html", "src/public/style.css"]
wave: 3
priority: Should
estimate: S
blocks: [T5]
owner: "TBD"
status: todo
context_budget: "~2000 tokens"
created: 2026-07-10
spec_refs: ["§4 US-03", "§5 AC-06", "§6.1 Security / privacy"]
sad_refs: ["§5 Building block view"]
openapi_paths: []
adr_refs: []
---

# T3 · The QR button on a links-table row

**Feature:** [qr-codes](./_epic.md)
**Priority:** Should
**Estimate:** S
**Wave:** 3 (ui + tests)

## Position in the sequence

- **Blocked by:** T2 — there is no image to show before the route answers with one.
- **Blocks:** T5 — the e2e spec drives this button.
- **Why this wave:** presentation only. One button, one `<img>`, no rule and no library in the browser.

## Why (user story)

As a **visitor**, I want a QR button on each row of "Мої лінки", so that I can see the code for a link without composing an API request by hand.

Spec US-03. AC-06 (activating the button displays that row's QR on the page).

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#5-building-block-view) — the browser is a client of one endpoint; every rule stays server-side
- 🗄  Data delta:   none
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — `GET /api/qr/{code}` answers with an image, so the browser can load it as one
- 📜 Relevant ADR: none. [ADR-0001](../adr/0001-qrcode-dependency.md) is why there is a URL to point an `<img>` at instead of a script to run.
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-06
- 🧬 Parity ref:   `loadLinks()` in `src/public/app.js` — the row template this task extends, and the `#error` / `hidden` pattern already used for toggling

## Data delta

```
NO SCHEMA CHANGE. No new request, either: the browser loads an image.

Row template gains one cell:
  <td><button class="qr" data-code="${l.code}">QR</button></td>

Activating it reveals, for that row:
  <img src="/api/qr/${l.code}" alt="QR ${l.code}" loading="lazy" width="160" height="160">

⚠ NO `.svg` suffix on the code. Express captures the whole path segment, so
  /api/qr/abc.svg looks up the code "abc.svg" and answers 404 (measured).

⚠ NO fetch() + innerHTML, NO inline <svg>, NO <object>. The browser must load the
  response as an image. That is what makes the Cache-Control header do anything, and
  it is what keeps an SVG from our own origin out of document context.

⚠ NO qr library in the browser. The picture comes from the server (ADR-0001).
```

## API contract

_API surface: none — the frontend is a client of `GET /api/qr/{code}`._ It sets no headers and reads no body; it puts a URL in an `src` attribute and lets the browser do the rest.

## Acceptance criteria (GWT)

- [ ] **AC-t3-1 (the picture appears — AC-06):** Given a table with at least one link, when the visitor activates that row's QR button, then an `<img>` whose `src` is `/api/qr/<that row's code>` is visible on the page.
- [ ] **AC-t3-2 (it actually loaded — AC-06):** Given the image is visible, then it has decoded: `naturalWidth > 0`. A broken `src` is still a visible `<img>` element, and a test that only checks visibility passes against a `404`.
- [ ] **AC-t3-3 (the right row):** Given several links, when the button on row *k* is activated, then the revealed image's `src` ends with row *k*'s code and no other row's image is shown.
- [ ] **AC-t3-4 (no suffix):** The `src` is `/api/qr/<code>` exactly. `grep -n "\.svg" src/public/app.js` returns nothing.
- [ ] **AC-t3-5 (loaded as an image):** The QR reaches the DOM through an `<img src>`. `grep -nE "innerHTML.*qr|<object|createElementNS" src/public/app.js` returns nothing, and no `fetch('/api/qr` appears anywhere in `src/public/`.
- [ ] **AC-t3-6 (no rule, no library):** `grep -riE "qrcode|reed|solomon|errorCorrection" src/public/` returns nothing. The browser knows one thing about QR codes: a URL that serves them.
- [ ] **AC-t3-7 (opening the QR is not a click):** Given the QR for a row is shown, when the table is reloaded, then that row's `Кліки` cell is unchanged. The image request must not travel through `GET /:code`.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — RED: create `tests/e2e/qr.spec.js` (T5 grows it). Create a link, click its QR button, assert an `<img>` with `src` ending in `/api/qr/<code>` is visible. It fails because the button does not exist.
- [ ] Step 2 — In `src/public/index.html`, add a `<th>QR</th>` to the table header, after `Створено`.
- [ ] Step 3 — In `src/public/app.js`, add the button cell to the row template in `loadLinks()`, per **Data delta**. Interpolate `l.code`, never `l.url`.
- [ ] Step 4 — Bind one delegated `click` listener on `#rows` rather than one per button: `loadLinks()` rebuilds every row on each call, so per-row listeners are re-attached on every render and the old ones go with the discarded nodes. Read `e.target.closest('.qr')` and bail when it is `null`.
- [ ] Step 5 — On click, toggle a cell (or a row beneath) holding the `<img>`. Build the element with `document.createElement('img')` and set `src` from `dataset.code`; do not extend the `innerHTML` template with the image.
- [ ] Step 6 — In `src/public/style.css`, size the image and the button with the existing custom properties. Add no new colour, no new font, no framework.
- [ ] Step 7 — Run `npm run test:e2e`. Then break it on purpose once: point the `src` at `/api/qr/${l.code}.svg` and watch AC-t3-1 stay green while AC-t3-2 goes red. That is the difference the `naturalWidth` assertion buys.

## Edge cases

| Case | Behaviour |
|---|---|
| `.svg` appended to the code | `404`, and the `<img>` renders as a broken-image icon rather than throwing. Express captures the whole path segment, so `req.params.code` becomes the literal `abc.svg` (measured). The failure is silent in the DOM and loud only in `naturalWidth`, which is why AC-t3-2 exists and AC-t3-1 alone is not enough. |
| `fetch()` + `innerHTML` instead of `<img src>` | Three losses at once. The browser stops treating the response as an image, so `Cache-Control: immutable` buys nothing and the picture is re-downloaded on every render. The SVG lands in document context, where an SVG from our own origin *can* run script. And `loadLinks()` already interpolates the stored `url` into `innerHTML` — a known injection surface recorded in `architecture-map.md` → Constraints — so adding a second one compounds a debt this feature has no mandate to touch. |
| Inline `<svg>` or `<object>` | Same document-context problem as above, minus the caching. The payload is server-built from `req.protocol`, `req.get('host')` and the code, so nothing visitor-authored is *known* to reach the markup — but whether `qrcode` can echo its input was not measured, and T1 pins it with a test precisely because this rule should not be the only thing standing between the two. |
| A per-row `addEventListener` | `loadLinks()` sets `rows.innerHTML = ''` and rebuilds every `<tr>`. Listeners bound to the old nodes are garbage with them, and rebinding on every render is a leak waiting for the first person who forgets. One delegated listener on `#rows` survives every rebuild. |
| Clicking the code link vs the QR button | The `<a href="/${l.code}">` in the first cell is a *follow*: it hits `GET /:code`, redirects, and counts a click. The QR button hits `GET /api/qr/:code`, which counts nothing (AC-07). They sit two cells apart in the same row and mean opposite things. Do not wrap the image in an anchor to the short URL "for convenience" — that turns looking at a QR into following it. |
| Interpolating `l.url` anywhere near the QR | Never needed. The QR encodes the *short* URL, which the server builds from the request. The row's `url` column is the original address and has no business in this feature. |
| A code containing characters that need escaping in an attribute | Codes are base62 (`docs/adr/0001-base62-7-char-codes.md`) or aliases constrained to `^[A-Za-z0-9_-]{3,32}$` by `custom-alias`. Neither can carry a quote. Building the `src` with `createElement` + `img.src = ...` rather than string interpolation makes the question moot rather than argued. |

## Definition of Done

- [ ] Every checklist step done; AC-t3-1 … AC-t3-7 green.
- [ ] `npm run test:e2e` green; `npm run lint` clean.
- [ ] The QR is displayed through `<img src="/api/qr/<code>">` — no suffix, no `fetch`, no inline `<svg>`, no `<object>`.
- [ ] One delegated listener on `#rows`, not one per button.
- [ ] No QR rule and no QR library exists under `src/public/`; no new CSS custom property, no framework, no new dependency.
- [ ] Step 7's deliberate break was run, and AC-t3-2 was the assertion that caught it.
- [ ] PR linked back to `tasks/T3-qr-button.md`.
- [ ] `tracker.md` updated: status `done`.
