# Tracker — custom-alias

> Status of every task in the epic. `implement` updates `done` on commit.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`

| # | Task | Layer | Wave | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|---|
| T1 | `validateAlias` | domain | 1 | — | S | — | todo |
| T2 | claim branch | domain | 1 | — | S | T1 | todo |
| T3 | `201`/`400`/`409` mapping | app | 2 | — | S | T2 | todo |
| T4 | alias input | ui | 3 | — | S | T3 | todo |
| T5 | tests AC-01..07 | tests | 3 | — | S | T3 | todo |

**Total:** 5 tasks. No migration, no open questions. Start at T1 / AC-t1-5 (`healthz` → `reserved alias`).
