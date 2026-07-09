---
status: Accepted
owner: "genkovich"
reviewers: ["Tech Lead"]
updated_at: "2026-07-08"
feature_size: "S"
---

# Spec — base-vertical

> **Glossary:** link, code, short_url, click, frontend (see `docs/CONTEXT.md`).
> **Reference module / docs used:** `docs/architecture-map.md`.
> **Worked example** — this feature is already shipped. It shows a full SDD pack (spec → sad → tasks → tests → code). Repeat the shape on your features.

## 1. Context
A user has a long URL and wants a short one they can share. They paste the URL and get back a short handle that redirects to the original. Following the handle should be counted so the user sees how often a link is used. This is the smallest useful slice of the product; validation, expiry, aliases and other behaviours are separate features so this slice stays minimal.

## 2. Goals
- A user can turn any URL into a short link.
- Following a short link redirects to the original and records the visit.
- A user can see their links and how many times each was followed.

## 3. Non-goals
- URL validation — deferred to feature `input-validation` (keeps the seed minimal and teachable).
- Dedup, expiry, custom alias — each its own feature (separable concerns).
- Authentication / ownership — single-user toy (no auth surface).

## 4. User stories
### US-01: Shorten a URL
**As a** visitor
**I want** to submit a URL and receive a short handle
**So that** I can share a compact link.

### US-02: Follow a short link
**As a** visitor
**I want** the short handle to redirect me to the original URL
**So that** the short link is actually usable.

### US-03: See my links
**As a** visitor
**I want** to list my links with their click counts
**So that** I can track usage.

## 5. Acceptance criteria
### AC-01 (US-01) — happy path
**Given** a non-empty URL
**When** the visitor submits it to be shortened
**Then** a new link with a short code is created and its short handle is returned.

### AC-02 (US-02) — happy path
**Given** an existing link
**When** the visitor follows its code
**Then** they are redirected to the original URL and the click is counted.

### AC-03 (US-03) — error
**Given** a code that does not exist
**When** stats for that code are requested
**Then** the system reports the link as not found.

### AC-04 (US-02) — domain invariant
**Given** a link that has been created
**When** it is followed any number of times
**Then** its code always maps to the same original URL and its click count only ever increases.

### AC-05 (US-03) — cross-context
**Given** a link that was just created
**When** the visitor views their links list
**Then** the same link appears there with its current click count, consistent with what following it would do.

> **Authorization:** N/A — single-visitor service with no accounts or ownership; no authorization rule exists to specify (recorded in `docs/CONTEXT.md` Out of scope).

## 6. Non-functional requirements
| Aspect | Target | Measurement |
|---|---|---|
| Create latency | < 50 ms local | manual timing / logs (feature `observability`) |
| Code collision rate | ~0 at toy scale | regenerate-on-collision guard |

## 6.1 Security / privacy
- Data classification: public URLs only.
- Personal data: none.
- AuthZ/AuthN impact: none — single-visitor service, no accounts.
- Abuse cases: open-redirect / malicious URLs — mitigated later by `input-validation`.
- Security review: N/A for seed.

## 7. Metrics / KPIs
- Links created: baseline 0 → any (adoption).
- Redirect success rate: target ~100% for existing codes.
- Clicks per link: observed, no target.

## 8. Open questions
- [ ] None — seed scope is intentionally fixed.

## Test plan
> Inline (route = quick, size S).

### AC coverage
| AC | Test name | Level | Expected outcome |
|---|---|---|---|
| AC-01 | shorten returns a short handle | Integration | new link created, short handle returned |
| AC-02 | follow redirects and counts | Integration | redirected to original, click counted |
| AC-03 | stats for unknown code | Integration | reported as not found |
| AC-04 | code stable, clicks monotonic | Unit | same address, clicks only increase |
| AC-05 | new link appears in list | Integration | listed with current click count |

### Edge cases / error paths
- Unknown code on follow → reported as not found.
- Code collision → regenerate (guard in domain layer).
