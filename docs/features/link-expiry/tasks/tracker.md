# Tracker — link-expiry

> Status of every task in the epic. `sdd:implement` updates `done` on commit.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | add expires_at | migration | — | S | — | todo |
| T2 | default TTL + isExpired | domain | — | M | T1 (+ open Q §8) | blocked |
| T3 | 410 on expired | app | — | S | T2 | todo |
| T4 | expired badge | ui | — | S | T3 | todo |
| T5 | tests | tests | — | M | T3 | todo |

**Total:** 5 tasks, ~2 person-days. T2 blocked on the default-TTL open question (agent asks human).
