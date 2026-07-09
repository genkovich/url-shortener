---
id: T1
title: "Domain: validateAlias guard (charset, length, reserved names)"
feature: custom-alias
project: url-shortener
layer: domain
deps: []
acs: ["AC-03", "AC-04"]
files_hint: ["src/shorten.js"]
wave: 1
priority: Must
estimate: S
blocks: [T2]
owner: "TBD"
status: todo
context_budget: "~2500 tokens"
created: 2026-07-09
spec_refs: ["§5 AC-03", "§5 AC-04", "§6 Non-functional requirements", "§6.1 Security / privacy"]
sad_refs: ["§4 Solution strategy", "§10 QG-1"]
openapi_paths: []
adr_refs: ["ADR-0001"]
---

# T1 · `validateAlias` domain guard

**Feature:** [custom-alias](./_epic.md)
**Priority:** Must
**Estimate:** S
**Wave:** 1 (domain)

## Position in the sequence

- **Blocked by:** — nothing. First task, one file, no database.
- **Blocks:** T2 — the claim branch calls this guard before it ever touches the store.
- **Why this wave:** the alias becomes a permanent public path segment. Everything downstream assumes the string is already safe, so the guard is written and tested before anything can store one.

## Why (user story)

As a **visitor**, I want a malformed or reserved alias refused with a clear reason, so that I never end up with a link that cannot be followed.

Spec US-02. AC-03 (malformed alias), AC-04 (reserved alias, in any letter case).

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#6-runtime-view) — the `validateAlias` fork, before any `SELECT`
- 🗄  Data delta:   none — pure function, no schema change, no query
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — `ShortenRequest.alias` carries the same `pattern`; the `400` body is mapped in T3
- 📜 Relevant ADR: [ADR-0001](../adr/0001-alias-as-code.md) — allowlist not blocklist, and why the reserved check folds case while uniqueness does not
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-03, AC-04
- 🧬 Parity ref:   `validateUrl` in `src/shorten.js` (feature `input-validation`) — same shape: pure, throws a typed error carrying a `reason`

## Data delta

```
NO DB CHANGES IN THIS TASK — pure function over a string.

Constants introduced in src/shorten.js:
  ALIAS_PATTERN   = /^[A-Za-z0-9_-]{3,32}$/     -- spec §6; allowlist, anchored at both ends
  RESERVED_ALIASES = new Set(['api', 'healthz', 'metrics'])   -- compared lowercased

Order of checks (first failure wins — this order is the contract):
  1. not a string        → 'invalid alias'
  2. fails ALIAS_PATTERN → 'invalid alias'      (covers length AND charset in one test)
  3. lowercased ∈ RESERVED_ALIASES → 'reserved alias'
  → return the alias VERBATIM, with its original case
```

## API contract

_API surface: none — internal task._ The guard throws; T3 turns the throw into `400 { error }`.

```
class AliasError extends Error
  .name   = 'AliasError'
  .reason = 'invalid alias' | 'reserved alias' | 'alias taken'

Route mapping (T3):  'invalid alias' | 'reserved alias' -> 400
                     'alias taken'                      -> 409
```

`'alias taken'` is declared here but thrown in T2 — one error type for one feature keeps the route's
`catch` to a single `instanceof`. `reason` values are short lowercase phrases, matching `'not found'`
and `'bad request'` already in `src/app.js`.

## Acceptance criteria (GWT)

- [ ] **AC-t1-1 (happy path — AC-01):** Given `"launch-2026"`, when `validateAlias` is called, then it returns `"launch-2026"` unchanged.
- [ ] **AC-t1-2 (case preserved — AC-01):** Given `"Foo_Bar"`, then it returns `"Foo_Bar"` — not lowercased. The alias is stored with the case the visitor typed.
- [ ] **AC-t1-3 (length boundaries — AC-03):** `"abc"` (3) and `"x".repeat(32)` are accepted; `"ab"` (2) and `"x".repeat(33)` throw `AliasError` with `reason === 'invalid alias'`.
- [ ] **AC-t1-4 (charset — AC-03):** Each of `"has space"`, `"dot.name"`, `"slash/name"`, `"pct%20"`, `"hash#x"`, `"question?x"`, `"emoji-🙂"` throws with `reason === 'invalid alias'`.
- [ ] **AC-t1-5 (reserved — AC-04):** `"api"`, `"healthz"` and `"metrics"` each throw with `reason === 'reserved alias'`.
- [ ] **AC-t1-6 (reserved, any case — AC-04):** `"HEALTHZ"`, `"Healthz"` and `"Metrics"` each throw `'reserved alias'`. Express matches `GET /HEALTHZ` to the `/healthz` route, so any case would produce an unreachable link.
- [ ] **AC-t1-7 (non-string — AC-03):** `undefined`, `null`, `42` and `{}` throw with `reason === 'invalid alias'`. The route hands us `req.body?.alias`, and an absent field must not reach `.match()`.
- [ ] **AC-t1-8 (purity):** `validateAlias` takes no `db`, performs no I/O, and `src/shorten.js` still imports nothing from Express.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — RED: in `tests/unit/alias.test.js`, assert AC-t1-5 (`validateAlias('healthz')` throws `reserved alias`). It must fail because `validateAlias` does not exist.
- [ ] Step 2 — In `src/shorten.js`, export `class AliasError extends Error` with `name` and `reason` per **API contract** above.
- [ ] Step 3 — Add the two module constants `ALIAS_PATTERN` and `RESERVED_ALIASES`. Anchor the pattern with `^` and `$`; an unanchored pattern would accept `"bad/launch-2026"`.
- [ ] Step 4 — Export `validateAlias(raw)` with the three ordered checks from **Data delta**. Return `raw` unchanged — do **not** lowercase, trim, or otherwise normalize it.
- [ ] Step 5 — Grow the suite through AC-t1-6 → AC-t1-4 → AC-t1-3 → AC-t1-7 → AC-t1-2 → AC-t1-1, each red before green. The boundary cases 3/2 and 32/33 are four separate assertions.
- [ ] Step 6 — Do **not** touch `createLink` here. Wiring the guard into the create path is T2.

## Edge cases

| Case | Behaviour |
|---|---|
| `"HEALTHZ"` | `reserved alias`. Verified against this codebase: Express routing is case-insensitive by default, so `GET /HEALTHZ` returns `{"ok":true}` from the health handler. Store the alias and the link is unreachable forever — and the write would have looked like a success. |
| `"Foo"` vs `"foo"` | Both accepted; they become **two different links**. SQLite compares `TEXT PRIMARY KEY` with the binary collation, and generated base62 codes already depend on that (`kmnj8D9` ≠ `KMNJ8d9`). Folding case for uniqueness would change the meaning of every code ever issued. |
| `"api"` | `reserved alias` — even though `GET /api` today actually falls through to the catch-all and would resolve. Reserved defensively: `/api/*` is the API namespace, and the next endpoint added there must not be able to steal a live link. The reserved list is a **choice**, not a description of the current route table. |
| `"style"` (no extension) | Accepted. `express.static` serves `src/public/style.css`, and the alias pattern forbids `.`, so no static file name can be spelled as an alias. If a file without an extension is ever added to `src/public/`, it must join `RESERVED_ALIASES`. |
| Unanchored regex | The single most likely bug here. `/[A-Za-z0-9_-]{3,32}/.test('bad/name')` is `true` — the pattern matches the `bad` substring. AC-t1-4's `slash/name` case exists to kill exactly this. |
| Unicode letters (`"café"`, `"привіт"`) | `invalid alias`. They are legal in a URL only percent-encoded, and the stored code must equal the path segment byte for byte. Widening the set later is safe; narrowing it is not. |

## Definition of Done

- [ ] Every checklist step done; AC-t1-1 … AC-t1-8 green.
- [ ] `npm run test:fast` green; `npm run lint` clean.
- [ ] `ALIAS_PATTERN` is anchored, and a test proves `"slash/name"` is refused.
- [ ] The reserved check folds case; a test proves `"HEALTHZ"` is refused.
- [ ] `validateAlias` returns its input verbatim — a test proves `"Foo_Bar"` survives unchanged.
- [ ] PR linked back to `tasks/T1-validate-alias.md`.
- [ ] `tracker.md` updated: status `done`.
