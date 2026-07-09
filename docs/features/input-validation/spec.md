---
status: Accepted
owner: "genkovich"
reviewers: ["Tech Lead"]
updated_at: "2026-07-08"
feature_size: "S"
---

# Spec — input-validation

> **Glossary:** link, code, short_url, url, frontend (see `docs/CONTEXT.md`).
> **Reference module / docs used:** `docs/architecture-map.md`, feature `base-vertical`.

## 1. Context
Today `POST /api/shorten` stores whatever it is given — the base vertical is deliberately happy-path only (`base-vertical` §3 defers validation here). An empty string, a `javascript:` scheme, a megabyte of garbage, or a URL with stray whitespace all become stored links. That produces dead links, an unsafe-scheme footgun, and duplicate rows for the same address. This feature rejects bad input at the edge before anything is stored, and normalizes what it does store.

## 2. Goals
- A valid `http`/`https` URL still shortens exactly as before.
- Empty, unsafe-scheme, malformed, and absurdly long URLs are rejected with a clear error before storage.
- A stored URL is normalized (trimmed), and shortening the same URL twice reuses the same code.

## 3. Non-goals
- Reachability / liveness checks (no network call to the target — a valid-looking URL is enough).
- Domain blocklists — a separate feature (`blocklist`, later).
- Canonicalization beyond trimming (no lowercasing host, no stripping query/fragment — too opinionated for a toy).
- Rate limiting — separate feature (`rate-limiting`).

## 4. User stories
### US-01: Shorten a valid URL
**As a** visitor
**I want** a well-formed `http`/`https` URL to shorten as it does now
**So that** the happy path is unchanged.

### US-02: Have bad input rejected before it is stored
**As a** visitor
**I want** empty, unsafe-scheme, malformed, and oversized URLs refused with a clear message
**So that** I never create a dead or unsafe link.

### US-03: Have my URL normalized and de-duplicated
**As a** visitor
**I want** stray whitespace trimmed and the same URL to reuse its code
**So that** identical links don't pile up as separate rows.

## 5. Acceptance criteria
### AC-01 (US-01) — happy path
**Given** a well-formed `https://` URL
**When** the visitor shortens it
**Then** a link is created and a short code is returned, exactly as base-vertical.

### AC-02 (US-02) — error (empty)
**Given** an empty or whitespace-only URL
**When** the visitor tries to shorten it
**Then** the request is refused with a validation error and nothing is stored.

### AC-03 (US-02) — error (unsafe scheme)
**Given** a URL whose scheme is not `http`/`https` (e.g. `javascript:`, `data:`, `file:`, `ftp:`)
**When** the visitor tries to shorten it
**Then** the request is refused with a validation error and nothing is stored.

### AC-04 (US-02) — error (malformed)
**Given** a string that is not a parseable URL with a host (e.g. `not a url`, `http://`)
**When** the visitor tries to shorten it
**Then** the request is refused with a validation error and nothing is stored.

### AC-05 (US-02) — error (too long)
**Given** a URL longer than the maximum accepted length
**When** the visitor tries to shorten it
**Then** the request is refused with a validation error and nothing is stored.

### AC-06 (US-03) — normalization
**Given** a valid URL with leading/trailing whitespace
**When** the visitor shortens it
**Then** the link is created and the stored URL carries no surrounding whitespace.

### AC-07 (US-03) — dedup (domain invariant)
**Given** a URL that, after normalization, is already stored
**When** the visitor shortens it again
**Then** the existing code is returned and no second row is created.

> **Authorization:** N/A — single-visitor toy, no accounts.

## 6. Non-functional requirements
| Aspect | Target | Measurement |
|---|---|---|
| Validation overhead | < 1 ms per create | timing on the create path |
| Max URL length | 2048 chars | rejected above the limit |
| Accepted schemes | `http`, `https` only | allowlist, not blocklist |

## 6.1 Security / privacy
- Data classification: public URLs.
- Personal data: none.
- AuthZ/AuthN impact: none — single-visitor service, no accounts.
- Abuse cases: unsafe schemes (`javascript:`, `data:`, `file:`) that could be dangerous if a link is trusted and clicked — refused by the scheme allowlist; oversized payloads — refused by the length cap.
- Security review: N/A (single-visitor toy), but the scheme allowlist is the security-relevant decision (see ADR 0001).

## 7. Metrics / KPIs
- Share of create attempts refused as invalid: observed (signals validation working).
- Duplicate creates collapsed by dedup: observed.
- Redirect success for created links: ~100% (no dead links stored).

## 8. Open questions
- [ ] None blocking. Max length fixed at 2048 and scheme allowlist fixed at `http`/`https` (spec §6, ADR 0001). Reachability checks explicitly out of scope (§3).
