---
id: T4
title: "Frontend: inline validation error under the form"
feature: input-validation
project: url-shortener
layer: ui
deps: ["T3"]
acs: ["AC-02"]
files_hint: ["src/public/app.js", "src/public/index.html", "src/public/style.css", "tests/e2e/validation.spec.js"]
wave: 3
priority: Should
estimate: S
blocks: []
owner: "TBD"
status: todo
context_budget: "~2000 tokens"
created: 2026-07-09
spec_refs: ["§4 US-02", "§5 AC-02"]
sad_refs: ["§4 Solution strategy", "§5 Building block view"]
openapi_paths: []
adr_refs: []
---

# T4 · Inline validation error in the frontend

**Feature:** [input-validation](./_epic.md)
**Priority:** Should
**Estimate:** S
**Wave:** 3 (ui + tests)

## Position in the sequence

- **Blocked by:** T3 — there is no `400 { error }` to render until the route produces one.
- **Blocks:** — nothing. It ships in parallel with T5.
- **Why this wave:** presentation only. It consumes the contract T3 froze and adds no rule of its own.

## Why (user story)

As a **visitor**, I want to see *why* my URL was refused, right under the form, so that I can fix it instead of wondering whether the button works.

Spec US-02. AC-02 (empty input is refused with a clear message).

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#5-building-block-view) — `public` gains an error surface, nothing else
- 🗄  Data delta:   none
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — the `400` body is `{ error: string }`; render that string verbatim
- 📜 Relevant ADR: none
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-02
- 🧬 Parity ref:   `#error` already exists in `src/public/index.html` and is already written to in `src/public/app.js`

## Data delta

```
NO DB CHANGES IN THIS TASK.

⚠ Read the current src/public/app.js before writing anything. The seed ALREADY renders
`body.error` into #error on a non-ok response, and already hides #error at the start of each
submit. That behaviour is incidental, untested, and inaccessible — this task makes it
intentional, accessible and tested. It does not reinvent it.
```

## API contract

_API surface: none — the frontend is a client of `POST /api/shorten` (T3), not a server._

## Acceptance criteria (GWT)

- [ ] **AC-t4-1 (message shown — AC-02):** Given the form is submitted with an empty input, when the API answers `400 { error: 'url required' }`, then `#error` becomes visible and its text is exactly `url required`.
- [ ] **AC-t4-2 (message cleared):** Given `#error` is visible from a previous refusal, when the next submit succeeds, then `#error` is hidden again and the short link appears.
- [ ] **AC-t4-3 (input preserved):** Given a refusal, when `#error` is shown, then the value the visitor typed is still in `#url` — they can fix it rather than retype it. (On success, and only on success, the field is cleared.)
- [ ] **AC-t4-4 (announced):** `#error` carries `role="alert"`, so a screen reader speaks the refusal without the visitor hunting for it.
- [ ] **AC-t4-5 (no rule duplicated):** The frontend never decides *what* is invalid. `grep -E "http|2048|scheme" src/public/app.js` returns nothing — it renders whatever string the server sent.
- [ ] **AC-t4-6 (dedup is not an error):** Given a URL that is already stored, when the API answers `200`, then the short link is shown normally and `#error` stays hidden. `res.ok` is true for `200`, so this must not regress.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — RED: create `tests/e2e/validation.spec.js`. Submit the form with an empty field and assert `#error` is visible with text `url required`. It fails today because the seed API answers `201`, so the test proves T3 is wired before it proves the UI is.
- [ ] Step 2 — In `src/public/index.html`, add `role="alert"` to `<p id="error">`. Nothing else about the markup changes.
- [ ] Step 3 — In `src/public/app.js`, confirm the existing `if (!res.ok)` branch writes `body.error` to `#error`. Do **not** rewrite it; extend it only if AC-t4-3 fails (the input must not be cleared on the error path).
- [ ] Step 4 — In `src/public/style.css`, ensure `.error` is legible against the card background — the `--error` custom property already exists; reuse it, do not add a new colour.
- [ ] Step 5 — Add the AC-t4-2 and AC-t4-6 cases to the e2e spec. Run `npm run test:e2e`.

## Edge cases

| Case | Behaviour |
|---|---|
| `200` dedup response | Treated as success. `res.ok` covers `200`–`299`, so the existing `if (!res.ok)` guard is already correct. Do not change it to `res.status !== 201`. |
| `501` from a stubbed endpoint | Keeps its own branch: the body is `{ error, feature }`, and the message names the pending feature. Untouched by this task. |
| Network failure / `fetch` rejects | Out of scope. The seed has no `catch` around `fetch`, and adding one is a separate concern from validation. Do not smuggle it in here. |
| A very long `error` string | Cannot happen — the four `reason` values are short phrases fixed in T1. No truncation logic needed. |

## Definition of Done

- [ ] Every checklist step done; AC-t4-1 … AC-t4-6 green.
- [ ] `npm run test:e2e` green; `npm run lint` clean.
- [ ] No framework, no new dependency, no new CSS custom property.
- [ ] The frontend contains no copy of the validation rules — it renders the server's string.
- [ ] PR linked back to `tasks/T4-ui-error.md`.
- [ ] `tracker.md` updated: status `done`.
