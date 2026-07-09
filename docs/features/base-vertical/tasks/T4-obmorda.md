---
id: T4
title: "Frontend: form + result + links table"
layer: "ui"
deps: ["T3"]
acs: ["AC-01", "AC-03"]
files_hint: ["src/public/index.html", "src/public/app.js", "src/public/style.css"]
owner: "genkovich"
estimate: "S"
status: "done"
---

# T4 — Frontend

## Why
Frontend a visitor uses to shorten and inspect links ([[../sad.md]] §5). Backs AC-01/03 (and shows the list state of AC-05).

## What
Static page (`index.html`, `app.js`, `style.css`) with a form to submit a url, a result area showing the returned short handle, and a table listing existing links with their click counts. Talks to the app routes (T3).

## Definition of Done
- [x] the page renders and the form submits a url
- [x] the returned short handle is shown to the visitor
- [x] existing links appear in the list with their click counts

## Notes
Parallelizable with tests (T5) once routes (T3) exist. Presentation only — no domain rules live here.
