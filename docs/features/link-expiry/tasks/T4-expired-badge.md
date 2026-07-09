---
id: T4
title: "Frontend: expired/active badge in links table"
layer: "ui"
deps: ["T3"]
acs: ["AC-05"]
files_hint: ["src/public/app.js", "src/public/index.html", "src/public/style.css"]
owner: "TBD"
estimate: "S"
status: "todo"
---

# T4 — Expired badge

## Why
Surface each link's expired/active state in the frontend list, consistent with follow behaviour ([[../sad.md]] §5, [[../spec.md]] AC-05). Backs AC-05.

## What
In the frontend (`app.js`, `index.html`, `style.css`), show an expired/active badge per row, derived from the link's lifetime versus now, matching what following the link would do.

## Definition of Done
- [ ] each listed link shows an expired or active badge
- [ ] the badge state matches the follow behaviour for that link
- [ ] presentation only — no expiry rule duplicated here

## Notes
Reads state produced by the domain layer (T2); no independent expiry logic in the UI. Depends on the read-path guard (T3).
