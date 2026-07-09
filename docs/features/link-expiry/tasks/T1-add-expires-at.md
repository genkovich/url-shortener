---
id: T1
title: "Migration: add expires_at column to links"
feature: link-expiry
project: url-shortener
layer: migration
deps: []
acs: ["AC-01", "AC-04"]
files_hint: ["src/db.js", "docs/features/link-expiry/migrations/"]
wave: 1
priority: Must
estimate: S
blocks: [T2]
owner: "TBD"
status: todo
context_budget: "~2000 tokens"
created: 2026-07-09
spec_refs: ["§5 AC-01", "§5 AC-04"]
sad_refs: ["§4 Solution strategy", "§10 QG-2"]
openapi_paths: []
adr_refs: ["ADR-0001"]
---

# T1 · Add the `expires_at` column

**Feature:** [link-expiry](./_epic.md)
**Priority:** Must
**Estimate:** S
**Wave:** 1 (migration)

## Position in the sequence

- **Blocked by:** — nothing. First task of the feature.
- **Blocks:** T2 — the domain cannot record an expiry moment into a column that does not exist.
- **Why this wave:** schema first. Everything else in this feature reads or writes this one column.

## Why (user story)

As a **visitor**, I want a link to carry a lifetime, so that a temporary link can stop working on its own.

Spec US-01 (create a link with a lifetime). AC-01 (the link carries its expiry moment), AC-04 (every link ends with a well-defined expiry state, never ambiguous).

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#4-solution-strategy) — one nullable column, checked on read
- 🗄  Data delta:   [data-model.md](../data-model.md) — `expires_at INTEGER NULL`, unix ms; staged SQL in [../migrations/](../migrations/)
- 🌐 API contract: none — this layer has no HTTP surface
- 📜 Relevant ADR: [ADR-0001](../adr/0001-expiry-check-on-read.md) — expiry is enforced on the read path, so the row survives and only this column is added
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01, AC-04
- 🧬 Parity ref:   `migrate(db)` in `src/db.js` — the base `CREATE TABLE IF NOT EXISTS` sits there; this task appends beside it, never inside it

## Data delta

```sql
-- docs/features/link-expiry/migrations/01_add_expires_at.up.sql
ALTER TABLE links ADD COLUMN expires_at INTEGER;

-- docs/features/link-expiry/migrations/01_add_expires_at.down.sql
-- SQLite before 3.35 has no DROP COLUMN: rebuild the table without it.
CREATE TABLE links_new (…);  INSERT … SELECT …;  DROP TABLE links;  ALTER TABLE links_new RENAME TO links;
```

The staged `.up.sql` becomes a guarded statement inside `migrate(db)`. `ALTER TABLE … ADD COLUMN`
is **not** idempotent in SQLite — a second run raises `duplicate column name: expires_at`. Guard it
by reading `PRAGMA table_info(links)` and adding the column only when it is absent.

```
expires_at INTEGER NULL     -- unix ms, comparable to Date.now()
                            -- NULL on rows written before this migration
```

## API contract

_API surface: none — infra task. The domain (T2) is the only reader of this column._

## Acceptance criteria (GWT)

- [ ] **AC-t1-1 (fresh database — AC-01):** Given `openDb(':memory:')` on a clean process, when it returns, then `PRAGMA table_info(links)` lists `expires_at`.
- [ ] **AC-t1-2 (idempotent):** Given `migrate(db)` runs twice on the same handle, when the second call executes, then it does not throw and the column is present exactly once.
- [ ] **AC-t1-3 (backwards-compat — AC-04):** Given a database holding rows created before this migration, when `openDb` applies it, then those rows survive with `expires_at IS NULL` and still resolve through `GET /:code`.
- [ ] **AC-t1-4 (base schema untouched):** The `CREATE TABLE IF NOT EXISTS links (…)` statement in `src/db.js` is byte-identical to what it was before this task. The new column arrives as a separate statement.
- [ ] **AC-t1-5 (down migration is real):** Applying `01_add_expires_at.down.sql` to a migrated database rebuilds `links` without `expires_at`, preserving every row's `code`, `url`, `created_at` and `clicks`.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — RED: a unit test asserting `PRAGMA table_info(links)` contains `expires_at` after `openDb(':memory:')`. It fails because the column does not exist yet.
- [ ] Step 2 — In `src/db.js`, below the existing `CREATE TABLE`, read the current columns: `db.prepare('PRAGMA table_info(links)').all().map(c => c.name)`.
- [ ] Step 3 — If `expires_at` is absent, run `ALTER TABLE links ADD COLUMN expires_at INTEGER`. Do not wrap it in `IF NOT EXISTS` — SQLite has no such clause for columns.
- [ ] Step 4 — Add the AC-t1-2 test: call `migrate(db)` a second time on the same handle and assert it does not throw.
- [ ] Step 5 — Add the AC-t1-3 test: build a table without the column, insert a row, run `migrate`, assert the row is intact and `expires_at` is `null`.
- [ ] Step 6 — Do **not** touch `src/shorten.js` or `src/app.js`. Nothing yet reads the column; that is T2.

## Edge cases

| Case | Behaviour |
|---|---|
| `migrate` runs twice | Guarded by `PRAGMA table_info`. Without the guard the second `openDb` on an existing `data/links.db` throws `duplicate column name` — meaning the app would start once and never again. This is the whole content of the task. |
| Pre-existing rows | Keep `expires_at IS NULL`. There is no backfill and no `DEFAULT`. What `NULL` *means* is T2's decision (non-expiring), not the migration's. |
| `NOT NULL DEFAULT …` instead of nullable | Rejected. SQLite would have to rewrite every row, and it would force the default-TTL question (spec §8) into the migration, where nobody can see it. Nullable keeps the open question visible. |
| Down migration on SQLite ≥ 3.35 | `DROP COLUMN` exists there, but the staged `.down.sql` uses the table rebuild anyway: it works on every version, and a migration that behaves differently by engine version is a migration that has never been tested where it runs. |
| `expires_at` as an ISO string | Rejected. `created_at` is already unix ms, and a mixed representation in one table is a bug generator. Compare with `Date.now()` directly. |

## Definition of Done

- [ ] Every checklist step done; AC-t1-1 … AC-t1-5 green.
- [ ] `npm run test:fast` green; `npm run lint` clean.
- [ ] The base `CREATE TABLE` in `src/db.js` is unchanged; the column arrives via `ALTER TABLE`.
- [ ] `migrate` is safe to run on a fresh database, on an already-migrated one, and on a pre-migration one.
- [ ] PR linked back to `tasks/T1-add-expires-at.md`.
- [ ] `tracker.md` updated: status `done`.
