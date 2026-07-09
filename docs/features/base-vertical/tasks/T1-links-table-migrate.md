---
id: T1
title: "Create links table + openDb/migrate"
feature: base-vertical
project: url-shortener
layer: migration
deps: []
acs: ["AC-01"]
files_hint: ["src/db.js"]
wave: 1
priority: Must
estimate: S
blocks: [T2]
owner: "genkovich"
status: done
context_budget: "~1500 tokens"
created: 2026-07-08
spec_refs: ["§5 AC-01"]
sad_refs: ["§5 Building block view"]
openapi_paths: []
adr_refs: ["ADR-0002"]
---

# T1 · `links` table + `openDb` / `migrate`

**Feature:** [base-vertical](./_epic.md)
**Priority:** Must
**Estimate:** S
**Wave:** 1 (migration)

> **Shipped.** This is a worked example: the sections below describe what was actually built,
> not what someone intended to build. Copy the shape, not the contents.

## Position in the sequence

- **Blocked by:** — nothing. First task of the first feature.
- **Blocks:** T2 — every domain function takes the `db` handle this task produces.
- **Why this wave:** nothing above it can be tested until there is a schema to test against.

## Why (user story)

As a **visitor**, I want my shortened links to survive a restart, so that a short link keeps working tomorrow.

Spec US-01 (shorten a URL). AC-01 (a link is created and its short handle returned) — which presupposes somewhere to put it.

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#5-building-block-view) — `db` is the infra module every layer sits on
- 🗄  Data delta:   the base `links` table, created inline here (see below)
- 🌐 API contract: none — this layer has no HTTP surface
- 📜 Relevant ADR: [ADR-0002](../../../adr/0002-sqlite-better-sqlite3.md) — SQLite via `better-sqlite3`, synchronous, prebuilt binaries, zero setup
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01
- 🧬 Parity ref:   none — this task *is* the precedent for every later migration

## Data delta

```sql
CREATE TABLE IF NOT EXISTS links (
  code       TEXT PRIMARY KEY,        -- base62, 7 chars (ADR-0001)
  url        TEXT NOT NULL,           -- the original address
  created_at INTEGER NOT NULL,        -- unix ms
  clicks     INTEGER NOT NULL DEFAULT 0
);
```

`openDb(path)` opens the handle, sets `journal_mode = WAL`, calls `migrate(db)`, returns it.
`path` defaults to `process.env.DB_PATH || 'data/links.db'`; `':memory:'` is what the tests pass.
`mkdirSync(dirname(path), { recursive: true })` runs first, because `better-sqlite3` will not
create the directory and a fresh clone has no `data/`.

## API contract

_API surface: none — infra task. `src/app.js` receives an already-open handle via `createApp(db)`._

## Acceptance criteria (GWT)

- [x] **AC-t1-1 (schema on open — AC-01):** Given `openDb(':memory:')`, when it returns, then the `links` table exists with `code`, `url`, `created_at` and `clicks`.
- [x] **AC-t1-2 (no separate migrate step):** Given a caller holds the returned handle, when it issues a query, then no explicit `migrate()` call was needed — `openDb` already ran it.
- [x] **AC-t1-3 (idempotent):** Given `openDb` is called twice on the same file, when the second call runs, then `CREATE TABLE IF NOT EXISTS` is a no-op and existing rows survive.
- [x] **AC-t1-4 (fresh clone):** Given `data/` does not exist, when `openDb('data/links.db')` runs, then the directory is created and the open succeeds.

## Checklist (atomic steps for impl-agent)

- [x] Step 1 — `src/db.js`: `openDb(path = process.env.DB_PATH || 'data/links.db')`.
- [x] Step 2 — `mkdirSync(dirname(path), { recursive: true })` unless `path === ':memory:'`.
- [x] Step 3 — `new Database(path)`, then `db.pragma('journal_mode = WAL')`.
- [x] Step 4 — `migrate(db)` with the `CREATE TABLE IF NOT EXISTS` above; export both functions.
- [x] Step 5 — Unit-test through `openDb(':memory:')`; no file is written by the test suite.

## Edge cases

| Case | Behaviour |
|---|---|
| `path === ':memory:'` | `mkdirSync` is skipped — `dirname(':memory:')` is `'.'`, which exists, but the guard makes the intent explicit rather than relying on that accident. |
| `data/` missing on a fresh clone | Created recursively. This is the whole reason the guard exists; `better-sqlite3` throws `SQLITE_CANTOPEN` otherwise. |
| WAL mode | Adds `links.db-wal` and `links.db-shm` beside the database. All three are gitignored, and `tests/e2e/reset-db.js` deletes all three — deleting only `.db` leaves a stale WAL that resurrects old rows. |
| Second `openDb` on the same file | Safe. `IF NOT EXISTS` makes `migrate` a no-op; the e2e server and a stray `npm run dev` can both hold the file. |
| A later feature needs a column | It does **not** edit this `CREATE TABLE`. It adds a separate idempotent `ALTER TABLE` — see `link-expiry` T1 and `docs/architecture-map.md` → Conventions → Migrations. |

## Definition of Done

- [x] Every checklist step done; AC-t1-1 … AC-t1-4 green.
- [x] `npm run test:fast` green; `npm run lint` clean.
- [x] The base schema is created inline here, never through a staged migration file.
- [x] PR linked back to `tasks/T1-links-table-migrate.md`.
- [x] `tracker.md` updated: status `done`.
