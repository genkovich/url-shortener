---
id: T1
title: "Create links table + openDb/migrate"
layer: "migration"
deps: []
acs: ["AC-01"]
files_hint: ["src/db.js"]
owner: "genkovich"
estimate: "S"
status: "done"
---

# T1 — Links table + migrate

## Why
Backing store for the shortener: the `links` table plus the `openDb` entry point every layer builds on (see [sad.md](../sad.md) §5). Backs AC-01.

## What
`openDb(path)` opens a synchronous SQLite handle and ensures the `links` table exists with columns for the short code (primary key), the original url, a creation timestamp, and a click counter. Callers receive a ready handle; the seed schema needs no separate migrate step.

## Definition of Done
- [x] openDb on an in-memory database creates the links table with columns for code, url, creation time, and clicks
- [x] a fresh database is ready to use with no separate migrate call
- [x] domain and route layers obtain a ready handle from this module
- [x] lint clean

## Notes
Seed schema is created inline here, not via a staged migration; later features (link-expiry) add columns through staged, promoted migrations. Foundation for every other task in this feature.
