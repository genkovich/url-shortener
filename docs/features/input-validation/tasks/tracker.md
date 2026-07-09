# Tracker — input-validation

> Status of every task in the epic. `implement` updates `done` on commit.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`

| # | Task | Layer | Wave | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|---|
| T1 | validateUrl guard | domain | 1 | — | S | — | todo |
| T2 | dedup | domain | 1 | — | S | T1 | todo |
| T3 | 400/200/201 mapping | app | 2 | — | S | T2 | todo |
| T4 | inline UI error | ui | 3 | — | S | T3 | todo |
| T5 | tests AC-01..07 | tests | 3 | — | S | T3 | todo |

**Total:** 5 tasks. No migration, no open questions. Start at T1 / AC-t1-2 (empty URL → `url required`).
