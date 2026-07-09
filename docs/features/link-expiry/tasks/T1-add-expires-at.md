---
id: T1
title: "Migration: add expires_at column to links"
layer: "migration"
deps: []
acs: ["AC-01", "AC-04"]
files_hint: ["src/db.js", "docs/features/link-expiry/migrations/"]
owner: "TBD"
estimate: "S"
status: "todo"
---

# T1 — Add expires_at column

## Why
Give a link a lifetime by adding a nullable `expires_at` to `links` ([sad.md](../sad.md) §4, [data-model.md](../data-model.md)). Backs AC-01/04. Additive only — the base schema is never edited.

## What
Staged up/down files under `docs/features/link-expiry/migrations/` (`01_add_expires_at.up` / `.down`), which `implement` promotes into the live migrations. `openDb` applies the new column; existing rows carry no lifetime until it is resolved. Touches `src/db.js`.

## Definition of Done
- [ ] staged up/down migration is promoted to live migrations, then applies and reverts cleanly
- [ ] openDb applies the expires_at column on a fresh database
- [ ] existing links with no lifetime still resolve after the migration
- [ ] lint clean

## Notes
SQLite before 3.35 cannot remove a column in place, so the down migration rebuilds the table without it ([data-model.md](../data-model.md)). Foundation for the domain logic (T2).
