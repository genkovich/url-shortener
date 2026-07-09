---
status: Accepted
owner: "genkovich"
reviewers: ["Tech Lead"]
updated_at: "2026-07-09"
feature_size: "S"
---

# Spec — custom-alias

> **Glossary:** link, code, short_url, alias (see `docs/CONTEXT.md`).
> **Reference module / docs used:** `docs/architecture-map.md`, features `base-vertical`, `input-validation`.

## 1. Context
Every code today is seven random base62 characters: `kmnj8D9`. That is fine for a throwaway link and useless for one a human has to read out loud, print on a poster, or recognise in a chat. This feature lets the visitor choose the code themselves — `launch-2026` instead of `kmnj8D9`. The chosen handle *is* the code; nothing else about the link changes.

The change is small but it touches the one place where a mistake is unrecoverable: the code is the primary key and the public path segment. A badly-shaped alias can shadow an existing route, and a taken alias must never silently overwrite someone's link.

## 2. Goals
- A visitor can supply an alias when creating a link, and the short URL uses it verbatim.
- Omitting the alias keeps the current behaviour: a random seven-character code.
- Aliases that would be unreachable, unsafe in a URL path, or already taken are refused with a clear, distinguishable error.

## 3. Non-goals
- Renaming the code of an existing link (no edit surface).
- Reserving an alias without creating a link.
- Vanity domains, per-user namespaces, or ownership of an alias — single-visitor toy.
- Case-folding aliases so `Foo` and `foo` collide (see §6 and ADR 0001).

## 4. User stories
### US-01: Choose my own short code
**As a** visitor
**I want** to supply the code when I shorten a URL
**So that** the short link is readable and memorable.

### US-02: Be refused clearly when the alias cannot be used
**As a** visitor
**I want** a distinct error for a malformed alias, a reserved alias and a taken alias
**So that** I know whether to fix my input or pick a different name.

### US-03: Have an aliased link behave like any other
**As a** visitor
**I want** following, stats and the links list to work identically for an aliased link
**So that** the alias is a naming choice, not a different kind of link.

## 5. Acceptance criteria
### AC-01 (US-01) — happy path
**Given** a valid URL and an unused, well-formed alias
**When** the visitor shortens it
**Then** a link is created whose code is exactly that alias, and the short URL contains it.

### AC-02 (US-01) — happy path (no alias)
**Given** a valid URL and no alias
**When** the visitor shortens it
**Then** a link is created with a random seven-character code, exactly as before.

### AC-03 (US-02) — error (malformed alias)
**Given** an alias that is too short, too long, or contains a character outside the allowed set
**When** the visitor tries to shorten
**Then** the request is refused as invalid and nothing is stored.

### AC-04 (US-02) — error (reserved alias)
**Given** an alias that would collide with a service path, in any letter case
**When** the visitor tries to shorten
**Then** the request is refused as reserved and nothing is stored.

### AC-05 (US-02) — error (alias already taken)
**Given** an alias that is already the code of an existing link
**When** the visitor tries to shorten
**Then** the request is refused as a conflict, and the existing link is left untouched.

### AC-06 (US-03) — domain invariant
**Given** a link created with an alias
**When** it is followed, listed, or asked for its stats
**Then** it behaves exactly as a link with a generated code: the same redirect, the same click counting, the same list row.

### AC-07 (US-01) — cross-context
**Given** a URL that is already stored under some code
**When** the visitor shortens the same URL again **with an alias**
**Then** a second link is created under that alias, and both codes resolve to the same address.
De-duplication (`input-validation` AC-07) applies only when no alias is requested — an explicit alias is an explicit request for a new handle.

> **Authorization:** N/A — single-visitor toy, no accounts. Anyone can claim any free alias.

## 6. Non-functional requirements
| Aspect | Target | Measurement |
|---|---|---|
| Alias shape | `^[A-Za-z0-9_-]{3,32}$` | allowlist, not a blocklist of bad characters |
| Reserved names | `api`, `healthz`, `metrics` | compared case-insensitively |
| Alias uniqueness | case-**sensitive** | `Foo` and `foo` are two different links |
| Collision check | one indexed lookup on the primary key | no scan |

Two facts drive the case asymmetry, and both were measured against this codebase:

- **Express routes are matched case-insensitively by default.** `GET /HEALTHZ` reaches the `/healthz` handler. An alias `Healthz` would therefore be stored and then be permanently unreachable. Reserved names must be compared with the case folded away.
- **SQLite compares `TEXT PRIMARY KEY` with the binary collation.** `Foo` and `foo` are distinct keys. Generated base62 codes already rely on this (`kmnj8D9` ≠ `KMNJ8d9`), so aliases inherit it rather than inventing a second rule.

## 6.1 Security / privacy
- Data classification: public URLs and public handles.
- Personal data: none.
- AuthZ/AuthN impact: none. An alias is first-come, first-served; there is no ownership to enforce.
- Abuse cases:
  - **Route shadowing** — an alias equal to a service path (`healthz`) would create a link nobody can follow. Refused by the reserved list.
  - **Path injection** — an alias containing `/`, `.`, `?` or `%` would change what the path means. Refused by the character allowlist, which is why it is an allowlist (ADR 0001).
  - **Squatting** — a visitor can take any free alias. Accepted: single-visitor toy, no accounts to protect.
  - **Overwrite** — a taken alias must never replace an existing link. Refused as a conflict; the store is never written on this path.
- Security review: N/A (single-visitor toy). The allowlist and the reserved list are the security-relevant decisions.

## 7. Metrics / KPIs
- Share of links created with an explicit alias: baseline 0 → observed (adoption).
- Refused alias attempts, split by reason (invalid / reserved / taken): observed.
- Redirect success for aliased links: ~100%, identical to generated codes.

## 8. Open questions
- [ ] None blocking. The character set, the length bounds (3–32) and the reserved list are fixed in §6; the alias-as-code decision is settled in ADR 0001; the interaction with dedup is fixed in AC-07.
