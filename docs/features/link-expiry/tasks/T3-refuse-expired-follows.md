---
id: T3
title: "App: refuse expired follows as gone; accept a lifetime on create"
layer: "app"
deps: ["T2"]
acs: ["AC-02", "AC-03"]
files_hint: ["src/app.js"]
owner: "TBD"
estimate: "S"
status: "todo"
---

# T3 — Refuse expired follows

## Why
Read-path guard: an expired link is refused instead of redirecting, and creation accepts a chosen lifetime ([sad.md](../sad.md) §4, §6). Backs AC-02/03.

## What
In `src/app.js`, the follow route refuses a link whose lifetime has passed and reports it as gone; a link still within its lifetime redirects as before. The create route accepts an optional lifetime in days and passes it to the domain layer.

## Definition of Done
- [ ] following an expired link is refused and reported as gone
- [ ] following a link still within its lifetime redirects as usual
- [ ] a refused (expired) follow does not count a click
- [ ] a chosen lifetime given at creation is honoured

## Notes
Guard lives on the read path only — no background deletion (per §4). Delegates the expiry decision to the domain predicate (T2).
