---
id: T4
title: "Frontend: optional alias input beside the URL field"
feature: custom-alias
project: url-shortener
layer: ui
deps: ["T3"]
acs: ["AC-01", "AC-02", "AC-03", "AC-05"]
files_hint: ["src/public/app.js", "src/public/index.html", "src/public/style.css", "tests/e2e/alias.spec.js"]
wave: 3
priority: Should
estimate: S
blocks: []
owner: "TBD"
status: todo
context_budget: "~2000 tokens"
created: 2026-07-09
spec_refs: ["§4 US-01", "§5 AC-01", "§5 AC-02", "§5 AC-03", "§5 AC-05"]
sad_refs: ["§5 Building block view"]
openapi_paths: []
adr_refs: []
---

# T4 · Optional alias input in the form

**Feature:** [custom-alias](./_epic.md)
**Priority:** Should
**Estimate:** S
**Wave:** 3 (ui + tests)

## Position in the sequence

- **Blocked by:** T3 — there is no `alias` field on the request and no `409` to render before it.
- **Blocks:** — nothing. It ships in parallel with T5.
- **Why this wave:** presentation only. One input, one branch, no rule.

## Why (user story)

As a **visitor**, I want to type my chosen short code next to the URL, so that I get a readable link without reaching for `curl`.

Spec US-01, US-02. AC-01 (the alias becomes the code), AC-02 (an empty field still gives a random code), AC-03 (a malformed alias is refused with a message I can act on), AC-05 (a taken alias is reported as a conflict).

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#5-building-block-view) — `web` gains one input; every rule stays server-side
- 🗄  Data delta:   none
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — send `alias` only when non-empty; render `error` verbatim
- 📜 Relevant ADR: none
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01, AC-02, AC-03, AC-05
- 🧬 Parity ref:   the `#error` paragraph and the `if (!res.ok)` branch in `src/public/app.js` — reuse both; `input-validation` T4 already made them accessible

## Data delta

```
NO SCHEMA CHANGE.

Request body assembly:
  const alias = $('alias').value.trim();
  const body  = alias ? { url, alias } : { url };     -- omit the key entirely when empty

⚠ Do NOT validate the alias in the browser. No pattern, no reserved list, no length check.
The server owns those rules (T1); a second copy here would drift the first time either changes,
and the visitor would be refused by a rule that no longer exists.
```

## API contract

_API surface: none — the frontend is a client of `POST /api/shorten`._

## Acceptance criteria (GWT)

- [ ] **AC-t4-1 (alias submitted — AC-01):** Given `launch-2026` typed into the alias field, when the form is submitted, then the short URL shown ends with `/launch-2026`.
- [ ] **AC-t4-2 (alias omitted — AC-02):** Given the alias field is left empty, when the form is submitted, then the request body carries **no** `alias` key and a random code comes back.
- [ ] **AC-t4-3 (error rendered — AC-03):** Given `has space` is typed as the alias, when the form is submitted, then `#error` shows `invalid alias` and no short URL appears.
- [ ] **AC-t4-4 (conflict rendered — AC-05):** Given an alias that is already taken, when the form is submitted, then `#error` shows `alias taken`. The frontend renders the string; it does not know what `409` means.
- [ ] **AC-t4-5 (fields preserved):** After a refusal, both `#url` and `#alias` still hold what the visitor typed. Only a success clears them.
- [ ] **AC-t4-6 (no rule in the UI):** `grep -E "A-Za-z0-9_-|healthz|metrics|\{3,32\}" src/public/app.js` returns nothing.
- [ ] **AC-t4-7 (optional means optional):** The input carries no `required` attribute and no client-side `pattern` attribute. An empty alias is the normal case.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — RED: create `tests/e2e/alias.spec.js`. Fill the URL and the alias `launch-2026`, submit, assert `#short` ends with `/launch-2026`. It fails because the input does not exist.
- [ ] Step 2 — In `src/public/index.html`, add `<input id="alias" type="text" placeholder="свій код (необовʼязково)" autocomplete="off" />` inside the form, after `#url`. No `required`, no `pattern`.
- [ ] Step 3 — In `src/public/style.css`, let the two inputs share the row. Reuse the existing custom properties; add no new colour and no new font.
- [ ] Step 4 — In `src/public/app.js`, build the body per **Data delta**: read and trim `#alias`, include the key only when the result is non-empty.
- [ ] Step 5 — On success, clear `#alias` alongside `#url`. On failure, clear neither (AC-t4-5).
- [ ] Step 6 — Add AC-t4-3 and AC-t4-4 to the e2e spec, then run `npm run test:e2e`.

## Edge cases

| Case | Behaviour |
|---|---|
| Alias field left empty | The key is **omitted**, not sent as `""`. An empty string would reach the claim branch (T2) and be refused as `invalid alias` — a refusal for a field the visitor never filled in. This one line is the whole task's risk. |
| Alias field holds only spaces | `.trim()` makes it empty, so the key is omitted. The visitor typed nothing meaningful. |
| Visitor types an invalid alias | The server answers `400 invalid alias`, and the frontend shows that string. It does not pre-empt the server with its own pattern — see AC-t4-6. |
| `409 alias taken` | `res.ok` is `false`, so it lands in the same branch as `400`, and `body.error` is rendered. No new code path. |
| Browser autofill on `#alias` | `autocomplete="off"`, matching `#url`. An autofilled alias would silently claim a name the visitor never chose. |

## Definition of Done

- [ ] Every checklist step done; AC-t4-1 … AC-t4-7 green.
- [ ] `npm run test:e2e` green; `npm run lint` clean.
- [ ] An empty alias field sends a body with no `alias` key — asserted in the e2e spec, not assumed.
- [ ] No alias rule exists in `src/public/`; no framework, no new dependency, no new CSS custom property.
- [ ] PR linked back to `tasks/T4-ui-alias-field.md`.
- [ ] `tracker.md` updated: status `done`.
