---
id: T1
title: "Domain: renderQrSvg(text) — async SVG renderer over qrcode"
feature: qr-codes
project: url-shortener
layer: domain
deps: []
acs: ["AC-01", "AC-02"]
files_hint: ["src/qr.js"]
wave: 1
priority: Must
estimate: S
blocks: [T2]
owner: "TBD"
status: todo
context_budget: "~2000 tokens"
created: 2026-07-10
spec_refs: ["§3 Non-goals", "§5 AC-01", "§5 AC-02", "§6.1 Security / privacy"]
sad_refs: ["§4 Solution strategy", "§5 Building block view"]
openapi_paths: []
adr_refs: ["ADR-0001"]
---

# T1 · `renderQrSvg` — the renderer, and nothing else

**Feature:** [qr-codes](./_epic.md)
**Priority:** Must
**Estimate:** S
**Wave:** 1 (domain)

## Position in the sequence

- **Blocked by:** — nothing. First task, one new file, no database, no HTTP.
- **Blocks:** T2 — the route has nothing to `await` before this exists.
- **Why this wave:** this is where the new dependency enters the repository. It enters through exactly one file, and that file is written and pinned before any route can reach for it. Getting the boundary right first is what makes the dependency affordable at all.

## Why (user story)

As a **visitor**, I want a picture of my short link that a phone camera can read, so that nobody has to type the URL.

Spec US-01. AC-01 (the body is an SVG document), AC-02 (it encodes exactly the text it was given — the route decides *which* text).

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#6-runtime-view) — `renderQrSvg` sits behind the store probe, and its rejection is caught by T2
- 🗄  Data delta:   none — pure function over a string, no schema, no query
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — the `200` body is what this function returns, sent verbatim
- 📜 Relevant ADR: [ADR-0001](../adr/0001-qrcode-dependency.md) — why `qrcode`, why SVG and not a PNG data URL, and why the function lives here rather than in `src/shorten.js`
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01, AC-02
- 🧬 Parity ref:   `src/shorten.js` — the shape to match: named exports, no default export, no class, no framework import. It is also the file this module exists to keep clean.

## Data delta

```
NO DB CHANGES IN THIS TASK — pure function over a string.

New runtime dependency (package.json):
  qrcode: ^1.5        -- accepted by ADR-0001, NOT a quiet `npm i`

New module src/qr.js:
  import QRCode from 'qrcode';
  export function renderQrSvg(text)  ->  Promise<string>
    = QRCode.toString(text, { type: 'svg' })

Options are left at the library's defaults (size, margin, error-correction level).
That is a contract by omission: changing them later changes every picture already
cached under `Cache-Control: immutable`. See ADR-0001 → Consequences.

The module imports NOTHING else. No express, no better-sqlite3, no db handle.
```

## API contract

_API surface: none — internal task._ The route in T2 turns the returned string into a `200` body and a rejection into a `500`.

```
renderQrSvg(text: string) -> Promise<string>

  resolves: an SVG document, as text
  rejects:  whatever `qrcode` rejects with — T2 catches it and calls next(err)

⚠ It returns a Promise. `res.send(renderQrSvg(x))` answers 200 with the body
  "[object Promise]" and the media type image/svg+xml. Nothing about that is
  visibly wrong except the picture.
```

## Acceptance criteria (GWT)

- [ ] **AC-t1-1 (it is a Promise — AC-01):** Given any text, when `renderQrSvg(text)` is called, then the return value is a `Promise`, and awaiting it yields a `string`.
- [ ] **AC-t1-2 (it is an SVG — AC-01):** Given `"http://sho.rt/kmnj8D9"`, when the promise resolves, then the string contains an `<svg` root element and, trimmed, ends with `</svg>`. Assert on the element, not on the first byte: whether `qrcode` prefixes an XML prolog was **not** measured against this repo, and pinning a byte we never checked is how a test starts lying.
- [ ] **AC-t1-3 (deterministic — AC-02):** Given the same text twice, then the two resolved strings are identical. T4's AC-02 test compares the route's body against a fresh render of the expected URL; that comparison is only meaningful if this holds. If it does not, this AC goes red and the whole test strategy for AC-02 has to change — which is the point of asserting it here.
- [ ] **AC-t1-4 (different text, different picture — AC-02):** Given `"http://sho.rt/kmnj8D9"` and `"kmnj8D9"`, then the two resolved strings differ. This is the negative control T4 leans on to prove the route encodes the absolute URL and not the bare code.
- [ ] **AC-t1-5 (the payload is not echoed — AC-01):** Given the text `"http://sho.rt/<script>alert(1)</script>"`, then the resolved string does not contain `<script>` verbatim. Whether `qrcode` can ever place its input into the returned markup was not measured here, so this is pinned by a test rather than assumed. If it goes red, the route is serving attacker-influenced markup from our own origin and the frontend's `<img src>` rule (T3) becomes load-bearing rather than belt-and-braces.
- [ ] **AC-t1-6 (empty text):** Given `""`, then whatever `renderQrSvg` does — resolve or reject — is pinned by a test. Do **not** add a guard for it: the route can never produce an empty code, because `GET /api/qr/` is a `404` from Express's own routing (measured). A guard here would be dead code defending an unreachable caller.
- [ ] **AC-t1-7 (containment):** `src/qr.js` imports only `qrcode`. `src/shorten.js` still imports only `node:crypto`. `grep -n "^import" src/shorten.js` returns exactly one line.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — RED: create `tests/unit/qr.test.js` and assert AC-t1-2 (`await renderQrSvg('http://sho.rt/abc')` contains `<svg`). It must fail because `src/qr.js` does not exist.
- [ ] Step 2 — `npm i qrcode@^1.5`. This is the one command in this feature that changes `package.json`, and [ADR-0001](../adr/0001-qrcode-dependency.md) is the reason it is allowed. If you are running it without having read that file, stop.
- [ ] Step 3 — Create `src/qr.js` with the single export from **Data delta**. No options object beyond `{ type: 'svg' }`, no default export, no `db` parameter, no `try/catch` — a rejection is the caller's business (T2).
- [ ] Step 4 — Grow the suite through AC-t1-1 → AC-t1-3 → AC-t1-4 → AC-t1-5 → AC-t1-6, each red before green. AC-t1-6 is written by *observing* what the library does with `''` and then asserting it, not by deciding in advance.
- [ ] Step 5 — Verify AC-t1-7 by hand: `grep -n "^import" src/shorten.js` must print one line, `node:crypto`. If it prints two, the renderer landed in the wrong file.
- [ ] Step 6 — Do **not** touch `src/app.js`. Wiring the renderer into a route is T2.
- [ ] Step 7 — Look at one rendered SVG with your own eyes, in a browser, and scan it with a phone. It should open `http://sho.rt/abc` and fail to resolve. That failure is the proof the payload is right; no unit test in this repo can decode a QR.

## Edge cases

| Case | Behaviour |
|---|---|
| The forgotten `await` | The single most likely bug in this feature, and it lands in T2, not here. `renderQrSvg` returns a Promise; `res.send()` on a Promise writes the literal string `[object Promise]` and answers `200` with `image/svg+xml`. Status, media type and cache header all pass. AC-t1-1 exists so that whoever reads this module knows what it hands back. |
| Assuming the first byte is `<` | `qrcode`'s SVG may or may not carry an XML prolog. It was not measured against this repo, and the install is not part of this task's reading. AC-t1-2 matches the `<svg` element wherever it starts. A `startsWith('<svg')` assertion is a coin flip that will land on someone else's PR. |
| `renderQrSvg('')` | Unreachable from the route: `GET /api/qr/` is a `404` before any handler runs, and `GET /api/qr/a/b` is too — both measured. AC-t1-6 pins the library's behaviour without guarding against it, because a guard would be the only branch in this module that no caller can enter. |
| Putting this in `src/shorten.js` | The convention in `architecture-map.md` reads "new domain rule → `src/shorten.js`", and a reflexive reading lands the renderer there. There is no domain rule here. `src/shorten.js` imports exactly one thing today, `randomInt` from `node:crypto`, which is why its unit tests need nothing but a database file. Adding `qrcode` would pull a transitive tree into every domain test to reach a function none of them call. The deviation is argued in [sad.md](../sad.md#5-building-block-view) — and it licenses one module for one dependency, not a module per function. |
| Options left at the defaults | Size, margin and error-correction level become part of the contract by omission. The `200` is served with `Cache-Control: immutable`, so a later "let's bump the error correction" silently disagrees with every picture already in a browser cache. Changing them is a new ADR, not a tweak. |
| `toDataURL` instead of `toString` | Returns a base64 PNG. It cannot be a response body, only a field inside one; it inflates by a third; it does not scale; and no `<img src="/api/qr/x">` can consume it. Refused in [ADR-0001](../adr/0001-qrcode-dependency.md), and refused again here because the shape of this function is what makes T2 a four-line route. |

## Definition of Done

- [ ] Every checklist step done; AC-t1-1 … AC-t1-7 green.
- [ ] `npm run test:fast` green; `npm run lint` clean.
- [ ] `qrcode` appears in `dependencies` (not `devDependencies`), and [ADR-0001](../adr/0001-qrcode-dependency.md) is linked from the PR body.
- [ ] `src/qr.js` imports only `qrcode`; `src/shorten.js` still imports only `node:crypto`, proven by `grep`.
- [ ] `renderQrSvg('')` has an assertion that describes what the library actually does, and no guard that pre-empts it.
- [ ] One SVG was rendered and scanned by hand, once.
- [ ] PR linked back to `tasks/T1-render-qr-svg.md`.
- [ ] `tracker.md` updated: status `done`.
