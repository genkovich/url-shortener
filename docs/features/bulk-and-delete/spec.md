---
status: Accepted
owner: "genkovich"
reviewers: ["Tech Lead"]
updated_at: "2026-07-10"
feature_size: "M"
---

# Spec — bulk-and-delete

> **Glossary:** link, code, short_url, click, visitor (see `docs/CONTEXT.md`).
> **Reference module / docs used:** `docs/architecture-map.md`, features `base-vertical`, `input-validation`, `custom-alias`.

## 1. Context
A link can be created and followed. It cannot be removed, and it can only be created one at a time. `DELETE /api/:code` exists today as a `501` stub in `src/app.js`, announcing this very feature; there is no bulk endpoint at all. A visitor who pastes a wrong URL lives with it forever, and a visitor migrating fifty bookmarks fills the form fifty times.

Two operations close both gaps, and they are one feature because they share nothing except the table they touch. Delete is the first write path in this service that **destroys** state rather than adding to it, and the code it frees is the primary key and the public path segment. Bulk is the first endpoint that can half-succeed: ninety-nine links created and one URL refused is not an error, it is the answer.

## 2. Goals
- A visitor can remove a link by its code, and the row is gone — no tombstone, no filtered-out ghost.
- A visitor can submit up to 100 URLs in one request and learn, per URL and in order, what happened to it.
- A malformed URL inside a batch refuses only itself. Its neighbours are created.
- Both operations reuse the rules `input-validation` already owns; neither invents a second one.

## 3. Non-goals
- Undo, trash, or restore. Delete is final (→ [ADR 0001](adr/0001-hard-delete.md)).
- Bulk delete (`DELETE /api/links`, a list of codes). Named here only because the route table must be arranged so it can be added later without breaking (§6, hard rules in [tasks/_epic.md](tasks/_epic.md)).
- Ownership or authorization. Anyone can delete any link — the service has no accounts (`docs/CONTEXT.md`, Out of scope).
- Preserving click history past deletion. The counter lives in the row and dies with it.
- Raising the request body limit so that 100 maximum-length URLs fit (§6, §8).
- Bulk creation with aliases. An alias is a single chosen handle (`custom-alias` ADR 0001); a hundred of them in one array is a different feature.

## 4. User stories
### US-01: Remove a link I no longer want
**As a** visitor
**I want** to delete a link by its code
**So that** a wrong or stale short URL stops resolving and stops cluttering my list.

### US-02: Shorten many URLs at once and see what happened to each
**As a** visitor
**I want** to submit a batch of URLs and get one result per URL, in the order I sent them
**So that** I can migrate a list in one request and still find out which entries were refused.

## 5. Acceptance criteria
### AC-01 (US-01) — happy path
**Given** a link exists under some code
**When** the visitor deletes that code
**Then** the request succeeds with no response body, the link no longer appears in the list, and following the code afterwards answers "not found".

### AC-02 (US-01) — error (unknown code)
**Given** a code that is not a link
**When** the visitor tries to delete it
**Then** the request is refused as not found, and nothing else changes.

### AC-03 (US-02) — happy path
**Given** between 1 and 100 valid URLs
**When** the visitor submits them as one batch
**Then** the request succeeds and returns one result per input URL, in the order they were sent — the result list is exactly as long as the input list.

### AC-04 (US-02) — error (over the limit)
**Given** more than 100 URLs
**When** the visitor submits them
**Then** the request is refused as too many, and **no link is created** — not the first one, not any.

### AC-05 (US-02) — error (empty batch)
**Given** an empty list of URLs
**When** the visitor submits it
**Then** the request is refused as having no URLs. An empty batch is a mistake by the caller, not a successful operation over nothing.

### AC-06 (US-02) — partial success
**Given** a batch in which one URL is invalid and the others are valid
**When** the visitor submits it
**Then** the batch itself succeeds; the invalid URL's result carries an error and no code, and every valid neighbour is created.

### AC-07 (US-02) — dedup (domain invariant)
**Given** the same URL appears twice in one batch, or already exists in the store
**When** the batch is submitted
**Then** the second occurrence returns the *same* code as the first with `created: false`, and the store holds exactly one row for that URL.
This is the de-duplication rule of `input-validation` ([spec §5](../input-validation/spec.md#5-acceptance-criteria), AC-07), applied per item. It is not a special case of bulk; bulk simply calls the same create.

### AC-08 (US-01) — domain invariant (hard delete)
**Given** a link that has been deleted
**When** the store is inspected
**Then** no row survives in any form — no `deleted_at`, no tombstone, no archive — and the freed code can be used again by a new link.

> **Authorization:** N/A — single-visitor toy, no accounts. Anyone can delete any link, and anyone can claim a freed code. See §6.1.

## 6. Non-functional requirements
| Aspect | Target | Measurement |
|---|---|---|
| Delete semantics | one statement, hard delete | `DELETE FROM links WHERE code = ?`; the driver reports `changes` as `0` or `1` |
| Delete migration | none | no column added; `docs/architecture-map.md` migration convention does not apply |
| Batch size | 1 … 100 URLs | refused above 100, **before the first write** |
| Batch body ceiling | `express.json()` default, 100 kB | 50 URLs of 2048 chars = 102 560 bytes → `413` before the route runs |
| Result ordering | positional, 1:1 | `results[i]` describes `urls[i]`; both lists have the same length |
| Per-item isolation | one refusal never blocks a neighbour | each create autocommits; the batch is **not** wrapped in a transaction |

Four facts drive this table, and each was measured against this codebase rather than assumed.

- **`DELETE /api/:code` swallows every single-segment path under `/api`.** Today `DELETE /api/links` already returns `501 {"error":"not implemented","feature":"bulk-and-delete"}` — the stub at `src/app.js:44` matched it as `code = "links"`. Any literal `DELETE` route must therefore be declared **above** the parameterised one.
- **`POST /api/shorten/bulk` is not swallowed by `POST /api/shorten`.** It answers `404` today because no route matches it: Express path parameters do not span `/`, and a literal path does not match a longer one. The widespread belief that the shorter route eats the longer one is false here (measured on express 4.22.2).
- **A `204` carries no body.** `res.status(204).json({ … })` sends no payload and no `content-type` header at all; the object is silently discarded. No acceptance criterion may describe a delete response body.
- **The body parser caps the batch before the route does.** `express.json()` defaults to a 100 kB limit. Fifty URLs at the 2048-character maximum already make a 102 560-byte body, and Express answers `413` — which this app's error middleware renders as `{ error: 'bad request' }`. The 100-item limit is therefore a *product* rule, reachable only with short URLs; the byte ceiling is a separate, lower one.

## 6.1 Security / privacy
- Data classification: public URLs and public handles.
- Personal data: none.
- AuthZ/AuthN impact: none exists to impact. Anyone who can reach the service can delete any link. This is the single largest consequence of the feature and it is accepted, because the service has no accounts to check against (`docs/CONTEXT.md`).
- Abuse cases:
  - **Deletion by anyone** — a `DELETE` with a guessed code destroys someone's link, irrecoverably. Accepted: single-visitor toy. In any multi-user version this endpoint is the first that needs an owner check.
  - **Existence oracle** — `DELETE` distinguishes `204` from `404`, so it reveals whether a code exists. `GET /:code` already reveals the same thing by answering `302` or `404`. No new exposure.
  - **Amplification** — one request that creates 100 rows. Bounded twice: by the 100-item rule and, earlier and lower, by the 100 kB body ceiling (§6).
  - **Code re-claim** — a deleted code is free. With `custom-alias` shipped, a second visitor can claim it, and a short URL shared long ago then resolves to their address. This is the price of not keeping a tombstone; it is named in [ADR 0001](adr/0001-hard-delete.md) and accepted.
  - **Batch as a validation oracle** — a batch of 100 URLs returns 100 verdicts in one round trip. The same verdicts are already available one at a time from `POST /api/shorten`. Cheaper, not new.
- Security review: N/A (single-visitor toy). The load-bearing decisions are "hard delete" and "check the limit before the first write".

## 7. Metrics / KPIs
- Links deleted per week: baseline 0 → observed (is delete used at all, or is the list just growing?).
- Share of batches that are partially successful: observed. A high share means callers are pasting unvalidated lists, which is exactly what the per-item result exists for.
- Batches refused as `too many urls` versus refused as `413`: observed. If the second dominates, the 100-item limit is decoration and §8 becomes urgent.
- Duplicate items collapsed inside a batch: observed (confirms AC-07 fires in the wild, not only in tests).

## 8. Open questions
- [ ] Whether to raise `express.json()`'s 100 kB limit so that 100 URLs at the 2048-character maximum fit into one batch. Measured: 49 such URLs make a 100 509-byte body and pass; 50 make 102 560 bytes and get `413 { error: 'bad request' }` before the route runs. **Not blocking.** `413` is a truthful answer, and the limit is shared by every route in `createApp`, so widening it is a change to the whole service and belongs to its own decision. Recorded so the next person does not discover it from a bug report.
