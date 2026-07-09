---
id: T3
title: "App routes: shorten, follow, list, stats"
layer: "app"
deps: ["T2"]
acs: ["AC-01", "AC-02", "AC-03"]
files_hint: ["src/app.js"]
owner: "genkovich"
estimate: "S"
status: "done"
---

# T3 — App routes

## Why
Route layer that exposes the domain functions to the frontend ([sad.md](../sad.md) §5–6). Backs AC-01/02/03.

## What
`createApp(db)` wires the routes over the domain layer: create a short link from a submitted url, follow a code to redirect to its original and count the visit, list all links, and report stats for one code (reported as not found when the code is unknown). The domain-specific routes are matched ahead of the catch-all follow route.

## Definition of Done
- [x] submitting a url creates a link and returns its short handle
- [x] following a known code redirects to the original and counts the visit
- [x] requesting stats for an unknown code reports it as not found
- [x] domain routes resolve ahead of the catch-all follow route
- [x] lint clean

## Notes
No domain logic here — delegates to `shorten.js` (T2). Error shape and outcome codes follow architecture-map. Enables both frontend (T4) and tests (T5).
