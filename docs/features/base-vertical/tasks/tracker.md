# Tracker — base-vertical

> Status of every task in the epic. `sdd:implement` updates `done` on commit.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | links table + migrate | migration | genkovich | S | — | done |
| T2 | domain functions | domain | genkovich | S | T1 | done |
| T3 | app routes | app | genkovich | S | T2 | done |
| T4 | frontend | ui | genkovich | S | T3 | done |
| T5 | seed tests | tests | genkovich | S | T3 | done |

**Total:** 5 tasks, ~1 person-day. All shipped (commit b3b481b).
