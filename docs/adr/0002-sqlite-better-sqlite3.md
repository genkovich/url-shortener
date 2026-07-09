---
status: Accepted
owner: "genkovich"
reviewers: []
updated_at: "2026-07-08"
feature_size: "S"
ticket: "base-vertical"
---

# 0002 — Persist links in SQLite via better-sqlite3

- **Status:** Accepted
- **Date:** 2026-07-08
- **Deciders:** genkovich (Architect)

## Context
Persistent link storage must run on any contributor's machine (Windows/macOS/Linux) with zero setup friction — clone, `npm install`, run.

## Decision drivers
- "works for everyone" — no external services, no native compilation.
- Looks like a real product (persists across restarts).
- Simple synchronous API for teaching code.

## Considered options
1. **SQLite file via `better-sqlite3`** — prebuilt binaries, synchronous API.
2. **In-memory / JSON file** — simplest, but not product-like; persistence hand-rolled.
3. **Postgres in Docker** — most realistic, but `docker compose up` risks "didn't start".
4. **`node:sqlite`** — built-in, but stable only in Node 24+ / needs a flag.

## Decision outcome
**Chosen:** Option 1. `better-sqlite3` ships prebuilt binaries (no node-gyp in the common case), a synchronous API, and file persistence. Best balance of realistic + reliable + simple.

## Consequences
**Positive**
- Installs via `npm install`; no external service.
- Tests run against `:memory:`; readable synchronous code.

**Negative**
- Theoretical fallback compilation on an exotic platform.

**Neutral**
- SQLite is not a production DB under concurrent load (out of scope at this size).

## Links
- Spec: [spec.md](../features/base-vertical/spec.md) §1.
- SAD: [sad.md](../features/base-vertical/sad.md) §4, §9.
- Related ADR: [0001-base62-7-char-codes.md](./0001-base62-7-char-codes.md).
- Infra: `src/db.js`.
