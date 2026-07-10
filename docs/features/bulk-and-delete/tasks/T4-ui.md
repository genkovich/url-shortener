---
id: T4
title: "Frontend: delete button per row + bulk paste field"
feature: bulk-and-delete
project: url-shortener
layer: ui
deps: ["T3"]
acs: ["AC-01", "AC-03", "AC-06"]
files_hint: ["src/public/app.js", "src/public/index.html", "src/public/style.css"]
wave: 3
priority: Should
estimate: M
blocks: []
owner: "TBD"
status: todo
context_budget: "~2500 tokens"
created: 2026-07-10
spec_refs: ["§4 US-01", "§4 US-02", "§5 AC-01", "§5 AC-03", "§5 AC-06", "§6.1 Security / privacy"]
sad_refs: ["§5 Building block view", "§11 Risks and technical debt"]
openapi_paths: []
adr_refs: ["ADR-0001"]
---

# T4 · A delete button and a paste field

**Feature:** [bulk-and-delete](./_epic.md)
**Priority:** Should
**Estimate:** M
**Wave:** 3 (ui + tests)

## Position in the sequence

- **Blocked by:** T3 — there is no `204` to handle and no batch endpoint to call before it.
- **Blocks:** — nothing. It ships in parallel with T5.
- **Why this wave:** presentation only. Two controls, no rule. But this is also the only place in the whole feature where a visitor is warned before destroying something, so the confirmation is not decoration.

## Why (user story)

As a **visitor**, I want to remove a link from the table I am already looking at, and to paste a list of URLs instead of submitting the form fifty times.

Spec US-01, US-02. AC-01 (the row disappears and the link stops resolving), AC-03 (a batch returns one outcome per line), AC-06 (a bad line is reported next to the good ones that were created).

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#5-building-block-view) — `web` gains a button and a textarea; every rule stays server-side
- 🗄  Data delta:   none
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — `DELETE /api/{code}` answers `204` with **no body**; `POST /api/shorten/bulk` answers `200` with an array
- 📜 Relevant ADR: [ADR-0001](../adr/0001-hard-delete.md) — deletion is irreversible, which is why the browser asks first; the dialog is the only safety net there is
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01, AC-03, AC-06
- 🧬 Parity ref:   the `#error` paragraph and the `if (!res.ok)` branch in `src/public/app.js` — reuse both; `input-validation` T4 already made them accessible

## Data delta

```
NO SCHEMA CHANGE.

Delete request:
  const res = await fetch(`/api/${code}`, { method: 'DELETE' });
  if (res.status === 204) { loadLinks(); return; }     -- do NOT call res.json() here
  // 404 and anything else fall into the existing !res.ok branch, which may read the body

⚠ res.ok is TRUE for 204. Branch on the status, not on res.ok, or the delete handler falls
into the success path of a function that then tries to parse a body that does not exist.

Bulk request:
  const urls = $('bulk').value.split('\n').map(s => s.trim()).filter(Boolean);
  const res  = await fetch('/api/shorten/bulk', {
    method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ urls })
  });

⚠ Do NOT validate in the browser. No URL pattern, no 100-item check, no empty-array check.
The server owns all three (T2); a second copy here would drift the first time either changes,
and the visitor would be refused by a rule that no longer exists.
```

## API contract

_API surface: none — the frontend is a client of `DELETE /api/:code` and `POST /api/shorten/bulk`._

## Acceptance criteria (GWT)

- [ ] **AC-t4-1 (row delete — AC-01):** Given a link in the table, when its delete button is pressed and the confirmation accepted, then the row disappears and the table reloads from the server, not from memory.
- [ ] **AC-t4-2 (confirmation is real):** Given the confirmation is dismissed, when the button was pressed, then **no request is sent** and the row stays. Asserted by intercepting the request in the e2e spec, not by looking at the table.
- [ ] **AC-t4-3 (`204` is not parsed):** The delete handler never calls `res.json()` on a `204`. Measured: `await res.json()` on an empty body rejects with `SyntaxError: Unexpected end of JSON input`, and `res.ok` is `true`, so the failure would surface inside the *success* path.
- [ ] **AC-t4-4 (last row):** Given the last remaining link is deleted, then the `#empty` message reappears. `loadLinks()` already toggles it; the handler must call `loadLinks()` rather than removing the `<tr>` by hand.
- [ ] **AC-t4-5 (bulk submit — AC-03):** Given three URLs, one per line, when the batch is submitted, then three outcome lines are rendered in the same order and the links table reloads.
- [ ] **AC-t4-6 (blank lines):** Given a paste with trailing newlines and a blank line in the middle, then those lines are dropped before the request. An empty string would come back as `url required` for a line the visitor never typed.
- [ ] **AC-t4-7 (partial success rendered — AC-06):** Given a batch where line 2 is `not a url`, then line 2 renders its `error` string, lines 1 and 3 render their codes, and the table shows the two created links. The frontend renders `error` verbatim; it does not translate it.
- [ ] **AC-t4-8 (duplicate rendered — AC-07):** An entry with `created: false` is visibly distinguished from `created: true` — the visitor asked for a new link and got an existing one, and silence about that is a lie of omission.
- [ ] **AC-t4-9 (batch refused as a whole):** Given 101 lines, then the server answers `400 { error: 'too many urls' }` and that string appears in `#error`. The browser did not count the lines.
- [ ] **AC-t4-10 (no rule in the UI):** `grep -nE "100|new URL\(|javascript:|http[s]?:" src/public/app.js` shows no validation rule and no limit.
- [ ] **AC-t4-11 (the table is not built by string concatenation):** The delete button is created with `document.createElement` and its code is set through `dataset`, not interpolated into the existing `innerHTML` template.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — RED: create `tests/e2e/bulk-and-delete.spec.js`. Create a link, press its delete button, accept the dialog, assert the row is gone. It fails because there is no button.
- [ ] Step 2 — In `src/public/index.html`, add a fifth `<th></th>` to the links table header, and a second form holding `<textarea id="bulk" placeholder="по одному URL на рядок…"></textarea>` with its own submit button and an outcome list `<ul id="bulk-results"></ul>`.
- [ ] Step 3 — In `src/public/app.js`, inside `loadLinks()`, keep the four existing cells as they are and append a fifth `<td>` built with `document.createElement('button')`, `btn.dataset.code = l.code`. Do **not** grow the `tr.innerHTML` template: `l.url` is already interpolated into it, which `docs/architecture-map.md` records as live tech debt. Fixing that is not this task; **making it worse is forbidden.**
- [ ] Step 4 — One delegated `click` listener on `#rows`. Read `e.target.dataset.code`, call `confirm()`, return early if it is dismissed. Deletion is irreversible (ADR-0001) and there is no owner check on the server (spec §6.1); this dialog is the entire safety net.
- [ ] Step 5 — Send the `DELETE`. Branch on `res.status === 204` **before** any `res.ok` check, call `loadLinks()`, and never touch `res.json()` on that path.
- [ ] Step 6 — Wire the bulk form per **Data delta**: split, trim, drop empties, `POST`. On `!res.ok`, render `body.error` in the existing `#error` paragraph — the same branch `input-validation` T4 built.
- [ ] Step 7 — On `200`, render one `<li>` per result entry, in the array's order: a code for `created: true`, a code plus "already existed" for `created: false`, and the `error` string for a refused entry. Then `loadLinks()`.
- [ ] Step 8 — In `src/public/style.css`, style the button and the textarea with the existing custom properties. Add no new colour, no new font, no framework.
- [ ] Step 9 — Add AC-t4-2, AC-t4-7 and AC-t4-9 to the e2e spec. Playwright needs `page.on('dialog', …)` for the confirmation — register the handler before the click, or the click hangs.
- [ ] Step 10 — Run `npm run test:e2e`.

## Edge cases

| Case | Behaviour |
|---|---|
| `await res.json()` on the `204` | Rejects: `SyntaxError: Unexpected end of JSON input` (measured against a real `204`). And `res.ok` is `true` for `204`, so this happens on the success path, where nobody has a `catch`. The row would vanish from the DOM only after a reload, and the console would carry an error nobody reads. Branch on `res.status === 204`. |
| Confirmation dismissed | No request. The check must sit **before** `fetch`, not after — a `DELETE` sent and then regretted is a deleted link. |
| Deleting the last row | `loadLinks()` re-renders and un-hides `#empty`. A handler that removes the `<tr>` itself leaves "Ще порожньо" hidden behind an empty table. |
| Two rapid clicks on the same button | The first deletes, the second answers `404`, and the `!res.ok` branch prints `not found` into `#error` for a link the visitor just successfully removed. Disable the button on click, or re-render before the second click can land. Either is fine; leaving it is not. |
| Trailing newline in the textarea | `.filter(Boolean)` after `.trim()` drops it. Without that filter the last line arrives as `''` and comes back as `url required` — an error for a line the visitor never typed, and the single most likely complaint about this control. |
| 101 lines pasted | The browser sends all 101 and shows the server's `too many urls`. It does **not** count them itself: that is the same rule in two places, and the copy in the browser is the one that will be forgotten when the limit changes. |
| A paste of very long URLs | The server may answer `413`, whose body this app renders as `{ error: 'bad request' }` (measured). It lands in the same `!res.ok` branch and reads as a generic failure. Accepted, and it is why the ceiling is recorded in spec §8 rather than hidden. |
| Growing the `innerHTML` row template | Forbidden. `l.url` is interpolated into it today, and `docs/architecture-map.md` names that as an open XSS hole on the read side. Adding a `${l.code}` button to the same template widens the surface for no reason; `createElement` plus `dataset` costs three lines. |
| The delete button on a row whose code contains a `-` or `_` | Fine. `dataset.code` carries the string as-is, and `fetch('/api/' + code)` needs no encoding for the alias charset (`custom-alias` spec §6). A code is base62, `-` or `_`, and nothing else — so no `encodeURIComponent` gymnastics, and no place for one to be forgotten. |

## Definition of Done

- [ ] Every checklist step done; AC-t4-1 … AC-t4-11 green.
- [ ] `npm run test:e2e` green; `npm run lint` clean.
- [ ] `grep -n "res.json()" src/public/app.js` shows no call on a delete response.
- [ ] The confirmation runs before `fetch`, proven by an e2e assertion that no request is made when it is dismissed.
- [ ] No URL rule and no batch limit exists in `src/public/`; no new dependency, no new CSS custom property.
- [ ] The links row template is not longer than it was — the button is a DOM node, not a string.
- [ ] PR linked back to `tasks/T4-ui.md`.
- [ ] `tracker.md` updated: status `done`.
