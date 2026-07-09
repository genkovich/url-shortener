---
id: T2
title: "Domain: generateCode, createLink, resolveLink, listLinks, getStats"
layer: "domain"
deps: ["T1"]
acs: ["AC-01", "AC-02", "AC-04"]
files_hint: ["src/shorten.js"]
owner: "genkovich"
estimate: "S"
status: "done"
---

# T2 — Domain functions

## Why
Domain layer for the shortener, HTTP-free (see [sad.md](../sad.md) §5, ADR 0001). Backs AC-01/02/04.

## What
Pure functions over a `db` handle: `generateCode()` (base62/7), `createLink(db,url)` (insert + collision guard), `resolveLink(db,code)` (read + clicks++), `listLinks(db)`, `getStats(db,code)`.

## Definition of Done
- [x] createLink returns a 7-char code
- [x] collision regenerates before insert
- [x] resolveLink increments clicks and returns the row (null if missing)
- [x] no HTTP / Express imports in this file

## Notes
Parallelizable with UI (T4) once routes (T3) exist. Precedent for all future domain rules.
