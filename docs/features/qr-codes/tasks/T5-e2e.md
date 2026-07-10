---
id: T5
title: "Tests: e2e through the UI"
feature: qr-codes
project: url-shortener
layer: tests
deps: ["T3"]
acs: ["AC-06", "AC-07"]
files_hint: ["tests/e2e/qr.spec.js"]
wave: 3
priority: Should
estimate: S
blocks: []
owner: "TBD"
status: todo
context_budget: "~2000 tokens"
created: 2026-07-10
spec_refs: ["§4 US-03", "§5 AC-06", "§5 AC-07"]
sad_refs: ["§10 QG-1"]
openapi_paths: []
adr_refs: []
---

# T5 · The picture, in a real browser

**Feature:** [qr-codes](./_epic.md)
**Priority:** Should
**Estimate:** S
**Wave:** 3 (ui + tests)

## Position in the sequence

- **Blocked by:** T3 — there is no button to click before it.
- **Blocks:** — nothing. Last task of the epic.
- **Why this wave:** supertest never loads an image. It reads a body. Only a browser turns `<img src="/api/qr/x">` into an actual HTTP request, decodes the SVG, and gives `naturalWidth` a value. Two of this feature's claims — that the picture renders, and that rendering it costs no click — are only observable where the image is really fetched.

## Why (user story)

As a **visitor**, I want the QR button to show me a real, rendered code, and I want looking at it to leave my click count alone, so that the number in the table keeps meaning "people who followed the link".

Spec US-03. AC-06 (the picture is displayed), AC-07 (a QR request is not a click) — this time through a browser that actually issues the request.

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#10-quality-requirements) — QG-1, verified here against the one client that behaves like a client
- 🗄  Data delta:   none — e2e runs against its own file DB (`tests/e2e/reset-db.js`)
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — the browser consumes the `200` as an image; nothing in the spec is asserted directly
- 📜 Relevant ADR: none
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-06, AC-07
- 🧬 Parity ref:   `tests/e2e/smoke.spec.js` — the fixture flow, the reset, and the selectors this spec reuses

## Data delta

```
NO SCHEMA CHANGE. E2E drives the real frontend against its own file DB, reset per run
(tests/e2e/reset-db.js), not against ':memory:'.

The click count is read from the DOM, from the row's `Кліки` cell — the same number a
visitor sees. Not from GET /api/stats/:code: T4 already asserts that seam. Here the
question is whether the page a human looks at tells the truth.
```

## API contract

_API surface: none._ The browser fetches `/api/qr/<code>` because an `<img src>` told it to. The spec asserts what the page shows.

## Acceptance criteria (GWT)

- [ ] **AC-t5-1 (the button reveals the picture — AC-06):** Given a link has been created through the form, when the visitor clicks that row's QR button, then an `<img>` whose `src` ends with `/api/qr/<code>` becomes visible.
- [ ] **AC-t5-2 (the picture is real — AC-06):** Given that image is visible, then `naturalWidth > 0`. A `404` leaves a visible `<img>` element with `naturalWidth === 0`, so visibility alone proves nothing. This is the assertion that catches a `.svg` suffix, a wrong path, or a route that answers JSON.
- [ ] **AC-t5-3 (the request was actually made):** Given the click, then the browser issued `GET /api/qr/<code>` and received `200` with a `content-type` starting `image/svg+xml`. Observe it through Playwright's network events, not by inference from the pixels.
- [ ] **AC-t5-4 (the right row — AC-06):** Given two links, when the second row's button is clicked, then the revealed image's `src` carries the second row's code.
- [ ] **AC-t5-5 (looking is not following — AC-07):** Given a row showing `Кліки: 0`, when its QR is displayed and the page is reloaded, then the cell still reads `0`. The browser fetched the image; the counter did not move.
- [ ] **AC-t5-6 (the control — AC-07):** In the same spec, when the row's code link is clicked (a real follow) and the page is reloaded, then the cell reads `1`. Without this, AC-t5-5 also passes against a counter that is broken in the other direction.
- [ ] **AC-t5-7 (the cache header reaches the browser — AC-05 support):** The response observed in AC-t5-3 carries `Cache-Control: public, max-age=31536000, immutable`. Do **not** assert that a second display serves from cache: whether the browser revalidates is the browser's business, it varies by engine and by whether the page was reloaded, and a test that pins it is testing Chromium.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — Read `tests/e2e/smoke.spec.js`. Reuse its reset and its form flow verbatim; this spec adds a click and two assertions, not a new harness.
- [ ] Step 2 — Create a link through the form, capture its code from the table row.
- [ ] Step 3 — RED: click the row's QR button, expect the `<img>` to be visible. It fails if T3 is not merged.
- [ ] Step 4 — Add AC-t5-2 with `expect(await img.evaluate((el) => el.naturalWidth)).toBeGreaterThan(0)`. Confirm it is load-bearing: point the `src` at `/api/qr/nosuch1` by hand once, and watch AC-t5-1 stay green while this one goes red.
- [ ] Step 5 — Add AC-t5-3 and AC-t5-7 by waiting on the response for `**/api/qr/**` before the click resolves, and reading its status and headers.
- [ ] Step 6 — Add AC-t5-5, then AC-t5-6. Read the `Кліки` cell by row, not by index into a flat list of `<td>`s — T3 added a column, and a positional selector written before it will point at the wrong cell.
- [ ] Step 7 — Run `npm run test:e2e`, then `npm run gate`.

## Edge cases

| Case | Behaviour |
|---|---|
| Asserting visibility instead of `naturalWidth` | A broken image is a visible element. Playwright's `toBeVisible()` passes on an `<img>` whose `src` returned `404`, because the element has layout. Every failure mode T3 can produce — the `.svg` suffix, a wrong path, a JSON body — is invisible to `toBeVisible()` and obvious to `naturalWidth`. |
| Asserting the second display hits the browser cache | Do not. `immutable` tells the browser it may skip revalidation; it does not oblige it, and a reload changes the answer. Assert that we *sent* the header (AC-t5-7). Whether Chromium honours it is Chromium's contract, not ours, and a test that pins it fails on a browser upgrade for no defect. |
| Reading `Кліки` by `<td>` index | T3 appends a QR column. A selector written against the old four-column table silently reads the wrong cell, and the AC-07 assertion starts comparing timestamps. Select within the row by header position or by a `data-` attribute. |
| Checking clicks through `GET /api/stats` | That is T4's seam, and it is already covered there. The point of this spec is the number a human reads off the page. If the DOM and the API ever disagree, this is the test that says so. |
| Only asserting that clicks stayed at `0` | Passes against a counter that never increments. AC-t5-6 follows the link for real and demands a `1`. The pair is the assertion; either half alone is decoration. |
| A flaky wait on the image | Wait on the network response for `**/api/qr/**`, not on a timeout, and not on `naturalWidth` in a poll. The response event is the moment the picture exists. |
| Running this in `npm run test:fast` | It needs a browser. It belongs to `npm run test:e2e`, which `npm run gate` includes. Keep the fast suite browser-free. |

## Definition of Done

- [ ] Every checklist step done; AC-t5-1 … AC-t5-7 green.
- [ ] `npm run test:e2e` green; `npm run gate` green; `npm run lint` clean.
- [ ] The image is asserted with `naturalWidth > 0`, never with visibility alone.
- [ ] AC-t5-5 and AC-t5-6 both exist: the QR does not move the counter, and a real follow does.
- [ ] Step 4's deliberate break was run, and `naturalWidth` was the assertion that caught it.
- [ ] No assertion depends on the browser honouring `immutable`.
- [ ] PR linked back to `tasks/T5-e2e.md`.
- [ ] `tracker.md` updated: status `done`.
