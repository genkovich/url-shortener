---
id: T2
title: "Domain: createLink claim branch — alias becomes the code, 409 on collision"
feature: custom-alias
project: url-shortener
layer: domain
deps: ["T1"]
acs: ["AC-01", "AC-02", "AC-05", "AC-07"]
files_hint: ["src/shorten.js"]
wave: 1
priority: Must
estimate: S
blocks: [T3]
owner: "TBD"
status: todo
context_budget: "~2500 tokens"
created: 2026-07-09
spec_refs: ["§5 AC-01", "§5 AC-02", "§5 AC-05", "§5 AC-07"]
sad_refs: ["§4 Solution strategy", "§10 QG-2", "§10 QG-3"]
openapi_paths: []
adr_refs: ["ADR-0001"]
---

# T2 · The claim branch in `createLink`

**Feature:** [custom-alias](./_epic.md)
**Priority:** Must
**Estimate:** S
**Wave:** 1 (domain)

## Position in the sequence

- **Blocked by:** T1 — the claim branch validates before it probes the store, and it reuses `AliasError`.
- **Blocks:** T3 — the route needs the `'alias taken'` error to answer `409`.
- **Why this wave:** still pure domain, still one file. It closes the create path before HTTP sees it.

## Why (user story)

As a **visitor**, I want my chosen alias to become the code of a new link, and I want to be told when it is already taken rather than overwrite someone's link.

Spec US-01, US-02. AC-01 (alias becomes the code), AC-02 (no alias → unchanged behaviour), AC-05 (a taken alias is a conflict), AC-07 (an alias bypasses URL de-duplication).

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#6-runtime-view) — the two create branches, `alias given` and `alias omitted`
- 🗄  Data delta:   none — `links.code` already is the primary key; that is the whole point (ADR-0001)
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — `201` vs `409`; the mapping itself is T3
- 📜 Relevant ADR: [ADR-0001](../adr/0001-alias-as-code.md) — the alias *is* the code; no second column, no second index, no second lookup
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01, AC-02, AC-05, AC-07
- 🧬 Parity ref:   the existing collision loop in `createLink` — the generate branch keeps it verbatim; the claim branch must never enter it

## Data delta

```
NO DB CHANGES IN THIS TASK — no column, no index, no migration.

Read pattern (claim branch only):
  SELECT 1 FROM links WHERE code = ?      -- ? is the alias, verbatim (case-sensitive PK)

Write pattern:
  alias given:
    validateAlias(alias)                  -- T1; throws 'invalid alias' | 'reserved alias'
    taken  → throw AliasError('alias taken')      -- ZERO writes
    free   → INSERT with code = alias
    NEVER dedup on url                    -- AC-07

  alias omitted:
    unchanged: generate code, retry on collision, INSERT
    dedup on url still applies if `input-validation` has shipped

Signature change:
  createLink(db, url, { alias } = {}) -> { code }
```

## API contract

_API surface: none — internal task._ T3 maps `AliasError.reason` to `400` or `409`.

## Acceptance criteria (GWT)

- [ ] **AC-t2-1 (alias becomes the code — AC-01):** Given an empty database, when `createLink(db, 'https://example.com/a', { alias: 'launch-2026' })` runs, then it returns `{ code: 'launch-2026' }` and `resolveLink(db, 'launch-2026').url` is that URL.
- [ ] **AC-t2-2 (no alias — AC-02):** Given `createLink(db, url)` with no options, when it runs, then it returns a random 7-character base62 code, exactly as before. `generateCode` is still the only source of that code.
- [ ] **AC-t2-3 (taken alias — AC-05):** Given `launch-2026` already exists, when `createLink(db, otherUrl, { alias: 'launch-2026' })` runs, then it throws `AliasError` with `reason === 'alias taken'`.
- [ ] **AC-t2-4 (no overwrite — AC-05, QG-2):** After AC-t2-3, the existing row is byte-identical: same `url`, same `created_at`, same `clicks`. Asserted on the row, not on the exception.
- [ ] **AC-t2-5 (validation before the probe — AC-03):** Given a malformed or reserved alias, when `createLink` runs, then it throws `AliasError` and performs **no** `SELECT` and **no** `INSERT`.
- [ ] **AC-t2-6 (alias bypasses dedup — AC-07):** Given `https://example.com/a` is already stored under a generated code, when `createLink(db, 'https://example.com/a', { alias: 'mirror' })` runs, then a **second** link is created, and both codes resolve to the same URL.
- [ ] **AC-t2-7 (case-sensitive uniqueness):** Given `Foo` exists, when `createLink(db, url, { alias: 'foo' })` runs, then it succeeds. Two links, two codes.
- [ ] **AC-t2-8 (claim never regenerates):** The generate-and-retry loop is unreachable when an alias is supplied. A taken alias is a `409`, never a silently different code.
- [ ] **AC-t2-9 (seed suite untouched):** `tests/unit/shorten.test.js` and `tests/integration/shorten.test.js` pass **unmodified**.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — RED: in `tests/unit/alias.test.js`, assert AC-t2-1 (`createLink` with an alias returns that alias as the code). It fails because `createLink` ignores its third argument.
- [ ] Step 2 — In `src/shorten.js`, widen the signature to `createLink(db, url, { alias } = {})`. Keep every existing caller working: `createLink(db, url)` must behave exactly as today.
- [ ] Step 3 — Guard the branch on `alias != null` (so `alias: null` from JSON means "omitted", not "malformed" — that decision lives in the openapi contract).
- [ ] Step 4 — Claim branch: `validateAlias(alias)` first, then `SELECT 1 FROM links WHERE code = ?`. On a hit, `throw new AliasError('alias taken')` **before** any write. On a miss, `INSERT` with `code = alias`.
- [ ] Step 5 — Generate branch: leave it byte-identical, including the URL dedup added by `input-validation`, if that feature has shipped. Check `git log src/shorten.js` before you start.
- [ ] Step 6 — Grow the suite through AC-t2-3 → AC-t2-4 → AC-t2-5 → AC-t2-6 → AC-t2-7 → AC-t2-2, each red before green.
- [ ] Step 7 — Run `npm run test:fast`. Both seed suites must pass without a single edit.

## Edge cases

| Case | Behaviour |
|---|---|
| `alias: null` | Treated as **omitted**. The JSON contract declares `alias` as `[string, "null"]`, so a client that always sends the field must be able to send `null` for "no alias". Guard on `alias != null`, which catches both `null` and `undefined` and nothing else. |
| `alias: ''` | **Not** omitted — it is a malformed alias, refused by T1 as `invalid alias`. `'' != null` is `true`, so the claim branch runs and the guard rejects it. An empty string reaching the generate branch would silently ignore a field the visitor filled in and then cleared. |
| Taken alias | `AliasError('alias taken')` thrown **before** the `INSERT`. AC-t2-4 asserts the existing row afterwards, because "the status code was 409" says nothing about whether the row survived. |
| Alias bypasses dedup | Deliberate (AC-07, ADR-0001 Consequences). Two codes may point at one URL. `url` is not unique and never was — only `code` is. |
| Relying on the PK to reject a duplicate | Tempting: skip the `SELECT`, let `INSERT` throw `SQLITE_CONSTRAINT`, catch it. Rejected — the caller then has to parse a driver-specific error string to tell "alias taken" from a real database fault, and the domain layer would leak `better-sqlite3` into `src/app.js`. Probe explicitly, throw our own type. |
| Race between the probe and the insert | `better-sqlite3` is synchronous and the server is single-process; the `SELECT`/`INSERT` pair cannot interleave. On an async driver this needs a transaction or a caught constraint violation. Recorded, not fixed. |
| An invalid URL **and** an alias | The URL error wins: `validateUrl` runs first (`input-validation` T2 Step 2). Nothing is stored, and the visitor fixes the URL before learning anything about their alias. |

## Definition of Done

- [ ] Every checklist step done; AC-t2-1 … AC-t2-9 green.
- [ ] `npm run test:fast` green; `npm run lint` clean.
- [ ] A taken alias leaves the existing row byte-identical — asserted on the row.
- [ ] A refused alias performs no write — asserted by counting rows, not by reading the source.
- [ ] `src/shorten.js` still imports nothing from `express`, and no `better-sqlite3` error string is parsed anywhere.
- [ ] PR linked back to `tasks/T2-create-link-with-alias.md`.
- [ ] `tracker.md` updated: status `done`.
