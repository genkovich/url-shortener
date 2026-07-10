---
status: Accepted
owner: "genkovich"
reviewers: ["Tech Lead"]
updated_at: "2026-07-10"
feature_size: "M"
---

# Spec — rate-limiting

> **Glossary:** link, code, visitor, click (see `docs/CONTEXT.md`). New here: bucket, token, window, sweep (see `sad.md` §12).
> **Reference module / docs used:** `docs/architecture-map.md`, features `base-vertical`, `input-validation`.

## 1. Context
`POST /api/shorten` writes a row for every request it receives, and it receives as many as anyone cares to send. A loop of ten lines fills the table for as long as the disk holds. `docs/architecture-map.md` has carried the line `- No rate-limit yet.` under Constraints since bootstrap, and its status-code table has reserved `429` for this feature from the same day.

This feature bounds the write side by client IP: a bucket of tokens per address, one token per accepted create, refilled continuously. Over budget, the service answers `429` and says how long to wait. Nothing else changes — following a link, listing links and reading stats stay free, because a redirect that can be rate-limited is a redirect that does not work.

The whole feature is about forty lines of arithmetic. Every hard part is somewhere else: which string identifies the client, how long "wait" is in integer seconds, and what happens to the memory that holds the buckets.

## 2. Goals
- A client that stays under the budget sees exactly the behaviour it saw before this feature existed.
- A client over the budget is refused with `429`, is told how many whole seconds to wait, and creates nothing.
- The budget is per client address, and the budget is refilled by the passage of time, not by a reset tick.
- Capacity and window are configurable through the environment, with working defaults.
- The state that makes this possible does not grow without bound.

## 3. Non-goals
- Limiting reads. `GET /:code`, `GET /api/links`, `GET /api/stats/:code` and `/healthz` are never refused.
- Shared state across processes. Two workers hold two independent limits (§6.1, `sad.md` §11).
- `X-RateLimit-Limit` / `-Remaining` / `-Reset` response headers. Not standardised, not asked for, and every one of them is a second contract to keep true.
- Per-account or per-API-key quotas. There are no accounts (`docs/CONTEXT.md` → visitor).
- Deciding `app.set('trust proxy', …)`. That is a property of a deployment, not of this feature (§6.1).
- Blocking, banning, or remembering an offender beyond one window.

## 4. User stories
### US-01: Keep shortening at a human pace
**As a** visitor
**I want** my ordinary use of the form to be untouched, and to be let back in after I wait
**So that** a limit aimed at a script never lands on me.

### US-02: Be refused clearly, and told how long to wait
**As a** client over the budget
**I want** a distinct status and a machine-readable delay
**So that** I can back off correctly instead of hammering or giving up.

### US-03: Follow links regardless
**As a** visitor
**I want** redirects, the links list and stats to answer always
**So that** a limit on creation never breaks a link somebody already shared.

## 5. Acceptance criteria
### AC-01 (US-01) — happy path
**Given** a client that has used fewer than `RATE_LIMIT_MAX` tokens inside the current window
**When** it calls `POST /api/shorten` with a valid body
**Then** the response is `201` with `code` and `short_url`, identical in every field to the behaviour before this feature.

### AC-02 (US-02) — error
**Given** a client whose bucket holds less than one token
**When** it calls `POST /api/shorten`
**Then** the response is `429` with body `{ "error": "rate limited" }` and a `Retry-After` header that is a whole number of seconds, never below `1`, and **no link is created**.

### AC-03 (US-02) — per-client isolation
**Given** one client has exhausted its bucket
**When** a different client address calls `POST /api/shorten`
**Then** that client is served normally. Buckets are keyed by address; exhausting one leaves every other untouched.

### AC-04 (US-01) — the bucket refills
**Given** a client was refused with `Retry-After: N`
**When** it waits `N` seconds and retries
**Then** it is served `201`. Tokens accrue continuously at `RATE_LIMIT_MAX / RATE_LIMIT_WINDOW_MS` per millisecond — one token per second at the defaults — up to a ceiling of `RATE_LIMIT_MAX`.

### AC-05 (US-03) — read paths are never limited
**Given** a client whose bucket is empty
**When** it calls `GET /:code`, `GET /api/links`, `GET /api/stats/:code` or `/healthz`
**Then** each answers exactly as it would for a client with a full bucket. Only `POST /api/shorten` consumes a token.

### AC-06 (NFR) — configuration
**Given** `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` in the process environment
**When** the service starts
**Then** those values govern the limiter. Absent or unusable, the defaults `60` and `60000` govern instead, and the effective pair is printed once at boot.

### AC-07 (US-02) — the frontend explains the refusal
**Given** the form submits a URL and the server answers `429`
**When** the response is rendered
**Then** the visitor sees that the limit was hit and how many seconds to wait, taken from `Retry-After`; the URL they typed is still in the field.

> **Authorization:** N/A — single-visitor toy, no accounts. The client address is the only identity available, and it is not authenticated (§6.1).

## 6. Non-functional requirements
| Aspect | Target | Measurement |
|---|---|---|
| Capacity | `RATE_LIMIT_MAX` tokens, default `60` | bucket ceiling; also the maximum burst from cold |
| Refill | `max / windowMs` tokens per ms, continuous | 1 token / 1000 ms at the defaults |
| `Retry-After` | integer seconds, `>= 1` | RFC 9110 §10.2.3 `delay-seconds` is `1*DIGIT` |
| Back-off correctness | a client that obeys `Retry-After` is never refused twice in a row | verified across `max` ∈ {1, 5, 60, 250, 1000, 5000} × five clock offsets |
| Cost per accepted request | one `Map` lookup, three arithmetic ops, no I/O | no `SELECT`, no timer, no allocation on the hot path |
| Resident state | one entry per address seen inside the last window | ~285 bytes per entry, measured; 10⁶ idle addresses ≈ 272 MiB if never swept |
| Sweep | a full pass at most once per `windowMs` | a pass over 100 000 entries took 15.6 ms |
| New runtime dependencies | zero | `docs/architecture-map.md` → Dependencies |

Four facts about the running system drive the design, and each was measured against this codebase rather than assumed.

- **`Math.ceil` over a strictly positive delay can never yield `0`.** A refused request holds fewer than one token, so the deficit is strictly positive, so the delay in milliseconds is strictly positive, so its ceiling in seconds is at least `1`. The `>= 1` floor in AC-02 is therefore not doing the work people think it does; it is a tripwire against a later `Math.round` or `Math.floor`, which do yield `0` (ADR-0001, `test-plan.md`).
- **Express does not sanitise `Retry-After`.** `res.set('Retry-After', 0)` ships the header `0`; `0.06` ships as `0.06`; `NaN` ships as `NaN`. Nothing throws. A bad value is not a crash — it is a header a client silently misreads.
- **The refill must be fractional.** Adding whole tokens and resetting the clock discards the leftover milliseconds. A client polling every 999 ms then receives **zero** tokens over the following 60 s, forever, while the fractional refill grants it 59. Measured; see `test-plan.md` → Edge cases.
- **A bucket idle for at least `windowMs` is necessarily full.** Starting from empty, `windowMs` of refill adds exactly `max` tokens — checked for `max` ∈ {1, 3, 7, 60, 97, 1000, 60000}, exact equality in every case. So evicting an idle bucket is observationally identical to keeping it, and the sweep is safe rather than merely convenient.

## 6.1 Security / privacy
- Data classification: client IP addresses, held in memory only, for at most one window past the last request. Never written to SQLite, never logged.
- Personal data: an IP address is personal data in some jurisdictions. It is never persisted and never leaves the process; the sweep is the retention policy.
- AuthZ/AuthN impact: none. The address is the only identity, and it is not proven.
- Abuse cases:
  - **Proxy collapse.** Behind a reverse proxy without `trust proxy`, Express reports the proxy's address for every request, so the whole internet shares one bucket and the first 60 requests exhaust it for everyone. Deployment concern; accepted debt with a named trigger (`sad.md` §11).
  - **Header spoofing.** Setting `app.set('trust proxy', true)` moves the key into a request header the client controls: with `X-Forwarded-For: 9.9.9.9, 8.8.8.8`, `req.ip` becomes `9.9.9.9` — attacker's choice. Measured. A deployment behind exactly one proxy must set the hop count (`1`) or `'loopback'`, never `true`.
  - **IPv6 rotation.** A client with a `/64` owns 2⁶⁴ addresses. Keying on the full address lets it take a fresh bucket per request *and* spend ~285 bytes of ours each time. The sweep caps the damage at one window of traffic; keying on the `/64` prefix would close it, and is out of scope. Accepted, recorded.
  - **Shared NAT.** An office or a university behind one public address shares one bucket. At 60 creates per minute this is generous for humans and cheap for a script; the trade is accepted for a toy.
  - **Malformed-body spam.** `express.json()` is mounted before the route, so a body that fails to parse is answered `400` and the limiter never runs — measured: the middleware executed zero times. No link is created and the parse is bounded by the 100 kB default body limit, so this bypasses the *limit*, not the *protection*. Recorded in `test-plan.md` and `sad.md` §11.
  - **Restart as a reset.** Buckets live in the heap. Any deploy hands every client a full bucket. Accepted; the alternative is a datastore (ADR-0001).
- Security review: N/A (single-visitor toy). The two security-relevant decisions are that the key comes from the socket rather than from a header, and that read paths cannot be refused.

## 7. Metrics / KPIs
- Share of `POST /api/shorten` answered `429`: baseline 0 → observed. A number that never leaves 0 means the limit is decorative; one above a few percent means it is misconfigured or the service is under attack.
- Buckets resident, and entries evicted per sweep: observed. Resident count that climbs monotonically across days means the sweep is not running.
- `201` latency on `POST /api/shorten`: unchanged. The limiter adds a `Map` lookup; the sweep adds 15.6 ms per 100 000 entries at most once per window.

## 8. Open questions
- [ ] None blocking. `trust proxy` is a deployment decision and is recorded as accepted debt, not as an open question (`sad.md` §11). Per-process state is accepted with a named trigger for when it stops being acceptable (§3, `sad.md` §11). Capacity, window, error string and header shape are fixed in §5 and §6.
