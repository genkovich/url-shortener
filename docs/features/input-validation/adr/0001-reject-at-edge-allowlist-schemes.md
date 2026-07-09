---
status: Accepted
owner: "genkovich"
reviewers: []
updated_at: "2026-07-08"
feature_size: "S"
ticket: "input-validation"
---

# 0001 — Reject at the edge with a scheme allowlist, not a blocklist

- **Status:** Accepted
- **Date:** 2026-07-08
- **Deciders:** genkovich (Architect)

## Context
The create path must refuse unsafe and malformed URLs. We must decide *where* validation happens and *how* scheme safety is enforced. A short link is trusted and clicked later, so an unsafe scheme (`javascript:`, `data:`, `file:`) stored now is a footgun paid at click time.

## Decision drivers
- Safety by default — an unknown scheme should fail closed, not open.
- Keep routes thin — validation is a domain rule, not HTTP plumbing (architecture-map).
- No new dependency — the platform `URL` parser is enough.

## Considered options
1. **Allowlist `http`/`https`, validated in a domain guard.** Any other scheme is refused. Guard lives in `src/shorten.js`; the route just maps the error to 400.
2. **Blocklist known-bad schemes.** Enumerate `javascript:`, `data:`, `file:`, … and refuse those.
3. **Validate in the route handler.** Inline checks in `src/app.js`.

## Decision outcome
**Chosen:** Option 1. An allowlist fails closed — a scheme nobody thought of is refused rather than slipping through, which a blocklist (Option 2) cannot promise. Putting the guard in the domain layer (not Option 3) keeps the route thin and makes the rule unit-testable without HTTP, matching the architecture-map convention and the base-vertical precedent.

## Consequences
**Positive**
- Unknown/exotic schemes fail closed — safer default.
- Rule is a pure function → cheap red→green TDD, no HTTP scaffolding needed.
- Route stays thin; no new dependency (platform `URL`).

**Negative**
- A legitimate non-`http`/`https` scheme would be refused until the allowlist is widened.

**Neutral**
- Max length (2048) and trim normalization ride in the same guard.

## Links
- Spec: [[../spec.md]] §5 (AC-03), §6.1.
- SAD: [[../sad.md]] §4, §10 (QG-1).
