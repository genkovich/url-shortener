---
status: Accepted
owner: "genkovich"
reviewers: []
updated_at: "2026-07-10"
feature_size: "M"
ticket: "bulk-and-delete"
---

# 0001 — Hard delete, no tombstone column

- **Status:** Accepted
- **Date:** 2026-07-10
- **Deciders:** genkovich (Architect)

## Context
`DELETE /api/:code` has to remove a link. There are two ways to make a link stop existing: take the row out of the table, or leave the row in place with a `deleted_at` marker and teach every read to skip it.

The choice looks like a storage detail and is not. `links.code` is a `TEXT PRIMARY KEY` and, at the same time, the public path segment of `GET /:code`. Whether a deleted row keeps holding that key decides what a *later* feature is allowed to do with the code. And whichever way we go, the decision is expensive to reverse: soft delete cannot be turned into hard delete without discarding data, and hard delete cannot be turned into soft delete without the rows that were already destroyed.

## Decision drivers
- Every read of `links` today — `resolveLink`, `listLinks`, `getStats` — is a plain `SELECT` with no filter. That property is worth money.
- No migration if one is not needed. `link-expiry` earns its `ALTER TABLE`; this feature should not need one.
- `code` is a primary key *and* a URL path segment. Whatever holds the key holds the URL.
- A rule that is enforced by remembering to write it is a rule that will be forgotten.
- Failures should be loud. A forgotten `WHERE` clause is the quietest failure this codebase can have.

## Considered options
1. **Hard delete.** `DELETE FROM links WHERE code = ?`. The driver reports `changes` as `1` or `0`, which the route turns into `204` or `404`. No schema change.
2. **Soft delete.** Add `deleted_at INTEGER NULL` by migration. `DELETE` sets it. Every read grows `AND deleted_at IS NULL`.
3. **Archive table.** Move the row into `deleted_links` inside a transaction, then delete it from `links`.

## Decision outcome
**Chosen:** Option 1.

Option 2 sounds cautious and is the more dangerous of the two. It costs a column and a migration, which is the small part. The large part is that it adds **an invisible condition to every future `SELECT` in this project**. Today there are three readers. The fourth is written by someone who has never read this file, who queries `links` the way every example in the repository queries `links`, and who ships a list that shows a link the visitor deleted last week. Nothing throws. No test fails, because the test was written by the same person from the same mental model. The whole cost of soft delete is paid later, in a place nobody is looking, by a bug that reports itself as "the delete button doesn't work".

And the specific reason soft delete is wrong *here*, rather than merely risky: `code` is the primary key. A tombstone keeps that key occupied forever. `custom-alias` exists to let a visitor claim a code by name; with tombstones, a code that was deleted five minutes ago is permanently unclaimable, and the refusal it produces — `409 alias taken` — would name a link that no longer exists. The feature would have to learn about `deleted_at` to explain itself, and so would `GET /:code`, and so would the next one.

Option 3 buys real auditability and is the honest choice for a system with money or accounts in it. It costs a second table, a transaction, and a second definition of what a link is. This service has neither accounts nor an audit requirement (`docs/CONTEXT.md`, Out of scope), so it would be paying for a guarantee nobody asked for.

Two properties of the running system make hard delete cheap, and both were measured against this codebase rather than assumed:

- **The driver already reports whether a row was removed.** `db.prepare('DELETE FROM links WHERE code = ?').run(code)` returns `changes: 1` for a present code and `changes: 0` for an absent one — including for a code that was deleted a moment earlier. The domain needs no preceding `SELECT` to distinguish `204` from `404`, and there is no window between a check and a delete for anything to slip through.
- **A deleted primary key is immediately reusable.** After the delete, inserting a row with the same `code` succeeds. That is the property `custom-alias` needs, and it is the property a tombstone would take away.

## Consequences

**Positive**
- No column, no migration, no index. `resolveLink`, `listLinks` and `getStats` are untouched, and stay untouched.
- No read in this project ever has to remember a filter. There is nothing to remember.
- `404` on a second delete falls out of `changes === 0`. It is not a hand-rolled check and cannot drift from the truth.
- A freed code returns to `custom-alias` as a claimable name.

**Negative** — both of these are real losses, and they are the price of the paragraph above.
- **Deletion is irreversible.** There is no undo, no trash, no restore. A visitor who deletes the wrong code has destroyed the mapping, and the only recovery is to create it again from memory. The frontend asks for confirmation before sending the request; that dialog is the entire safety net, and it lives in the browser, where a `curl` never sees it.
- **The click count dies with the row.** `clicks` is a column of `links`, so deleting the link deletes its history. A link followed ten thousand times leaves no trace that it ever existed. Analytics beyond a counter are out of scope, so nothing is being kept anywhere else either.

**Neutral**
- The freed code can be re-claimed, which is a consequence and not a bug — and it is genuinely dangerous. A short URL shared a year ago points at whatever link now holds that code. Someone deletes `launch-2026`, someone else claims `launch-2026`, and every poster printed with the old URL now sends people to a new address. We accept it: the alternative is a permanent reserved list of every code ever deleted, which is a tombstone table with the word "tombstone" removed. Between "the code is gone forever" and "the code can be taken again", a single-visitor toy chooses the one with no extra state.
- Deleting a link does not delete anything else, because nothing else refers to it. If a future feature adds a table with a foreign key into `links`, this decision has to be revisited before that table is written, not after.

## Links
- Spec: [spec.md](../spec.md#5-acceptance-criteria) — AC-01, AC-02, AC-08; and §6.1 for the re-claim abuse case.
- SAD: [sad.md](../sad.md#4-solution-strategy) §4, and [§10](../sad.md#10-quality-requirements) QG-1 (no ghost rows).
- Related: [0001-alias-as-code.md](../../custom-alias/adr/0001-alias-as-code.md) — the alias *is* the primary key, which is why a tombstone would hold it hostage.
- Related: [0001-reject-at-edge-allowlist-schemes.md](../../input-validation/adr/0001-reject-at-edge-allowlist-schemes.md) — the same preference for loud refusal over quiet accommodation.
- Related: [0001-base62-7-char-codes.md](../../../adr/0001-base62-7-char-codes.md) — why a freed code is worth re-issuing at all.
- Related: [0002-sqlite-better-sqlite3.md](../../../adr/0002-sqlite-better-sqlite3.md) — the synchronous driver whose `changes` field this decision leans on.
