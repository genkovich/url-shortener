---
status: Accepted
owner: "genkovich"
reviewers: []
updated_at: "2026-07-08"
feature_size: "S"
ticket: "base-vertical"
---

# 0001 — Generate short codes as base62, length 7

- **Status:** Accepted
- **Date:** 2026-07-08
- **Deciders:** genkovich (Architect)

## Context
The shortener must produce short, unique, URL-safe codes. Alphabet and length must be chosen up front because they shape collision probability and the code column.

## Decision drivers
- URL-safe without percent-encoding.
- Large enough space that collisions are rare at toy scale.
- Short and readable.

## Considered options
1. **base62 (A-Za-z0-9), length 7** — 62^7 ≈ 3.5·10¹² combinations.
2. **base36 (a-z0-9), length 8** — smaller alphabet, longer code for similar space.
3. **UUID** — collision-free but long and ugly in a URL.

## Decision outcome
**Chosen:** Option 1. base62/7 gives a huge space with a short code; a regenerate-on-collision guard in `createLink` covers the rare clash.

## Consequences
**Positive**
- Short, URL-safe codes.
- Trivial generator; no dependency.

**Negative**
- Case-sensitive (EoMYdbu ≠ eomydbu); users must copy exactly.

**Neutral**
- At billions of links a longer length would be needed (out of scope).

## Links
- Spec: [[../features/base-vertical/spec.md]] §5 (AC-01).
- SAD: [[../features/base-vertical/sad.md]] §4, §9.
- Related ADR: [[0002-sqlite-better-sqlite3.md]].
- Domain: `src/shorten.js` → `generateCode()`.
