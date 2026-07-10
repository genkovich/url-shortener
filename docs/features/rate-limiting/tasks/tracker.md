# Tracker — rate-limiting

> Status of every task in the epic. `implement` updates `done` on commit.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`

| # | Task | Layer | Wave | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|---|
| T1 | token bucket | domain | 1 | — | M | — | todo |
| T2 | middleware `429` + `Retry-After` | app | 2 | — | S | T1 | todo |
| T3 | env configuration and wiring | app | 2 | — | S | T2 | todo |
| T4 | render the wait | ui | 3 | — | S | T3 | todo |
| T5 | tests AC-01..07 | tests | 3 | — | M | T3 | todo |

**Total:** 5 tasks. No migration, no new dependency, no open questions. Start at T1 / AC-t1-4 (a client that obeys `Retry-After` is served on the retry).
