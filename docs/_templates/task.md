---
# ── Machine contract (mirrored in ../tasks.json) ──────────────────────────────
# The `implement` skill hard-refuses a tasks.json whose entries lack any of:
# id · title · layer · deps · acs · dod · files_hint.
# Everything else on this page is additive: humans and agents read it, the skill ignores it.
id: T1                              # T1..Tn, unique within the feature
title: "Domain: <what this task builds>"
feature: <slug>                     # folder name under docs/features/
project: url-shortener
layer: domain                       # migration | domain | app | ui | tests
deps: []                            # tasks that MUST land first ("blocked by")
acs: ["AC-01"]                      # acceptance-criteria ids from ../spec.md §5
files_hint: ["src/shorten.js"]      # the only files this task may touch

# ── Human contract (additive) ─────────────────────────────────────────────────
wave: 1                             # execution wave; tasks in one wave may run in parallel
priority: Must                      # Must | Should | Could
estimate: S                         # S | M | L
blocks: [T2]                        # reverse edge of `deps` — kept in sync by hand
owner: "TBD"
status: todo                        # todo | in_progress | blocked | review | done
context_budget: "~2500 tokens"      # how much an impl-agent should need to load
created: 2026-07-09
spec_refs: ["§5 AC-01"]
sad_refs: ["§4 Solution strategy"]
openapi_paths: []                   # e.g. ["POST /api/shorten"] — must exist in ../contracts/openapi.yaml
adr_refs: []                        # e.g. ["ADR-0001"]
---

# T1 · <Short imperative title>

**Feature:** [<slug>](./_epic.md)
**Priority:** Must
**Estimate:** S
**Wave:** 1 (<what this wave is about>)

## Position in the sequence

- **Blocked by:** — (or: T1 — reason the edge exists)
- **Blocks:** T2 (reason), T3 (reason)
- **Why this wave:** one sentence. What must be true before this task, and what it unlocks.

## Why (user story)

As a **visitor**, I want <capability> so that <outcome>.

Spec US-0N. AC-0X (<what it demands>), AC-0Y (<what it demands>).

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#6-runtime-view)
- 🗄  Data delta:   none — no schema change (or: migration `NN_<name>` under `../migrations/`)
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — `POST /api/...`
- 📜 Relevant ADR: [ADR-0001](../adr/0001-<slug>.md) (<one-line why it binds this task>)
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-0X, AC-0Y
- 🧬 Parity ref:   mirror `src/shorten.js` shape (<which existing function to copy>)

## Data delta

```
NO DB CHANGES IN THIS TASK — pure domain function.

(or, when there is one:)
ALTER TABLE links ADD COLUMN <name> <TYPE>;   -- idempotent, in src/db.js migrate()

Write pattern:
  1. <step>
  2. <step>
```

## API contract

```
POST /api/<path>
  Request:  { "field": "…" }
  Response:
    201 { code, short_url }        <when>
    400 { error: "<slug>" }        <when>
    409 { error: "<slug>" }        <when>
```

_or:_ `_API surface: none — internal task. The route layer consumes this in TN._`

## Acceptance criteria (GWT)

- [ ] **AC-t1-1 (happy path):** Given <precondition>, when <action>, then <observable outcome>.
- [ ] **AC-t1-2 (<label>):** Given <precondition>, when <action>, then <observable outcome>.

> Each `AC-tN-k` must trace back to an `AC-0X` in [spec.md](../spec.md) §5 — that mapping is what
> `acs:` in the frontmatter records. A task-level AC with no spec parent is scope creep.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — Create/extend `<file>`: add `<symbol>(<args>) → <return>`.
- [ ] Step 2 — <the next concrete edit, naming the file and the symbol>.
- [ ] Step 3 — Wire it: `<caller>` in `<file>` calls `<symbol>` and maps `<outcome>` to `<result>`.
- [ ] Step 4 — Tests: `<test file>` covers AC-t1-1..AC-t1-N. RED first.

## Edge cases

| Case | Behaviour |
|---|---|
| <input at the exact boundary> | <what the code does, and why that is right> |
| <legacy / pre-migration row> | <what the code does> |
| <concurrent or repeated call> | <what the code does> |

## Definition of Done

- [ ] Every checklist step done; every AC green.
- [ ] `npm run test:fast` green; `npm run lint` clean.
- [ ] <feature-specific proof, e.g. "no row written on a rejected create">
- [ ] PR linked back to `tasks/<this-file>.md`.
- [ ] `tracker.md` updated: status `done`.
