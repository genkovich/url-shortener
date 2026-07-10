---
id: T4
title: "Tests: unit + integration for AC-01..05, AC-07"
feature: qr-codes
project: url-shortener
layer: tests
deps: ["T2"]
acs: ["AC-01", "AC-02", "AC-03", "AC-04", "AC-05", "AC-07"]
files_hint: ["tests/unit/qr.test.js", "tests/integration/qr.test.js"]
wave: 3
priority: Must
estimate: S
blocks: []
owner: "TBD"
status: todo
context_budget: "~3000 tokens"
created: 2026-07-10
spec_refs: ["§5 AC-01", "§5 AC-02", "§5 AC-05", "§5 AC-07", "§6 Non-functional requirements"]
sad_refs: ["§10 Quality requirements"]
openapi_paths: []
adr_refs: ["ADR-0001"]
---

# T4 · Coverage sweep for AC-01 … AC-05 and AC-07

**Feature:** [qr-codes](./_epic.md)
**Priority:** Must
**Estimate:** S
**Wave:** 3 (ui + tests)

## Position in the sequence

- **Blocked by:** T2 — the integration cases need a route that answers with an image.
- **Blocks:** — nothing. It ships in parallel with T3.
- **Why this wave:** T1 and T2 wrote most of these tests under TDD. This is the audit. Three of this feature's failure modes produce a `200`, a valid SVG and a correct media type, and only a specific assertion separates them from a correct implementation. This task is where those assertions are guaranteed to exist.

## Why (user story)

As a **maintainer**, I want the click counter, the encoded payload and the async error path pinned by tests, so that the three ways this feature can be silently wrong are the three ways it cannot.

Spec §5 (AC-01 … AC-05, AC-07), [test-plan.md](../test-plan.md) → AC coverage.

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#10-quality-requirements) — QG-1 the read stays a read, QG-2 the picture agrees with the API, QG-3 no silent hang
- 🗄  Data delta:   none — both suites open `:memory:`
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — the integration cases assert `200` / `404`, the media type and the `Cache-Control` header
- 📜 Relevant ADR: [ADR-0001](../adr/0001-qrcode-dependency.md) — SVG is text, which is the only reason the body can be compared at all
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01 … AC-05, AC-07
- 🧬 Parity ref:   [test-plan.md](../test-plan.md) — the AC-coverage table and the test-data list are the source of every literal below

## Data delta

```
NO SCHEMA CHANGE. Both suites open their own database:
  createApp(openDb(':memory:'))   -- integration, per test
  (unit needs no db at all — renderQrSvg is pure)

The Host header is pinned so the expected payload is a constant:
  request(app).get('/api/qr/' + code).set('Host', 'sho.rt')
  => the route builds  http://sho.rt/<code>

Why that works, measured: app.get('trust proxy') is false, so req.protocol is always
'http'; req.get('host') is the Host header verbatim. Verified end-to-end through the
existing route — POST /api/shorten with Host: sho.rt returns
  { "code": "4OTjgqA", "short_url": "http://sho.rt/4OTjgqA" }
```

## API contract

_API surface: none._ The integration suite drives `GET /api/qr/:code`, `POST /api/shorten` and `GET /api/stats/:code` through supertest. The unit suite calls `renderQrSvg` directly.

## Acceptance criteria (GWT)

- [ ] **AC-t4-1 (coverage — all):** Every one of AC-01, AC-02, AC-03, AC-05 and AC-07 has at least one test whose name names it, matching the table in [test-plan.md](../test-plan.md). AC-04 is the documented exception — see AC-t4-7.
- [ ] **AC-t4-2 (media type as a prefix — AC-01):** The assertion is `expect(res.headers['content-type']).toMatch(/^image\/svg\+xml/)`. Not `toBe('image/svg+xml')`. `res.send()` appends `; charset=utf-8` to any string body (measured), and the equality assertion's cheapest fix is to switch the route to `res.end()`, which drops Express's weak ETag.
- [ ] **AC-t4-3 (the body is a real SVG — AC-01):** The body contains `<svg` and, trimmed, ends with `</svg>`. This is the assertion that catches a missing `await`: `res.send(promise)` yields `200`, the right media type, the right cache header, and the body `[object Promise]`.
- [ ] **AC-t4-4 (the payload, positive and negative — AC-02):** With `Host: sho.rt`, the body equals `await renderQrSvg('http://sho.rt/' + code)` **and** differs from `await renderQrSvg(code)`. Both halves. The first alone passes against a route that renders the right string by accident; the second alone passes against a route that renders anything at all.
- [ ] **AC-t4-5 (unknown code — AC-03):** `GET /api/qr/nosuch1` → `404 { error: 'not found' }`, a JSON body, and **no** `Cache-Control` header. A cached `404` would outlive the code's creation.
- [ ] **AC-t4-6 (cache header — AC-05):** On the `200`, `Cache-Control` is exactly `public, max-age=31536000, immutable`.
- [ ] **AC-t4-7 (the counter — AC-07):** Read `GET /api/stats/<code>`, request the QR three times, read again: `clicks` is identical. Then, as a control in the same test file, follow `GET /<code>` once and assert `clicks` incremented — otherwise the first assertion also passes against a counter that never moves at all.
- [ ] **AC-t4-8 (a rejected render — QG-3):** With `renderQrSvg` stubbed to reject, the route answers `500 { error: 'internal error' }`. Stub the module, do not stub `qrcode`: the contract under test is the route's `try/catch`, not the library's failure modes.
- [ ] **AC-t4-9 (the suffix — AC-03):** `GET /api/qr/<code>.svg` → `404`. Express captures the whole segment (measured), so this is an unknown code, not a content negotiation.
- [ ] **AC-t4-10 (AC-04 is deliberately absent):** No `410` test exists while `link-expiry` is unshipped, because there is no `expires_at` column and therefore no branch to drive. A comment in `tests/integration/qr.test.js` names the AC and names the blocking feature. An empty `it.todo` is acceptable; an `it.skip` around a written assertion is not — it rots.
- [ ] **AC-t4-11 (seed suites untouched):** `tests/unit/shorten.test.js` and `tests/integration/shorten.test.js` pass unmodified.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — Read the test-data list in [test-plan.md](../test-plan.md). Every literal you need is there: the pinned host `sho.rt`, the unknown code `nosuch1`, the suffixed code, the payload probe, and the two controls for AC-02.
- [ ] Step 2 — `tests/unit/qr.test.js`: `renderQrSvg` returns a Promise; awaiting it yields a string containing `<svg`; the same text twice gives identical strings; two different texts give different strings; a payload containing `<script>` is not echoed into the markup; and `''` does whatever it does, asserted rather than assumed.
- [ ] Step 3 — `tests/integration/qr.test.js`: create a link through `POST /api/shorten` (never by writing SQL — the suite must exercise the same path a visitor does), then drive `GET /api/qr/<code>` for AC-t4-2, AC-t4-3, AC-t4-6.
- [ ] Step 4 — Add AC-t4-4 with `.set('Host', 'sho.rt')` on **both** the create and the QR request, so the code and the expected payload agree.
- [ ] Step 5 — Add AC-t4-5 and AC-t4-9. Assert the absence of `Cache-Control` on the `404` explicitly; `expect(res.headers['cache-control']).toBeUndefined()`.
- [ ] Step 6 — Add AC-t4-7 with its control follow. Read `clicks` through `GET /api/stats/<code>`, which is a pure `SELECT` — verified: calling it twice leaves `clicks` at `0`.
- [ ] Step 7 — Add AC-t4-8 with `vi.mock('../../src/qr.js', ...)`.
- [ ] Step 8 — Run `npm run test:fast`. Then run three mutations, one at a time, and confirm each turns a **specific** test red:
  - swap `getStats` for `resolveLink` in the route → only AC-t4-7 goes red;
  - drop the `await` before `renderQrSvg` → only AC-t4-3 and AC-t4-4 go red;
  - render `code` instead of the absolute URL → only AC-t4-4 goes red.
  Revert each. A suite that survives any of the three is not testing what it claims. Note what the *other* assertions did during each mutation: they stayed green, which is the whole argument for this task existing.

## Edge cases

| Case | Behaviour |
|---|---|
| Asserting the counter without a control | `expect(after.clicks).toBe(before.clicks)` also passes if `clicks` is broken and never increments at all. AC-t4-7 follows the link once and asserts the counter *moves*, in the same file, so that the equality assertion means "the QR did not count" rather than "nothing counts". |
| Stubbing `qrcode` instead of `src/qr.js` | Tests the library's error surface, which is not ours. Stub the module the route imports. The contract under test in AC-t4-8 is one `try/catch`. |
| A `410` test written "ready for later" | Refused, for one reason: there is no `expires_at` column and no branch in the route to reach. A skipped test that asserts a status nothing can produce is worse than no test — it will be un-skipped by someone who assumes it was once green. `it.todo` and a comment naming `link-expiry`. When that feature lands, the assertion is `410 { error: 'gone' }`, written in the same commit as the branch. |
| Comparing the body against a golden file | Brittle for no gain. `renderQrSvg` is deterministic (T1 AC-t1-3), so the expected value can be *computed* in the test from the expected text. A checked-in golden SVG additionally pins `qrcode`'s default size and margin — which ADR-0001 explicitly leaves outside the contract — and turns a library patch bump into a red suite. |
| Decoding the QR to verify AC-02 | Would need a decoder, a canvas and a new devDependency, to prove a property the deterministic-render comparison already proves. The one thing a decoder buys — that the picture *scans* — is bought once by hand in T1's Step 7 and never again by CI. |
| `content-type` compared with `toContain` | Passes on `text/html; charset=utf-8` if the string were ever `image/svg+xml` inside it — it would not be, but the anchored regex `/^image\/svg\+xml/` says what is meant and costs the same. |
| Creating the fixture link with raw SQL | Tempting for speed, and it skips the very expression AC-02 is about. `POST /api/shorten` is how a code comes into existence, and its `short_url` is the string the QR must encode. Create through the route. |
| e2e for the button | Lives in T5 (`tests/e2e/qr.spec.js`), not here. `npm run test:fast` must not need a browser. |

## Definition of Done

- [ ] Every checklist step done; AC-t4-1 … AC-t4-11 green.
- [ ] `npm run test:fast` green; `npm run lint` clean.
- [ ] Every AC in [test-plan.md](../test-plan.md)'s coverage table maps to a named test, except AC-04, which maps to an `it.todo` and a comment naming its blocker.
- [ ] The media type is asserted with an anchored regex, never with `toBe`.
- [ ] AC-t4-7 contains both the equality assertion and the control follow that proves the counter works.
- [ ] Step 8's three mutations were actually run, and each turned exactly the predicted test red.
- [ ] PR linked back to `tasks/T4-tests.md`.
- [ ] `tracker.md` updated: status `done`.
