# Tracker — link-expiry

> Status of every task in the epic. `implement` updates `done` on commit.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`

| # | Task | Layer | Wave | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|---|
| T1 | `expires_at` column | migration | 1 | — | S | — | todo |
| T2 | default TTL + `isExpired` | domain | 2 | — | M | T1 · open question §8 | blocked |
| T3 | `410` on expired | app | 3 | — | S | T2 | todo |
| T4 | expired badge | ui | 4 | — | S | T3 | todo |
| T5 | tests AC-01..05 | tests | 4 | — | M | T3 | todo |

**Total:** 5 tasks, one real migration. T2 is blocked on the default-TTL open question (spec §8) —
the agent asks the human before writing code, and the whole chain waits behind it.
