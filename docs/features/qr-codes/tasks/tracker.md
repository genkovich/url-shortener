# Tracker — qr-codes

> Status of every task in the epic. `implement` updates `done` on commit.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`

| # | Task | Layer | Wave | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|---|
| T1 | `renderQrSvg` | domain | 1 | — | S | — | todo |
| T2 | `GET /api/qr/:code` | app | 2 | — | S | T1 | todo |
| T3 | QR button | ui | 3 | — | S | T2 | todo |
| T4 | unit + integration | tests | 3 | — | S | T2 | todo |
| T5 | e2e | tests | 3 | — | S | T3 | todo |

**Total:** 5 tasks. No migration, no open questions. Start at T1 / AC-t1-1 (`renderQrSvg` returns a Promise, and `await`ing it yields an `<svg>`).
