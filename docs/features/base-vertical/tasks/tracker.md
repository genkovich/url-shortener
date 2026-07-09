# Tracker — base-vertical

> Status of every task in the epic. `implement` updates `done` on commit.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`

| # | Task | Layer | Wave | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|---|
| T1 | links table + migrate | migration | 1 | genkovich | S | — | done |
| T2 | domain functions | domain | 2 | genkovich | S | T1 | done |
| T3 | app routes | app | 3 | genkovich | S | T2 | done |
| T4 | frontend | ui | 4 | genkovich | S | T3 | done |
| T5 | seed test suite | tests | 4 | genkovich | S | T3 | done |

**Total:** 5 tasks, all shipped. No migration file (the base schema is inline), no open questions.
