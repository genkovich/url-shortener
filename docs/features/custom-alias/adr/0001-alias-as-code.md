---
status: Accepted
owner: "genkovich"
reviewers: []
updated_at: "2026-07-09"
feature_size: "S"
ticket: "custom-alias"
---

# 0001 — The alias is the code, not a second column

- **Status:** Accepted
- **Date:** 2026-07-09
- **Deciders:** genkovich (Architect)

## Context
A visitor wants `example.com/launch-2026` instead of `example.com/kmnj8D9`. The service already has exactly one public handle per link: `links.code`, a `TEXT PRIMARY KEY` that is also the path segment of `GET /:code`.

We must decide whether a chosen alias *replaces* that code, or lives beside it as a second identity for the same link. We must also decide how alias shape is enforced, because the code is a permanent public path segment: a rule that lets a bad alias through cannot be tightened afterwards without breaking links that already exist.

## Decision drivers
- The code is a primary key **and** a URL path segment. Both properties must hold for an alias.
- No migration if one is not needed. `link-expiry` earns its `ALTER TABLE`; this feature does not.
- Exactly one way to resolve a link. Two resolution paths is two chances to disagree.
- Unknown input should fail closed — the same reasoning that produced the scheme allowlist in `input-validation` ADR 0001.

## Considered options
1. **The alias *is* the code.** `createLink` inserts the alias into `code`. Uniqueness is the existing primary key. `GET /:code` needs no change. Shape is enforced by a character allowlist plus a reserved-name list.
2. **A separate nullable `alias` column** with its own unique index. `resolveLink` looks up `code`, then falls back to `alias`.
3. **Keep the alias in `code` but sanitise instead of refuse** — strip disallowed characters, lowercase, truncate to 32.

## Decision outcome
**Chosen:** Option 1.

Option 2 buys nothing and costs a migration, a second unique index, and a second lookup on the hottest path. Worse, it creates two names for one link, which forces four new questions nobody asked: does `GET /:code` prefer the code or the alias when they collide across rows? Does the list show both? Does `getStats` accept either? Each answer is a place for the two paths to drift.

Option 3 is the failure this project already refused once. Sanitising means `my link!` and `my-link` and `mylink` can all silently become the same code, so the visitor gets a handle they never typed, and a second visitor's alias can quietly land on the first one's link. Refusing is louder and correct: the visitor learns immediately, and nothing is stored.

Two properties of the running system make the allowlist mandatory rather than tidy, and both were measured against this codebase rather than assumed:

- **Express matches routes case-insensitively by default.** `GET /HEALTHZ` reaches the `/healthz` handler. So the reserved-name check must fold case, or an alias `Healthz` is accepted, stored, and then unreachable forever.
- **SQLite compares `TEXT PRIMARY KEY` with the binary collation.** `Foo` and `foo` are distinct keys. Alias uniqueness therefore stays case-sensitive, which is the rule generated base62 codes already live by (`kmnj8D9` ≠ `KMNJ8d9`). Folding case for uniqueness would change the meaning of every code already issued.

The asymmetry — case-insensitive reserved check, case-sensitive uniqueness — is deliberate. It is not elegant. It is what the two layers underneath actually do.

## Consequences
**Positive**
- No migration, no index, no second column. `GET /:code` is untouched.
- One resolution path, so no chance of the two disagreeing.
- Unknown characters fail closed. A future URL-syntax surprise is refused, not stored.
- `409` on a taken alias is a natural consequence of the primary key, not a hand-rolled check.

**Negative**
- The reserved list must be maintained by hand, and it must grow whenever a route is added above the catch-all `GET /:code`. Forgetting is silent: the alias is accepted and the link is unreachable. Recorded as a hard rule in the epic.
- An alias cannot be released or renamed, because renaming a primary key means breaking every link already shared.
- `Foo` and `foo` are two links. Surprising to a visitor; consistent with everything else.

**Neutral**
- De-duplication (`input-validation` AC-07) is skipped whenever an alias is requested. Asking for a specific handle is asking for a new link, not for the one that happens to already point there.

## Links
- Spec: [spec.md](../spec.md) §5 (AC-03, AC-04, AC-05), §6, §6.1.
- SAD: [sad.md](../sad.md) §4, §10 (QG-1, QG-2).
- Related: [0001-reject-at-edge-allowlist-schemes.md](../../input-validation/adr/0001-reject-at-edge-allowlist-schemes.md) — the same allowlist-not-blocklist reasoning, applied to schemes.
- Related: [0001-base62-7-char-codes.md](../../../adr/0001-base62-7-char-codes.md) — why the generated code looks the way it does.
