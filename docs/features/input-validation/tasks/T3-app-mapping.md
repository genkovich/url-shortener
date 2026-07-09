---
id: T3
title: "App: 400 on invalid, 200 on dedup, 201 on new"
layer: "app"
deps: ["T2"]
acs: ["AC-01", "AC-02", "AC-03", "AC-04", "AC-05", "AC-06", "AC-07"]
files_hint: ["src/app.js"]
owner: "TBD"
estimate: "S"
status: "todo"
---

# T3 — App mapping (400 / 200 / 201)

## Why
Wire the domain outcomes (T1/T2) to HTTP so the visitor gets the right status and error shape ([sad.md](../sad.md) §6, §8; [architecture-map.md](../../../architecture-map.md) status codes). Backs the full AC set at the boundary.

## What
In `POST /api/shorten` (`src/app.js`): call the guard; on a validation error respond `400 { error }`; on a dedup hit respond `200 { code, short_url }` with the existing code; on a new create respond `201` as today. Keep the route thin — no validation logic inline; delegate to `src/shorten.js`.

## Definition of Done
- [ ] invalid input → 400 with `{ error }` (AC-02..05)
- [ ] valid new URL → 201, 7-char code (AC-01, AC-06)
- [ ] duplicate URL → 200 with the existing code (AC-07)
- [ ] existing seed tests (`tests/unit/shorten.test.js`, `tests/integration/shorten.test.js`) stay green

## Notes
The base-vertical happy path must not change (201, 7-char code) — the seed tests are the guard against regressions here. Enables the UI error (T4) and is covered by the suite (T5).
