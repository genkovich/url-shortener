---
status: Accepted
owner: "genkovich"
reviewers: ["Tech Lead"]
updated_at: "2026-07-08"
feature_size: "M"
---

# Spec — link-expiry

> **Glossary:** link, code, expiry, TTL (see `docs/CONTEXT.md`).
> **Reference module / docs used:** `docs/architecture-map.md`, feature `base-vertical`.

## 1. Context
Links currently live forever. Users often share links that should only work for a while — a temporary invite, a time-boxed promo. Without expiry, stale links keep resolving indefinitely, which is both a footgun and a small security risk. This feature lets a link carry a lifetime, after which following it stops working and it is shown as expired.

## 2. Goals
- A user can give a link a lifetime when creating it.
- Following an expired link fails clearly instead of redirecting.
- Expired links are visibly marked in the links list.

## 3. Non-goals
- Physically deleting expired rows — a separate cleanup loop (keeps this feature read-path only).
- Extending or changing the lifetime of an existing link (no edit surface yet).
- Per-user default policies — single-user toy.

## 4. User stories
### US-01: Create a link with a lifetime
**As a** visitor
**I want** to set how long a new link stays valid
**So that** temporary links stop working on their own.

### US-02: Be stopped from following an expired link
**As a** visitor
**I want** an expired link to refuse to redirect
**So that** stale links can't silently send people somewhere.

### US-03: See which links are expired
**As a** visitor
**I want** the list to show a link's expired state
**So that** I know which links no longer work.

## 5. Acceptance criteria
### AC-01 (US-01) — happy path
**Given** a valid URL and a chosen lifetime
**When** the visitor creates the link
**Then** the link is created carrying that expiry moment.

### AC-02 (US-02) — happy path (still valid)
**Given** a link within its lifetime
**When** the visitor follows it
**Then** they are redirected as usual.

### AC-03 (US-02) — error (expired)
**Given** a link whose lifetime has passed
**When** the visitor follows it
**Then** the system refuses and reports the link as gone.

### AC-04 (US-01) — domain invariant
**Given** a link created without a chosen lifetime
**When** the resolved default lifetime applies
**Then** every link has a well-defined expiry state (never ambiguous).

### AC-05 (US-03) — cross-context
**Given** a mix of valid and expired links
**When** the user views the links list
**Then** each link's expired/active state is reflected consistently with what following it would do.

> **Authorization:** N/A — single-user toy.

## 6. Non-functional requirements
| Aspect | Target | Measurement |
|---|---|---|
| Expiry check overhead | < 1 ms per follow | timing on read path |
| Expiry resolution | 1 second | comparison granularity |

## 6.1 Security / privacy
- Data classification: public URLs.
- Personal data: none.
- AuthZ/AuthN impact: none — single-visitor service, no accounts.
- Abuse cases: following a link past its lifetime — the read path refuses it and reports it gone.
- Security review: N/A (single-visitor toy).

## 7. Metrics / KPIs
- Share of links created with an explicit TTL: baseline 0 → observed.
- Refused-as-expired follows: observed (signals expiry working).
- Redirect success for valid links: ~100%.

> **Authorization:** N/A — single-visitor service, no accounts or ownership.

## 8. Open questions
- [ ] Default lifetime when the visitor gives none? `.env.example` ships `DEFAULT_TTL_DAYS=` empty on purpose. Default now: **undecided — ask the human before implementing T2.** — owner: human, due: before implement.
