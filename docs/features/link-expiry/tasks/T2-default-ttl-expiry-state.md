---
id: T2
title: "Domain: resolve default TTL + compute expired state"
feature: link-expiry
project: url-shortener
layer: domain
deps: ["T1"]
acs: ["AC-01", "AC-03", "AC-04", "AC-05"]
files_hint: ["src/shorten.js"]
wave: 2
priority: Must
estimate: M
blocks: [T3]
owner: "TBD"
status: blocked
context_budget: "~3000 tokens"
created: 2026-07-09
spec_refs: ["§5 AC-01", "§5 AC-03", "§5 AC-04", "§5 AC-05", "§8 Open questions"]
sad_refs: ["§4 Solution strategy", "§8 Crosscutting concepts"]
openapi_paths: []
adr_refs: ["ADR-0001"]
---

# T2 · Default TTL + `isExpired`

**Feature:** [link-expiry](./_epic.md)
**Priority:** Must
**Estimate:** M
**Wave:** 2 (domain)

> ⛔ **BLOCKED on an open question.** Spec §8: the default lifetime is undecided, and
> `.env.example` ships `DEFAULT_TTL_DAYS=` deliberately empty. **Ask the human before writing
> a single line.** Do not pick 7, 30 or 365 because it "seems reasonable" — the number is a
> product decision, and a link that silently dies after a guessed interval is worse than a
> link that never expires.

## Position in the sequence

- **Blocked by:** T1 (the column) — and by the open question above, which is a harder blocker than the column.
- **Blocks:** T3 — the route asks the domain whether a link is expired; it must never compute that itself.
- **Why this wave:** the expiry rule is a domain rule. `isExpired` is a pure predicate over `(link, now)`, and injecting `now` is what makes the boundary testable without sleeping.

## Why (user story)

As a **visitor**, I want to set how long a new link stays valid, and I want every link to have an unambiguous expiry state, so that temporary links stop working on their own and nothing is left undefined.

Spec US-01, US-03. AC-01 (the link carries its expiry moment), AC-03 (an expired link is refused), AC-04 (a link created without a chosen lifetime still has a well-defined state), AC-05 (the list reflects the same state a follow would).

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#6-runtime-view) — read the link, compare `expires_at` to now, only then count the click
- 🗄  Data delta:   [data-model.md](../data-model.md) — `expires_at` unix ms, nullable; fixtures: valid / expired / legacy `NULL`
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — `ttl_days` on `POST /api/shorten`; the route wiring is T3
- 📜 Relevant ADR: [ADR-0001](../adr/0001-expiry-check-on-read.md) — expiry is derived on read, never by deleting rows
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01, AC-03, AC-04
- 🧬 Parity ref:   `createLink` / `resolveLink` in `src/shorten.js` — extend them; the existing seed tests must keep passing unmodified

## Data delta

```
NO SCHEMA CHANGE — T1 owns the column.

Reads/writes:
  INSERT INTO links (code, url, created_at, clicks, expires_at) VALUES (?, ?, ?, 0, ?)
  SELECT * FROM links WHERE code = ?
  UPDATE links SET clicks = clicks + 1 WHERE code = ?    -- ONLY when not expired

New exports in src/shorten.js:
  DAY_MS = 86_400_000
  resolveDefaultTtlDays(env = process.env) -> number      -- ⛔ value blocked on spec §8
  isExpired(link, now)                     -> boolean     -- pure, no db
  createLink(db, url, { ttlDays } = {})    -> { code }    -- now also writes expires_at
  resolveLink(db, code, now = Date.now())  -> { ...row, expired } | null
  listLinks(db, now = Date.now())          -> [{ ...row, expired }]

Rule:  isExpired(link, now)  ⇔  link.expires_at != null && now >= link.expires_at
       expires_at = created_at + ttlDays * DAY_MS
```

`listLinks` gains `expired` here, not in the frontend. The badge (T4) must render a decision,
never make one — otherwise the same rule lives in two languages and drifts in one of them.

## API contract

_API surface: none — internal task._ T3 turns `resolveLink(...).expired` into `410` and
`{ ttlDays }` into the `ttl_days` request field.

## Acceptance criteria (GWT)

- [ ] **AC-t2-1 (explicit lifetime — AC-01):** Given `createLink(db, url, { ttlDays: 7 })` at time `t`, when the row is read back, then `expires_at === t + 7 * DAY_MS` (to the millisecond of `created_at`, not of a second `Date.now()` call).
- [ ] **AC-t2-2 (default lifetime — AC-04):** Given `createLink(db, url)` with no `ttlDays`, when the row is read back, then `expires_at` is `created_at + resolveDefaultTtlDays() * DAY_MS` and is never `null`.
- [ ] **AC-t2-3 (boundary — AC-03):** Given `link.expires_at === 1000`, then `isExpired(link, 999) === false` and `isExpired(link, 1000) === true`. The exact moment counts as expired.
- [ ] **AC-t2-4 (legacy row — AC-04):** Given `link.expires_at === null` (written before T1's migration), then `isExpired(link, anyNow) === false`. A row with no lifetime never expires.
- [ ] **AC-t2-5 (no click on an expired follow — AC-03):** Given an expired link with `clicks === 5`, when `resolveLink` is called, then it returns the row with `expired: true` and `clicks` is **still** `5`. The counter is not touched.
- [ ] **AC-t2-6 (valid follow still counts — AC-01):** Given a link within its lifetime, when `resolveLink` is called, then it returns `expired: false` and `clicks` increased by one.
- [ ] **AC-t2-7 (one clock reading):** `resolveLink` takes `now` once and passes that same value to `isExpired`. Calling `Date.now()` twice inside one follow lets the link expire between the check and the increment.
- [ ] **AC-t2-8 (seed suite untouched):** `tests/unit/shorten.test.js` and `tests/integration/shorten.test.js` pass **unmodified**. `resolveLink(db, code).url` and `resolveLink(db, 'nope123') === null` both still hold.
- [ ] **AC-t2-9 (list carries the state — AC-05):** Given one valid and one expired link, when `listLinks(db, now)` runs, then each returned row carries `expired` matching what following it would do, computed from the same `now`. `listLinks` never increments a click.

## Checklist (atomic steps for impl-agent)

- [ ] Step 0 — **STOP.** Ask the human for the default lifetime (spec §8). Record the answer in `.env.example`, in the spec's Open questions section, and in an ADR if the reasoning is not obvious. Only then continue.
- [ ] Step 1 — RED: in `tests/unit/expiry.test.js`, assert AC-t2-3 (the boundary). `isExpired` does not exist, so it fails on the import.
- [ ] Step 2 — In `src/shorten.js`, export `DAY_MS` and `isExpired(link, now)`. Treat both `null` and `undefined` `expires_at` as non-expiring — SQLite returns `null`, an in-memory fixture may hand you `undefined`.
- [ ] Step 3 — Export `resolveDefaultTtlDays(env = process.env)`: parse `env.DEFAULT_TTL_DAYS`, fall back to the value the human chose in Step 0. Take `env` as an argument so the test injects it instead of mutating the real environment.
- [ ] Step 4 — Extend `createLink(db, url, { ttlDays } = {})`: compute `createdAt = Date.now()` **once**, derive `expiresAt` from it, insert both.
- [ ] Step 5 — Extend `resolveLink(db, code, now = Date.now())`: read the row, return `null` on a miss, compute `expired = isExpired(row, now)`, increment `clicks` **only** when `!expired`, return `{ ...row, expired }`.
- [ ] Step 6 — Extend `listLinks(db, now = Date.now())` to map each row to `{ ...row, expired: isExpired(row, now) }`, using one `now` for the whole list so no two rows are judged against different clocks.
- [ ] Step 7 — Grow the suite through AC-t2-4 → AC-t2-5 → AC-t2-6 → AC-t2-9 → AC-t2-1 → AC-t2-2, each red before green.
- [ ] Step 8 — Run `npm run test:fast`. The two seed suites must pass without a single edit.

## Edge cases

| Case | Behaviour |
|---|---|
| `now === expires_at` exactly | **Expired.** `now >= expires_at`. Chosen once, in test-plan.md, and asserted from both sides (999 valid, 1000 expired) so the choice cannot silently flip. |
| `expires_at IS NULL` (legacy row) | Never expires. This is why T1 adds a nullable column instead of backfilling: `NULL` means "written before lifetimes existed", and that is a different statement from "expires at the epoch". |
| `resolveLink` returns `{ ...row, expired }` | A computed field rides on the row. The alternative — `{ link, expired }` — would break `resolveLink(db, code).url` in the seed unit test. Spreading keeps AC-t2-8 achievable; the cost is one synthetic key on a database row, and it is worth it. |
| Two `Date.now()` calls in one follow | Forbidden (AC-t2-7). Read once, pass it down. Otherwise a link can be valid at the check and expired at the increment, and the click is counted for a follow that returned `410`. |
| `ttlDays: 0` | An immediately-expired link: `expires_at === created_at`, so the very next read is expired. Legal, and a useful test fixture. Do not special-case it into "no expiry". |
| `ttlDays` negative or not a number | Out of scope for this task — `POST /api/shorten` validates its own input in T3. The domain trusts what it is given here, exactly as `createLink` trusted `url` before `input-validation` shipped. |
| `input-validation` shipped first | Then `createLink` already validates and already returns `{ code, created }`. **Extend that shape** — add `expires_at` to the insert, keep `created`. Do not revert to `{ code }`. Check `git log src/shorten.js` before you start. |

## Definition of Done

- [ ] Step 0 answered by a human, and the answer written down where the next reader will find it.
- [ ] Every checklist step done; AC-t2-1 … AC-t2-9 green.
- [ ] `npm run test:fast` green; `npm run lint` clean.
- [ ] `isExpired` is pure: no `db`, no `Date.now()` inside it.
- [ ] An expired follow leaves `clicks` unchanged — asserted, not assumed.
- [ ] `src/shorten.js` still imports nothing from `express`.
- [ ] PR linked back to `tasks/T2-default-ttl-expiry-state.md`.
- [ ] `tracker.md` updated: status `done`.
