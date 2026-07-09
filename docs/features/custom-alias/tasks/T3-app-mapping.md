---
id: T3
title: "App: map alias outcomes to 201 / 400 / 409"
feature: custom-alias
project: url-shortener
layer: app
deps: ["T2"]
acs: ["AC-01", "AC-02", "AC-03", "AC-04", "AC-05", "AC-06"]
files_hint: ["src/app.js"]
wave: 2
priority: Must
estimate: S
blocks: [T4, T5]
owner: "TBD"
status: todo
context_budget: "~2500 tokens"
created: 2026-07-09
spec_refs: ["§5 AC-01", "§5 AC-05", "§5 AC-06"]
sad_refs: ["§4 Solution strategy", "§6 Runtime view"]
openapi_paths: ["POST /api/shorten"]
adr_refs: ["ADR-0001"]
---

# T3 · Map the alias outcomes to status codes

**Feature:** [custom-alias](./_epic.md)
**Priority:** Must
**Estimate:** S
**Wave:** 2 (app)

## Position in the sequence

- **Blocked by:** T2 — the route translates `AliasError.reason`; there is nothing to translate before it.
- **Blocks:** T4 (the frontend renders these errors), T5 (the integration suite drives them).
- **Why this wave:** the only HTTP change. One new request field, one new status code, zero rules.

## Why (user story)

As a **visitor**, I want distinct answers for "your alias is malformed", "that name is reserved" and "that alias is taken", so that I know whether to fix my input or choose another name.

Spec US-02, US-03. AC-01 … AC-06 all become observable over HTTP here.

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#6-runtime-view)
- 🗄  Data delta:   none — `src/app.js` contains no SQL
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — `POST /api/shorten`: `201`, `400`, `409`
- 📜 Relevant ADR: [ADR-0001](../adr/0001-alias-as-code.md) — because the alias is the code, `GET /:code` needs no change at all
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01 … AC-06
- 🧬 Parity ref:   the `ValidationError` `catch` added by `input-validation` T3 — extend that `catch`, do not add a second `try` block

## Data delta

```
NO DB CHANGES IN THIS TASK — src/app.js contains no SQL and must not gain any.
```

## API contract

```
POST /api/shorten     { url, alias? }

  Response:
    201 { code, short_url }      created; code === alias when one was supplied   (AC-01, AC-02)
    400 { error: 'invalid alias'  }   malformed alias                            (AC-03)
    400 { error: 'reserved alias' }   would shadow a service path                (AC-04)
    409 { error: 'alias taken'    }   already the code of a link; nothing written (AC-05)

Unchanged: GET /:code · GET /api/links · GET /api/stats/:code — an aliased link is just a link.
```

`AliasError.reason` → status: `'alias taken'` is the only `409`; the other two are `400`.
Map on `reason`, never on the message text.

## Acceptance criteria (GWT)

- [ ] **AC-t3-1 (alias accepted — AC-01):** Given `{ url, alias: 'launch-2026' }`, when `POST /api/shorten`, then `201` with `code === 'launch-2026'` and `short_url` ending in `/launch-2026`.
- [ ] **AC-t3-2 (no alias — AC-02):** Given `{ url }`, when `POST /api/shorten`, then `201` with a 7-character code. Behaviour is byte-for-byte what it was before this feature.
- [ ] **AC-t3-3 (malformed — AC-03):** Given `{ url, alias: 'has space' }`, then `400 { error: 'invalid alias' }` and `GET /api/links` is unchanged.
- [ ] **AC-t3-4 (reserved — AC-04):** Given `{ url, alias: 'healthz' }` **or** `{ url, alias: 'HEALTHZ' }`, then `400 { error: 'reserved alias' }`, nothing stored.
- [ ] **AC-t3-5 (taken — AC-05):** Given `launch-2026` exists, when it is claimed again, then `409 { error: 'alias taken' }` and the original link still resolves to its original URL.
- [ ] **AC-t3-6 (aliased link is a link — AC-06):** Given an aliased link, when `GET /launch-2026`, then `302` to the original URL and one more click; it appears in `GET /api/links` and `GET /api/stats/launch-2026` answers `200`.
- [ ] **AC-t3-7 (`alias: null`):** Given `{ url, alias: null }`, then `201` with a generated code — `null` means omitted, per the openapi contract.
- [ ] **AC-t3-8 (no regression):** A malformed JSON body still yields `400 { error: 'bad request' }` and an unknown code still yields `404`. The existing integration suite passes unmodified.
- [ ] **AC-t3-9 (route stays thin):** `src/app.js` contains no alias pattern, no reserved list, and no `SELECT`. `grep -E "A-Za-z0-9_-|healthz|RESERVED" src/app.js` returns nothing.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — RED: in `tests/integration/alias.test.js`, assert AC-t3-1. Today the `alias` field is ignored and a random code comes back, so the test fails on the `code`.
- [ ] Step 2 — In `src/app.js`, import `AliasError` beside `createLink`.
- [ ] Step 3 — Read `const { url, alias } = req.body ?? {}` and pass it through: `createLink(db, url, { alias })`. Do not pre-filter or trim the alias — T1 owns every decision about its shape.
- [ ] Step 4 — Extend the existing `catch` with one branch: `if (err instanceof AliasError) return res.status(err.reason === 'alias taken' ? 409 : 400).json({ error: err.reason });`. Keep the final `throw err;` — an unknown error must never become a `4xx`.
- [ ] Step 5 — Grow the suite through AC-t3-4 → AC-t3-3 → AC-t3-5 → AC-t3-6 → AC-t3-7 → AC-t3-2, each red before green.
- [ ] Step 6 — Verify AC-t3-6 by hand once: `curl -i localhost:3000/launch-2026` must answer `302`. `GET /:code` was not touched, and that is the finding worth seeing.
- [ ] Step 7 — Run `npm run test:fast`. The seed suites must pass unmodified.

## Edge cases

| Case | Behaviour |
|---|---|
| `409` vs `400` | Different statements. `400` — the alias could never be used by anyone. `409` — it is fine, but someone got there first. Collapsing them tells the visitor to fix a string that has nothing wrong with it. |
| `alias: null` | `201`, generated code. The openapi schema types it `[string, "null"]`, so a client that always sends the key is honest, not malformed. |
| `alias: ''` | `400 'invalid alias'`. It is a value the visitor typed and cleared, not an absent field. T2's `alias != null` guard routes it into the claim branch, where T1 refuses it. |
| Both an invalid URL and an alias | `400` with the **URL** error. `validateUrl` runs first inside `createLink`. The visitor fixes the URL and only then learns about the alias — one problem at a time. |
| A future route above the catch-all | Adding `GET /about` above `GET /:code` silently makes an existing alias `about` unreachable, and no test fails. The reserved list must grow with the route table — recorded as a hard rule in the epic. |
| `GET /:code` needs a change | It does not, and that is ADR-0001's entire payoff. If this task finds itself editing the follow route, the alias is not the code and the design has drifted. |

## Definition of Done

- [ ] Every checklist step done; AC-t3-1 … AC-t3-9 green.
- [ ] `npm run test:fast` green; `npm run lint` clean.
- [ ] `tests/integration/shorten.test.js` and `tests/unit/shorten.test.js` pass **unmodified**.
- [ ] `GET /:code` was not modified by this task.
- [ ] The `catch` still re-throws anything that is neither `ValidationError` nor `AliasError`.
- [ ] PR linked back to `tasks/T3-app-mapping.md`.
- [ ] `tracker.md` updated: status `done`.
