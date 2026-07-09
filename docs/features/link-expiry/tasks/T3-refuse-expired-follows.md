---
id: T3
title: "App: refuse expired follows as gone; accept a lifetime on create"
feature: link-expiry
project: url-shortener
layer: app
deps: ["T2"]
acs: ["AC-02", "AC-03"]
files_hint: ["src/app.js"]
wave: 3
priority: Must
estimate: S
blocks: [T4, T5]
owner: "TBD"
status: todo
context_budget: "~2500 tokens"
created: 2026-07-09
spec_refs: ["§5 AC-02", "§5 AC-03"]
sad_refs: ["§4 Solution strategy", "§6 Runtime view", "§8 Crosscutting concepts"]
openapi_paths: ["POST /api/shorten", "GET /{code}"]
adr_refs: ["ADR-0001"]
---

# T3 · `410` on an expired follow; `ttl_days` on create

**Feature:** [link-expiry](./_epic.md)
**Priority:** Must
**Estimate:** S
**Wave:** 3 (app)

## Position in the sequence

- **Blocked by:** T2 — the route reads `expired` from `resolveLink` and never recomputes it.
- **Blocks:** T4 (the badge renders the state this route exposes), T5 (the integration suite drives it).
- **Why this wave:** the only HTTP change. Two routes, one new status code, zero rules.

## Why (user story)

As a **visitor**, I want an expired link to refuse to redirect, so that a stale link cannot silently send someone somewhere.

Spec US-01, US-02. AC-02 (a link within its lifetime still redirects), AC-03 (an expired link is reported as gone).

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#6-runtime-view) — the `expires_at in the past` fork on the follow path
- 🗄  Data delta:   none — `src/app.js` contains no SQL
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — `GET /{code}`: `302` / `404` / `410`; `POST /api/shorten` gains `ttl_days`
- 📜 Relevant ADR: [ADR-0001](../adr/0001-expiry-check-on-read.md) — refuse on read; the row stays for stats and for the list badge
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-02, AC-03
- 🧬 Parity ref:   the existing `GET /:code` handler in `src/app.js` — it already maps `null` to `404`; add exactly one branch

## Data delta

```
NO SCHEMA CHANGE, and no SQL in this layer.
```

## API contract

```
POST /api/shorten     { url, ttl_days? }
    ttl_days: positive integer, or omitted/null -> the resolved default (T2)
  -> 201 { code, short_url }
  -> 400 { error: 'invalid ttl' }     ttl_days present but not a positive integer

GET /:code
  -> 302 Location: <original url>    still within its lifetime; click counted   (AC-02)
  -> 410 { error: 'gone' }           expired; click NOT counted                 (AC-03)
  -> 404 { error: 'not found' }      unknown code

GET /api/links   -> each row now also carries expires_at (and, for T4, an expired flag)
```

`410 Gone` rather than `404`: the link existed and its address is known — it is the *lifetime*
that ended. `docs/architecture-map.md` → Status codes already reserves `410` for exactly this.

## Acceptance criteria (GWT)

- [ ] **AC-t3-1 (valid follow — AC-02):** Given a link within its lifetime, when `GET /:code`, then `302` with `Location` set to the original URL, and `GET /api/stats/:code` reports one more click.
- [ ] **AC-t3-2 (expired follow — AC-03):** Given an expired link, when `GET /:code`, then `410 { error: 'gone' }` and **no** `Location` header.
- [ ] **AC-t3-3 (no click on `410` — AC-03):** Given an expired link with `clicks === 3`, when `GET /:code` is called twice, then `GET /api/stats/:code` still reports `3`.
- [ ] **AC-t3-4 (unknown code):** Given an unknown code, when `GET /:code`, then `404 { error: 'not found' }` — unchanged, and distinct from `410`.
- [ ] **AC-t3-5 (lifetime honoured — AC-01):** Given `POST /api/shorten { url, ttl_days: 1 }`, when the link is read back through `GET /api/links`, then its `expires_at` is one day after its `created_at`.
- [ ] **AC-t3-6 (lifetime omitted):** Given `POST /api/shorten { url }`, when the link is created, then the default lifetime applies and `expires_at` is not `null`.
- [ ] **AC-t3-7 (bad lifetime):** Given `ttl_days: 0`, `-1`, `"7"` or `1.5`, when `POST /api/shorten`, then `400 { error: 'invalid ttl' }` and nothing is stored.
- [ ] **AC-t3-8 (route stays thin):** `src/app.js` contains no `expires_at` arithmetic, no `DAY_MS` and no comparison against `Date.now()`. It reads `link.expired` and branches.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — RED: in `tests/integration/expiry.test.js`, insert an already-expired link and assert `GET /:code` → `410`. Today it redirects, so the test fails on the status.
- [ ] Step 2 — In `src/app.js`, the follow handler becomes: `const link = resolveLink(db, req.params.code);` → `if (!link) return 404` → `if (link.expired) return res.status(410).json({ error: 'gone' })` → `res.redirect(302, link.url)`.
- [ ] Step 3 — Add the AC-t3-3 test **before** trusting Step 2: an expired follow must not increment. The guarantee lives in T2's `resolveLink`, but this is the layer where a future refactor would break it.
- [ ] Step 4 — In the create handler, read `ttl_days` from the body and validate it: present ⇒ `Number.isInteger(v) && v > 0`, otherwise `400 { error: 'invalid ttl' }`. Pass it on as `{ ttlDays }`.
- [ ] Step 5 — Grow the suite through AC-t3-4 → AC-t3-5 → AC-t3-6 → AC-t3-7 → AC-t3-1, each red before green.
- [ ] Step 6 — Run `npm run test:fast`. `tests/integration/shorten.test.js` must pass **unmodified**: its links are created without `ttl_days`, so they take the default and stay valid.

## Edge cases

| Case | Behaviour |
|---|---|
| `410` vs `404` | Different statements. `404` — this code was never issued. `410` — it was, and it is over. Collapsing them loses the only information the visitor can act on. |
| A click counted on `410` | The bug this task exists to prevent. The counter lives behind the expiry check in `resolveLink` (T2), and AC-t3-3 pins it at the HTTP layer too, because that is where someone will later "optimize" the read. |
| `ttl_days: 0` | Rejected at the route as `invalid ttl`, even though the domain would happily build an immediately-expired link (T2 edge cases). Creating a dead link through the public API is never what the caller meant. |
| `ttl_days: "7"` (a string) | Rejected. `Number.isInteger("7")` is `false`, and coercing it here would make the contract depend on how the client happened to serialize its JSON. |
| `ttl_days: 1.5` | Rejected. Fractional days have no meaning in a lifetime the visitor picked in days. |
| Legacy link (`expires_at IS NULL`) | `expired` is `false` (T2), so it redirects as it always did. AC-t3-1 covers it once the fixture from `data-model.md` is used. |
| Route order | `GET /:code` stays **last**, after every `/api/*` route. This task edits the handler body, never its position. |

## Definition of Done

- [ ] Every checklist step done; AC-t3-1 … AC-t3-8 green.
- [ ] `npm run test:fast` green; `npm run lint` clean.
- [ ] `tests/integration/shorten.test.js` and `tests/unit/shorten.test.js` pass **unmodified**.
- [ ] `grep -E "DAY_MS|expires_at|Date.now" src/app.js` returns nothing.
- [ ] An expired follow returns `410` and leaves `clicks` untouched — asserted at both the domain and the HTTP layer.
- [ ] PR linked back to `tasks/T3-refuse-expired-follows.md`.
- [ ] `tracker.md` updated: status `done`.
