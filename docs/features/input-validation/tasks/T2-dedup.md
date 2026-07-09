---
id: T2
title: "Domain: dedup — reuse existing code for an already-stored normalized url"
feature: input-validation
project: url-shortener
layer: domain
deps: ["T1"]
acs: ["AC-01", "AC-07"]
files_hint: ["src/shorten.js"]
wave: 1
priority: Must
estimate: S
blocks: [T3]
owner: "TBD"
status: todo
context_budget: "~2500 tokens"
created: 2026-07-09
spec_refs: ["§5 AC-01", "§5 AC-07", "§3 Non-goals"]
sad_refs: ["§4 Solution strategy", "§10 QG-3"]
openapi_paths: []
adr_refs: []
---

# T2 · Dedup on the normalized URL

**Feature:** [input-validation](./_epic.md)
**Priority:** Must
**Estimate:** S
**Wave:** 1 (domain)

## Position in the sequence

- **Blocked by:** T1 — dedup keys on the string `validateUrl` returns. Keying on the raw input instead would let `" https://x "` and `"https://x"` become two rows, which is exactly AC-07's failure mode.
- **Blocks:** T3 — the route needs to know *whether* a row was written, to choose `201` over `200`.
- **Why this wave:** still pure domain, still one file. It closes the create path before any HTTP concern touches it.

## Why (user story)

As a **visitor**, I want the same URL to reuse its existing code, so that identical links don't pile up as separate rows.

Spec US-03 (normalized and de-duplicated). AC-01 (a valid URL still shortens as before), AC-07 (a repeat create returns the existing code and writes nothing).

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#6-runtime-view) — the `already stored` / `new` branch after validation
- 🗄  Data delta:   none — no new column, no index. A full-URL scan is accepted at this scale (SAD §11)
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — `200` (dedup hit) vs `201` (new); the mapping itself is T3
- 📜 Relevant ADR: none — dedup needs no decision beyond the normalization T1 already fixed
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01, AC-07
- 🧬 Parity ref:   `createLink` in `src/shorten.js` — keep the existing collision-regeneration loop untouched

## Data delta

```
NO DB CHANGES IN THIS TASK — no column, no index, no migration.

Read pattern (before the insert):
  SELECT code FROM links WHERE url = ?     -- ? is the NORMALIZED url from validateUrl

Write pattern:
  hit  → return { code: <existing>, created: false }   -- zero INSERT
  miss → generate code, INSERT, return { code, created: true }

Signature change:
  createLink(db, rawUrl) -> { code, created }          -- was: { code }
```

## API contract

_API surface: none — internal task._ `createLink` returns `{ code, created }`; T3 maps `created`
to `201` and `!created` to `200`. The boolean exists so the route never has to re-query the DB to
find out what the domain just did.

## Acceptance criteria (GWT)

- [ ] **AC-t2-1 (new url — AC-01):** Given an empty database, when `createLink(db, 'https://example.com/a')` runs, then it returns `{ code, created: true }` with a 7-character code, and exactly one row exists.
- [ ] **AC-t2-2 (repeat url — AC-07):** Given `https://example.com/a` is already stored, when `createLink` is called with the same string, then it returns `{ code: <the same code>, created: false }` and the table still holds exactly one row.
- [ ] **AC-t2-3 (dedup keys on the normalized url — AC-07):** Given `https://example.com/a` is stored, when `createLink(db, '  https://example.com/a  ')` runs, then it returns the existing code with `created: false`. Padding must not create a second link.
- [ ] **AC-t2-4 (validation runs first — AC-07):** Given any invalid input, when `createLink` is called, then it throws `ValidationError` and performs **no** `SELECT` and **no** `INSERT`. Nothing is stored.
- [ ] **AC-t2-5 (different urls stay different — AC-01):** Given `https://example.com/a` is stored, when `createLink(db, 'https://example.com/b')` runs, then a second row is created with a different code.
- [ ] **AC-t2-6 (collision guard survives):** The existing regenerate-on-code-collision loop still runs on the miss branch; a dedup hit never reaches it.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — RED: in `tests/unit/validation.test.js`, assert AC-t2-2 (same URL twice → same code, one row). It must fail on `created` being `undefined`, not on a broken import.
- [ ] Step 2 — In `src/shorten.js`, make `createLink(db, rawUrl)` call `validateUrl(rawUrl)` as its **first** statement and bind the result to `url`. Everything below uses `url`, never `rawUrl`.
- [ ] Step 3 — Add the lookup `db.prepare('SELECT code FROM links WHERE url = ?').get(url)`. On a hit, return `{ code: row.code, created: false }` immediately — before `generateCode()` is ever called.
- [ ] Step 4 — On a miss, keep the existing collision loop and `INSERT`, then return `{ code, created: true }`.
- [ ] Step 5 — Update the two existing callers of the old `{ code }` shape: `src/app.js` is **T3's** job, so for now only fix the seed unit test if it destructures `created`. It does not — `const { code } = createLink(...)` keeps working, so `npm run test:fast` must stay green without touching `tests/unit/shorten.test.js`.
- [ ] Step 6 — Grow the suite through AC-t2-3 → AC-t2-4 → AC-t2-5, each red before green.

## Edge cases

| Case | Behaviour |
|---|---|
| `"  https://x  "` vs `"https://x"` | One row. The lookup uses the trimmed string, so both collapse to the same key (test-plan, Edge cases). |
| `"HTTP://X"` vs `"http://x"` | **Two** rows. Case is not normalized (spec §3 forbids canonicalization beyond trim). Known and accepted — see T1. |
| Invalid input | `ValidationError` before any DB call. AC-t2-4 asserts this by counting rows, not by trusting the order of source lines. |
| Two identical creates racing | `better-sqlite3` is synchronous and the server is single-process, so the SELECT-then-INSERT pair cannot interleave. If this ever moves to an async driver, the pair needs a transaction or a `UNIQUE(url)` index. Recorded, not fixed. |
| Existing rows written before this feature | Deduped on their stored value as-is. There is no backfill: nothing to normalize, since the seed only ever stored what it was given. |

## Definition of Done

- [ ] Every checklist step done; AC-t2-1 … AC-t2-6 green.
- [ ] `npm run test:fast` green; `npm run lint` clean.
- [ ] `tests/unit/shorten.test.js` and `tests/integration/shorten.test.js` pass **unmodified**.
- [ ] A rejected create leaves the row count unchanged — asserted, not assumed.
- [ ] PR linked back to `tasks/T2-dedup.md`.
- [ ] `tracker.md` updated: status `done`.
