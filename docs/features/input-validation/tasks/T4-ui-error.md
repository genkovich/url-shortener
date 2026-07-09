---
id: T4
title: "Frontend: inline validation error under the form"
layer: "ui"
deps: ["T3"]
acs: ["AC-02"]
files_hint: ["src/public/app.js", "src/public/index.html", "src/public/style.css"]
owner: "TBD"
estimate: "S"
status: "todo"
---

# T4 — Inline UI error

## Why
A refused create should tell the visitor why, not fail silently ([spec.md](../spec.md) §4 US-02). Gives practice step 2 (Playwright) something to assert through the frontend.

## What
In `src/public/`, when `POST /api/shorten` returns 400, show the `error` message inline under the form (not an alert); clear it on the next successful create. Reuse the existing CSS tokens — no framework.

## Definition of Done
- [ ] a 400 renders the server `error` message under the form
- [ ] the message clears on a subsequent successful shorten
- [ ] styling reuses existing `style.css` tokens

## Notes
Keep it minimal and readable. This surface is what the step-2 E2E test drives to prove validation works end-to-end, not only at the API.
