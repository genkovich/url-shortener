# Tracker — bulk-and-delete

> Status of every task in the epic. `implement` updates `done` on commit.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`

| # | Task | Layer | Wave | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|---|
| T1 | `deleteLink` | domain | 1 | — | S | — | todo |
| T2 | `createLinksBulk` | domain | 1 | — | M | — | todo |
| T3 | routes | app | 2 | — | S | T1, T2 | todo |
| T4 | delete button + paste field | ui | 3 | — | M | T3 | todo |
| T5 | tests AC-01..08 | tests | 3 | — | M | T3 | todo |

**Total:** 5 tasks. No migration, one open question (the 100 kB body ceiling — spec §8, not blocking).
T1 and T2 are unblocked together and both write `src/shorten.js`: parallel by the graph, serial by the file.
Start at T1 / AC-t1-2 (deleting an unknown code returns `false`, and the table is unchanged).
