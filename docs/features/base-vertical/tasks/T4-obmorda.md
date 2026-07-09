---
id: T4
title: "Frontend: form + result + links table"
feature: base-vertical
project: url-shortener
layer: ui
deps: ["T3"]
acs: ["AC-01", "AC-05"]
files_hint: ["src/public/index.html", "src/public/app.js", "src/public/style.css"]
wave: 4
priority: Must
estimate: S
blocks: []
owner: "genkovich"
status: done
context_budget: "~2000 tokens"
created: 2026-07-08
spec_refs: ["§5 AC-01", "§5 AC-05"]
sad_refs: ["§5 Building block view"]
openapi_paths: []
adr_refs: []
---

# T4 · Frontend — form, result, links table

**Feature:** [base-vertical](./_epic.md)
**Priority:** Must
**Estimate:** S
**Wave:** 4 (ui + tests)

> **Shipped.** Worked example — the sections below describe `src/public/` as it exists.

## Position in the sequence

- **Blocked by:** T3 — the page is a client of the four routes.
- **Blocks:** — nothing. It shipped in parallel with T5.
- **Why this wave:** presentation only. It can be rewritten at any time without touching a rule.

## Why (user story)

As a **visitor**, I want a page where I paste a URL and see my short link and its click count, so that I never have to touch `curl`.

Spec US-01 (shorten), US-03 (see my links). AC-01 (a short handle comes back), AC-05 (the new link appears in the list with its current click count).

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#5-building-block-view) — `web` calls `api` over `fetch`, never the database
- 🗄  Data delta:   none
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — `POST /api/shorten`, `GET /api/links`
- 📜 Relevant ADR: none
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01, AC-05
- 🧬 Parity ref:   none — `src/public/style.css` defines the CSS custom properties every later UI task reuses

## Data delta

```
NO SCHEMA CHANGE. The frontend holds no state of its own: it re-reads GET /api/links
after every successful create rather than patching a local array.
```

## API contract

_API surface: none — the page is a client._ It consumes `POST /api/shorten` (expects `short_url`)
and `GET /api/links` (expects `code`, `url`, `clicks`, `created_at` per row).

## Acceptance criteria (GWT)

- [x] **AC-t4-1 (submit — AC-01):** Given a URL in `#url`, when the form is submitted, then `#short` shows the returned `short_url` and links to it.
- [x] **AC-t4-2 (list — AC-05):** Given a link was just created, when the page reloads the list, then the row shows its `code`, original URL, click count and creation time.
- [x] **AC-t4-3 (empty state):** Given no links exist, when the page loads, then `#empty` is visible and the table body is empty.
- [x] **AC-t4-4 (copy):** Given a short link is shown, when the visitor clicks *копіювати*, then `short_url` is written to the clipboard.
- [x] **AC-t4-5 (stubs are legible):** Given an endpoint answers `501 { error, feature }`, when the frontend renders it, then the message names the pending feature instead of showing a raw status code.
- [x] **AC-t4-6 (no framework):** `src/public/` contains no bundler, no import from a CDN, and no dependency. Plain modules only.

## Checklist (atomic steps for impl-agent)

- [x] Step 1 — `index.html`: a form (`#url`, submit), a result area (`#short`, `#copy`), an error paragraph (`#error`), a links table (`#rows`) and an empty-state line (`#empty`).
- [x] Step 2 — `style.css`: CSS custom properties for the palette (`--bg`, `--card`, `--text`, `--accent`, `--error`, …). Later features reuse these tokens and add none.
- [x] Step 3 — `app.js`: `loadLinks()` fetches `GET /api/links` and re-renders the table; it is called on load and after every successful create.
- [x] Step 4 — Submit handler: `POST /api/shorten`, show `short_url`, clear the input, reload the list.
- [x] Step 5 — Non-ok branch: render `body.error`, or, for `501`, name `body.feature`.

## Edge cases

| Case | Behaviour |
|---|---|
| Link created while the list is stale | `loadLinks()` re-fetches rather than appending to a local array. There is no client-side cache to invalidate, and therefore no cache bug. |
| Two links in the same millisecond | The table shows them in whatever order the server returned. `created_at DESC` ties are not broken (see T2 edge cases). |
| Original URL is very long | The cell carries `class="trunc"` and a `title` attribute, so it truncates visually but stays readable on hover. |
| Clipboard blocked | `navigator.clipboard.writeText` rejects on an insecure origin. Unhandled — the button silently does nothing. Known gap; irrelevant on `localhost`, which browsers treat as a secure context. |
| `url` rendered into `innerHTML` | The row template interpolates `l.url` straight into `innerHTML`. With no validation (T3 edge cases) a stored `javascript:`/markup payload would render. `input-validation` closes the door at the write side; a future task should also escape at the read side. **Recorded here because a worked example that hides its own hole is worse than no example.** |

## Definition of Done

- [x] Every checklist step done; AC-t4-1 … AC-t4-6 green.
- [x] `npm run lint` clean; the e2e smoke test (T5) drives this page end to end.
- [x] No framework, no bundler, no dependency in `src/public/`.
- [x] PR linked back to `tasks/T4-obmorda.md`.
- [x] `tracker.md` updated: status `done`.
