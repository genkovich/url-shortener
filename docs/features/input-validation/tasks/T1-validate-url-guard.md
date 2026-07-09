---
id: T1
title: "Domain: validateUrl guard (trim, non-empty, scheme allowlist, host, length)"
feature: input-validation
project: url-shortener
layer: domain
deps: []
acs: ["AC-02", "AC-03", "AC-04", "AC-05", "AC-06"]
files_hint: ["src/shorten.js"]
wave: 1
priority: Must
estimate: S
blocks: [T2]
owner: "TBD"
status: todo
context_budget: "~2500 tokens"
created: 2026-07-09
spec_refs: ["§5 AC-02", "§5 AC-03", "§5 AC-04", "§5 AC-05", "§5 AC-06", "§6 max URL length"]
sad_refs: ["§4 Solution strategy", "§10 QG-1"]
openapi_paths: []
adr_refs: ["ADR-0001"]
---

# T1 · `validateUrl` domain guard

**Feature:** [input-validation](./_epic.md)
**Priority:** Must
**Estimate:** S
**Wave:** 1 (domain)

## Position in the sequence

- **Blocked by:** — nothing. This is the first task of the feature and touches one file.
- **Blocks:** T2 directly (dedup keys on the *normalized* URL this guard returns). Through T2 it also blocks T3, whose route maps the `ValidationError` defined here.
- **Why this wave:** a pure function with no database and no HTTP. It is the cheapest honest red→green cycle in the feature, and every later task consumes either its return value or its error type.

## Why (user story)

As a **visitor**, I want empty, unsafe-scheme, malformed and oversized URLs refused before anything is stored, so that I never create a dead or dangerous link.

Spec US-02 (bad input rejected before storage), US-03 (URL normalized).
AC-02 (empty), AC-03 (unsafe scheme), AC-04 (malformed), AC-05 (too long), AC-06 (trim).

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#6-runtime-view) — the `validateUrl(url)` branch before any DB access
- 🗄  Data delta:   none — pure function, no schema change, no query
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — `ShortenRequest.url` (`maxLength: 2048`); the 400 body is mapped in T3
- 📜 Relevant ADR: [ADR-0001](../adr/0001-reject-at-edge-allowlist-schemes.md) — the scheme policy is an **allowlist**, never a blocklist; an unknown scheme fails closed
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-02, AC-03, AC-04, AC-05, AC-06
- 🧬 Parity ref:   mirror the shape of `generateCode()` in `src/shorten.js` — a named export, no `db` argument, no Express import

## Data delta

```
NO DB CHANGES IN THIS TASK — pure function over a string.

Constants introduced in src/shorten.js:
  MAX_URL_LENGTH  = 2048                   -- spec §6; measured on the TRIMMED string
  ALLOWED_SCHEMES = ['http:', 'https:']    -- ADR-0001; compared to URL.protocol

Order of checks (first failure wins — this order is the contract):
  1. trim
  2. empty        → 'url required'
  3. length > MAX → 'url too long'
  4. new URL()    → on throw: 'malformed url'
  5. protocol not in ALLOWED_SCHEMES → 'unsafe scheme'
  6. empty host   → 'malformed url'   (belt-and-braces; see Edge cases)
  → return the trimmed string, unchanged otherwise
```

## API contract

_API surface: none — internal task._ The guard throws; T3 turns the throw into `400 { error }`.
The error carries its own identity so the route needs no `if`-ladder over message strings:

```
class ValidationError extends Error
  .name   = 'ValidationError'
  .reason = 'url required' | 'url too long' | 'malformed url' | 'unsafe scheme'

Route mapping (T3):  400 { error: err.reason }
```

`reason` values are short lowercase phrases, matching the existing error bodies in `src/app.js`
(`'not found'`, `'bad request'`, `'not implemented'`) and the `{ error: '<short>' }` convention
in `docs/architecture-map.md`.

## Acceptance criteria (GWT)

- [ ] **AC-t1-1 (happy path, normalized — AC-06):** Given `"  https://example.com/a  "`, when `validateUrl` is called, then it returns exactly `"https://example.com/a"` — trimmed, and otherwise byte-identical to the input.
- [ ] **AC-t1-2 (empty — AC-02):** Given `""` or `"   "`, when `validateUrl` is called, then it throws `ValidationError` with `reason === 'url required'`.
- [ ] **AC-t1-3 (unsafe scheme — AC-03):** Given `"javascript:alert(1)"`, `"data:text/html,x"`, `"file:///etc/passwd"` or `"ftp://host/f"`, when `validateUrl` is called, then it throws `ValidationError` with `reason === 'unsafe scheme'`.
- [ ] **AC-t1-4 (malformed — AC-04):** Given `"not a url"` or `"http://"`, when `validateUrl` is called, then it throws `ValidationError` with `reason === 'malformed url'`.
- [ ] **AC-t1-5 (too long — AC-05):** Given a string of 2049 characters, when `validateUrl` is called, then it throws `ValidationError` with `reason === 'url too long'`; given a valid URL of exactly 2048 characters, it returns that URL.
- [ ] **AC-t1-6 (scheme case-insensitive — AC-03):** Given `"HTTP://EXAMPLE.COM"`, when `validateUrl` is called, then it returns the input unchanged (the `URL` parser lowercases `protocol` for us; we must not lowercase the returned string — spec §3 forbids canonicalization beyond trim).
- [ ] **AC-t1-7 (purity):** `validateUrl` takes no `db` argument, performs no I/O, and `src/shorten.js` imports nothing from Express.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — Write the RED test first: `tests/unit/validation.test.js`, case AC-t1-2 (`validateUrl('')` throws `url required`). Run it, quote the failing line. It must fail because `validateUrl` does not exist — not because the test file is broken.
- [ ] Step 2 — In `src/shorten.js`, export `class ValidationError extends Error` with `name` and `reason` as specified in **API contract** above.
- [ ] Step 3 — In `src/shorten.js`, export `validateUrl(raw)` implementing the six ordered checks from **Data delta**. Return the trimmed string. Add the two module constants `MAX_URL_LENGTH` and `ALLOWED_SCHEMES`.
- [ ] Step 4 — Grow the suite one AC at a time (AC-t1-3 → AC-t1-4 → AC-t1-5 → AC-t1-6 → AC-t1-1), each red before green. The boundary cases 2048 and 2049 are two separate assertions, not one.
- [ ] Step 5 — Do **not** touch `createLink` in this task. Wiring the guard into the create path is T2 (dedup) and T3 (route). `npm run test:fast` must stay green for `tests/unit/shorten.test.js` and `tests/integration/shorten.test.js`, which still create links from raw strings.

## Edge cases

| Case | Behaviour |
|---|---|
| `"  https://x  "` (padded) | Trimmed and accepted. `new URL()` trims on its own — trimming ourselves is what makes the **returned** value normalized, which T2's dedup depends on. |
| Exactly 2048 chars | Accepted. 2049 → `url too long`. Length is measured **after** trim, so `" " + 2048 chars + " "` is accepted. |
| `"HTTP://EXAMPLE.COM"` | Accepted, returned **unchanged**. `URL.protocol` is already lowercase, so the allowlist matches; but we return the raw trimmed string, because lowercasing the host is an explicit non-goal (spec §3). Consequence: `HTTP://X` and `http://x` become two different links under T2's dedup. Acceptable — documented, not fixed. |
| `"https:example.com"` | Accepted. WHATWG parses this as `https://example.com/` with a host, so it is a legal https URL. Surprising to read, harmless to store. |
| `"http://"` · `"https://"` · `"//example.com"` | All throw inside `new URL()` → `malformed url`. |
| Empty host after the scheme allowlist | Cannot happen today: for `http`/`https` the parser rejects an empty host outright (`new URL('https://')` throws). Check 6 is belt-and-braces against a future scheme joining the allowlist — keep it, and keep it last. |
| `"javascript:alert(1)"` | `unsafe scheme`, not `malformed url`. It parses fine; it is the **scheme** that is refused. Running check 5 before check 6 is what keeps the error truthful. |

## Definition of Done

- [ ] Every checklist step done; AC-t1-1 … AC-t1-7 green.
- [ ] `npm run test:fast` green; `npm run lint` clean.
- [ ] `src/shorten.js` has no `import` from `express`, and `validateUrl` takes no `db`.
- [ ] Every rejection path is asserted on `reason`, not on the message text of a bare `Error`.
- [ ] PR linked back to `tasks/T1-validate-url-guard.md`.
- [ ] `tracker.md` updated: status `done`.
