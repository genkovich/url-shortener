---
id: T4
title: "Frontend: expired/active badge in links table"
feature: link-expiry
project: url-shortener
layer: ui
deps: ["T3"]
acs: ["AC-05"]
files_hint: ["src/public/app.js", "src/public/index.html", "src/public/style.css", "tests/e2e/expiry.spec.js"]
wave: 4
priority: Should
estimate: S
blocks: []
owner: "TBD"
status: todo
context_budget: "~2000 tokens"
created: 2026-07-09
spec_refs: ["§4 US-03", "§5 AC-05"]
sad_refs: ["§5 Building block view"]
openapi_paths: []
adr_refs: []
---

# T4 · Expired / active badge in the links table

**Feature:** [link-expiry](./_epic.md)
**Priority:** Should
**Estimate:** S
**Wave:** 4 (ui + tests)

## Position in the sequence

- **Blocked by:** T3 — `GET /api/links` must already return `expired` per row.
- **Blocks:** — nothing. It ships in parallel with T5.
- **Why this wave:** presentation only. The state is computed once, in the domain, and the badge is a projection of it.

## Why (user story)

As a **visitor**, I want the list to show which of my links are expired, so that I know which ones no longer work without clicking each of them.

Spec US-03. AC-05 (each link's expired/active state is consistent with what following it would do).

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#5-building-block-view) — `web` gains a badge; the rule stays in the domain
- 🗄  Data delta:   none
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — each row of `GET /api/links` carries `expires_at`; `expired` is added by `listLinks` (T2)
- 📜 Relevant ADR: [ADR-0001](../adr/0001-expiry-check-on-read.md) — expired rows are kept, so the list must compute state instead of assuming presence means valid
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-05
- 🧬 Parity ref:   `loadLinks()` in `src/public/app.js` — the row template; `--error` and `--muted` already exist in `style.css`

## Data delta

```
NO SCHEMA CHANGE. The frontend adds one <td> per row and reads `l.expired` verbatim.

⚠ The frontend must NOT compute `Date.now() >= l.expires_at`. That comparison is the domain's
(T2 `isExpired`). Duplicating it here means two implementations of one rule, in two languages,
that will disagree the first time the boundary or the null-handling changes.
```

## API contract

_API surface: none — the frontend is a client of `GET /api/links`._

## Acceptance criteria (GWT)

- [ ] **AC-t4-1 (badge shown — AC-05):** Given the list contains one valid and one expired link, when the table renders, then the valid row shows an *active* badge and the expired row shows an *expired* badge.
- [ ] **AC-t4-2 (consistency — AC-05):** Given a row marked expired, when its code is followed, then the server answers `410`. The badge and the follow behaviour never disagree, because both derive from the same `expired` field.
- [ ] **AC-t4-3 (no rule in the UI):** `grep -E "expires_at|Date.now" src/public/app.js` returns nothing. The row template reads `l.expired` and nothing else.
- [ ] **AC-t4-4 (legacy row):** Given a link with `expires_at === null`, when the table renders, then it shows *active* — matching `isExpired` (T2), which treats a missing lifetime as non-expiring.
- [ ] **AC-t4-5 (no new colour):** The badge reuses the existing custom properties (`--error` for expired, `--muted` or `--accent` for active). No new hex value enters `style.css`.
- [ ] **AC-t4-6 (accessible):** The badge conveys state through text, not colour alone — the cell reads `expired` / `active`, so it survives a greyscale screenshot and a screen reader.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — RED: create `tests/e2e/expiry.spec.js`. Seed one valid and one expired link, load the page, assert the expired row shows the `expired` badge. It fails because the column does not exist.
- [ ] Step 2 — In `src/public/index.html`, add a `<th>Стан</th>` to the table header.
- [ ] Step 3 — In `src/public/app.js`, add the matching `<td>` to the row template: `<td><span class="badge ${l.expired ? 'badge-expired' : 'badge-active'}">${l.expired ? 'expired' : 'active'}</span></td>`.
- [ ] Step 4 — In `src/public/style.css`, style `.badge`, `.badge-expired` (uses `--error`) and `.badge-active` (uses `--muted`). Add no new custom property.
- [ ] Step 5 — Add AC-t4-2 to the e2e spec: click the expired code, assert the page shows the `410` body rather than the target site.
- [ ] Step 6 — Run `npm run test:e2e`.

## Edge cases

| Case | Behaviour |
|---|---|
| `expires_at === null` (legacy) | *active*. The UI reads `l.expired`, which T2 already resolved to `false`. It never sees the `null` and never has to decide what it means. |
| A link expiring while the page is open | The badge goes stale until the next `loadLinks()`. Accepted: the list is a snapshot, and the follow path is authoritative. Do not add a timer — a polling frontend is a different feature. |
| Clock skew between server and browser | Irrelevant, and that is the point of AC-t4-3. The server computed `expired`; the browser has no clock in this path. |
| A very long list | Unchanged. The table is not paginated, and this task does not make it worse. |

## Definition of Done

- [ ] Every checklist step done; AC-t4-1 … AC-t4-6 green.
- [ ] `npm run test:e2e` green; `npm run lint` clean.
- [ ] No expiry arithmetic in `src/public/`, no framework, no new dependency, no new CSS custom property.
- [ ] PR linked back to `tasks/T4-expired-badge.md`.
- [ ] `tracker.md` updated: status `done`.
