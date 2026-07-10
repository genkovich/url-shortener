---
status: Accepted
owner: "genkovich"
reviewers: []
updated_at: "2026-07-10"
feature_size: "S"
ticket: "qr-codes"
---

# 0001 — Take the `qrcode` dependency, and confine it behind `src/qr.js`

- **Status:** Accepted
- **Date:** 2026-07-10
- **Deciders:** genkovich (Architect)

## Context
`GET /api/qr/:code` must return a QR code of a link's short URL. A QR code is not a drawing of a string; it is a specific error-correcting encoding — data segmentation, mode selection, Reed–Solomon parity blocks over GF(256), interleaving, a fixed set of mask patterns each scored against a penalty rule, format and version information written into reserved cells. Getting any one of those wrong produces an image that looks exactly like a QR code and does not scan.

Two conventions in `docs/architecture-map.md` stand in the way, and both are there for good reasons:

- **"Dependencies: no new runtime dependency unless the feature's ADR explicitly accepts it."** This project runs on two runtime packages, `express` and `better-sqlite3`. A third is a real change in what the repo is.
- **"Domain vs HTTP: new domain rule → `src/shorten.js`; routes stay thin in `src/app.js`."** Read literally, any new server-side logic belongs in the domain file.

This ADR exists because the feature breaks both, and a break that nobody wrote down is indistinguishable from a mistake.

## Decision drivers
- The encoder must be correct, and correctness here is only observable with a scanner. A subtly wrong implementation passes every test a human would think to write.
- Whatever we add must be *containable*. `src/shorten.js` currently imports one thing: `randomInt` from `node:crypto`. That is a property worth keeping, and it is cheap to keep.
- The response is served straight to a browser and lives in a `git diff` when a test asserts it.
- The rule that a convention may be broken only in writing, and only where the reader will find it.

## Considered options
1. **Depend on `qrcode` (`^1.5`), wrap it in a new `src/qr.js`, render `type: 'svg'`.**
2. **Hand-roll the encoder inside `src/shorten.js`.** No dependency, and the convention is obeyed to the letter.
3. **Depend on `qrcode`, but put `renderQrSvg` in `src/shorten.js`.** One decision instead of two.
4. **Render the QR in the browser** with a client-side library, leaving `GET /api/qr/:code` at `501`.
5. **`QRCode.toDataURL()`** — a PNG, returned as a base64 `data:` URL in a JSON body.

## Decision outcome
**Chosen:** Option 1.

**Option 2 is the one worth refusing out loud**, because it is the only one that keeps every rule. It fails on scale: a correct QR encoder — Reed–Solomon parity over a finite field, eight mask patterns each scored by four penalty rules, version and format bit-strings — is not "a bit of code in a toy repo". It would immediately be the largest module in the project, larger than `shorten`, `app`, `db` and `server` combined, and the only one whose bugs are invisible to code review. Its tests would need a decoder to be worth anything, and a hand-written decoder to test a hand-written encoder tests only that the two agree. The convention exists to stop dependencies arriving *by reflex*. Refusing this one would trade a well-worn library for the largest and least-verified module in the repository, and call the result discipline.

**Option 3** keeps the dependency and drops the boundary. It would give `src/shorten.js` a third-party import and a transitive tree, and every unit test of `generateCode` and `createLink` would pull `qrcode` in to reach a function it never calls. The domain file's independence is not sentiment: it is why its tests are a `.js` file and an in-memory database, and it is the first thing a contributor reads to learn what a link *is*. A renderer is not part of that answer. Rendering a matrix of squares from a string says nothing about links; it is presentation that happens to run on the server. So the module boundary and the dependency are one decision with one motive — the boundary is what makes the dependency affordable.

**Option 4** puts the encoder in the browser and leaves the route dead. It fails the contract, not the taste test: the roadmap entry is an endpoint, and an endpoint is a thing you can `curl`, embed in an `<img src>`, paste into a slide, and cache. A picture that exists only after JavaScript has run is not a resource. It also imports a script into a page that today has no build step and no bundler.

**Option 5** is the version of Option 1 that most people write first. `toDataURL` yields a PNG as base64 inside JSON: bytes inflated by a third, an image the response cannot *be* — only describe — and a body that no `<img src="/api/qr/x">` can consume. SVG is text. It scales to a poster without a size parameter, it is the response body rather than a field inside one, and when a test asserts it, the assertion is readable in a diff. The choice of `type: 'svg'` is the whole reason this feature needs no image pipeline.

## Consequences
**Positive**
- The encoder is a solved problem, solved by someone else, and the part of it we own is one function.
- `src/shorten.js` still imports only `node:crypto`. The domain remains testable with nothing but a database file.
- Swapping the library is a one-file change that `git diff` names.
- SVG needs no `Content-Length` juggling, no buffer, and no base64. The route sends a string.

**Negative**
- The repository now has three runtime dependencies, and `qrcode` brings a transitive tree that `npm audit` will speak about from time to time. Accepted knowingly; that is what this document is.
- `QRCode.toString` returns a Promise, so the route becomes `async`. On Express 4 — `4.22.2` is what is installed — an `async` handler that rejects is **not** routed to the error middleware. Measured: no response is written at all, and with no `unhandledRejection` listener, Node's default terminates the process. A `try/catch` around the `await` is therefore not style; it is the difference between a `500` and a dead server. Express 5 fixed this; `package.json` declares `^4.21.2`.
- The default render options are now part of the contract by omission. Size, margin and error-correction level are whatever `qrcode` defaults to. Changing them later changes every cached picture — under a `Cache-Control: immutable` that promises it will not.

**Neutral**
- `src/qr.js` is a deviation from "new logic → `src/shorten.js`", recorded in `sad.md` §5 and in the epic's hard rules. It is a boundary drawn around a dependency, not an invitation to add a module per function.
- The response caches for a year. Safe because a code maps to exactly one address for its lifetime (`docs/CONTEXT.md`), so the picture is a constant. What the cache holds is an image, not a permission — a scan still performs `GET /:code`, where expiry is enforced.

## Links
- Spec: [spec.md](../spec.md) §3 (non-goals), §5 (AC-01, AC-02, AC-05), §6, §6.1.
- SAD: [sad.md](../sad.md) §4, §5, §10 (QG-3), §11.
- Related: [0001-alias-as-code.md](../../custom-alias/adr/0001-alias-as-code.md) — the other feature that measured Express's behaviour before trusting it.
- Related: [0001-expiry-check-on-read.md](../../link-expiry/adr/0001-expiry-check-on-read.md) — the read-path check this feature's `410` branch will depend on.
- Related: [0001-base62-7-char-codes.md](../../../adr/0001-base62-7-char-codes.md) — why the code, and therefore the encoded payload, looks the way it does.
