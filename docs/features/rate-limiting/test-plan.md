---
status: Accepted
owner: "genkovich"
reviewers: ["Tech Lead"]
updated_at: "2026-07-10"
feature_size: "M"
---

# Test plan — rate-limiting

## Levels
| Level | Scope | Strategy |
|---|---|---|
| Unit | `createRateLimiter` — capacity, fractional refill, per-key isolation, `retryAfterMs`, the sweep | construct with three literals and a fake clock; advance the clock by assignment |
| Integration | `POST /api/shorten` answers `201` / `429`; `Retry-After` is a positive integer; read paths never refuse | `createApp(openDb(':memory:'), { rateLimiter })` with a tiny injected limiter, driven by supertest |
| E2E-through-UI | deferred — see **Not tested, and why** | — |

The clock is the whole reason this table has a Unit row worth reading. `createRateLimiter({ max, windowMs, now })` takes `now` as a function; a test passes `() => clock` and moves `clock` by hand. Nothing sleeps, nothing is flaky, and a sixty-second window is exercised in microseconds.

## AC coverage
| AC | Test name | Level | Expected outcome |
|---|---|---|---|
| AC-01 | under the limit, creation is unchanged | Integration | `201`, 7-char code, `short_url` contains it, no `Retry-After` header |
| AC-02 | over the limit → 429 + Retry-After | Unit + Integration | `429`, `{ error: 'rate limited' }`, `Retry-After` matches `/^[1-9][0-9]*$/`, row count unchanged |
| AC-03 | one exhausted key does not touch another | Unit | `take('a')` × max+1 refuses; `take('b')` still allowed |
| AC-04 | the bucket refills with time | Unit + Integration | after advancing the clock by `Retry-After` seconds, the next `take` is allowed |
| AC-05 | only POST /api/shorten is limited | Integration | with an empty bucket: `GET /:code` → `302`, `/api/links` → `200`, `/api/stats/:code` → `200`, `/healthz` → `200` |
| AC-06 | env configures max and window | Unit | `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` honoured; absent or unusable → `60` / `60000` |
| AC-07 | the form shows the limit and the wait | Manual (see below) | `#error` reads as a limit message and names the seconds from `Retry-After` |

## Edge cases / error paths
Each of these is a measured fact about *this* codebase, not a general worry. The measurement is given so the test can be argued with.

- **Every supertest request has the same IP.** `createApp(openDb(':memory:'))` with a probe route returns `req.ip === '::ffff:127.0.0.1'` — from any number of independent `request(app)` agents, and *also* when the request carries `X-Forwarded-For: 203.0.113.9`, because `trust proxy` is false and Express correctly ignores the header. Consequence: **the integration suite is one client.** AC-03 cannot be written there. It is a unit test over `take(key)`, and the limiter is injected into `createApp` so that the HTTP tests can shrink the budget instead of inventing an address.
- **`Retry-After: 0` and what it costs.** Express does not validate the header: `res.set('Retry-After', 0)` sends `0`, `0.06` sends `0.06`, `NaN` sends `NaN`. `0` is a *valid* `delay-seconds` (RFC 9110 §10.2.3) and means *retry now*, so a refused client loops at full speed and the limiter converts a burst into a busy-wait. `Math.ceil` over a strictly positive deficit can never emit `0`; `Math.round` and `Math.floor` can — at `RATE_LIMIT_MAX=1000` a token accrues every 60 ms and `round(0.06) === 0`. Test the header shape against `/^[1-9][0-9]*$/` and not merely `>= 0`, so the mutation in the last step of T5 has something to turn red.
- **The obedient client must never be refused twice.** Ceiling, not rounding, is what guarantees it. Verified across `max` ∈ {1, 5, 60, 250, 1000, 5000} × clock offsets {0, 1, 7, 137, 999} ms: the smallest header emitted was `1`, and every client that advanced its clock by exactly `Retry-After` seconds was served on the retry.
- **Whole-token refill starves a polite client.** Adding `floor(elapsed / msPerToken)` tokens and then setting `lastRefillMs = now` discards the remainder. Simulated at `max=60, windowMs=60000`: a client polling every 900 ms gets **0** requests over the next 60 s (fractional refill gives it 59). At 999 ms, still 0. At exactly 1000 ms, 60 — the bug vanishes when the poll interval divides the token period, which is precisely the interval a lazy test would pick. Pin it with a poll interval that does **not** divide `windowMs / max`.
- **A bucket idle for a window is full, exactly.** From empty, `windowMs` of refill adds exactly `max` tokens: exact equality for `max` ∈ {1, 3, 7, 60, 97, 1000, 60000}. So the sweep may evict on idleness alone; the `tokens >= max` half of the predicate is a theorem, not a second condition. Test that eviction never grants a token: drain a key, advance just *under* a window, and assert the next `take` is still refused.
- **A `setInterval` sweep would hang the suite.** Measured: `node -e "setInterval(() => {}, 1000)"` never exits (killed by `SIGTERM` after 1.5 s); `.unref()` on the same handle exits at once. The design has no timer, so there is nothing to `.unref()` and nothing to leak between test files. If a future refactor adds one, `npm run test:fast` will hang rather than fail, which is why QG-6 exists.
- **A malformed JSON body never reaches the limiter.** `express.json()` is mounted app-wide, above the route. Measured: for `POST /api/shorten` with body `{"url": broken`, the response is `400 { error: 'bad request' }` and the route middleware ran **zero** times. So malformed-body spam costs no token. It also creates no link, and the parse is capped by the 100 kB default body limit. Assert the `400` explicitly, so the day someone moves the limiter above `express.json()` and turns it into a `429`, a test says so.
- **`parseInt` is the wrong parser for the env.** `parseInt('1e3', 10) === 1` and `parseInt('60abc', 10) === 60` — both silently wrong. `Number('60abc')` is `NaN`, which is at least honest. And the idiom `Number(raw) || 60` maps `'0'` to `60` (so the limit cannot be set to zero) while happily accepting `'-5'`. Use `Number`, then `Number.isInteger(n) && n > 0`, then fall back.
- **`NaN` survives the floor.** `Math.max(1, NaN)` is `NaN`, and Express then sends the header `Retry-After: NaN` alongside a `429`. So the `>= 1` floor does not protect against a bad `RATE_LIMIT_WINDOW_MS`; validating at boot does. Two separate tests, because they fail for different reasons.
- **A frozen global clock breaks unrelated tests.** `createLink` stamps `created_at` with `Date.now()` and `listLinks` sorts by it. Measured: with `Date.now` frozen, five links share one `created_at` and `ORDER BY created_at DESC` is no longer a total order — SQLite happened to return insertion order, which is not a promise. Fake the limiter's clock through the `now` parameter; never `vi.useFakeTimers()`.
- **A refusal consumes nothing.** A client hammering an empty bucket must not push its own recovery further away. Assert that after `k` refusals the accepted-at time is the same as after one.
- **`req.ip` may be `undefined`** if the socket is gone before the middleware runs. Key on `req.ip ?? 'unknown'` so a `Map` key of `undefined` cannot silently merge such requests with nothing, and so `take` never receives a non-string.

## Test data
- limiter under test (unit): `createRateLimiter({ max: 2, windowMs: 1000, now: () => clock })` — one token per 500 ms, so a 750 ms poll does not divide the token period
- limiter injected into the app (integration): `createRateLimiter({ max: 1, windowMs: 60000, now: () => clock })` — the second create in any test is the refused one
- keys: `'1.1.1.1'`, `'2.2.2.2'` (isolation); `'::1'` and `'::ffff:127.0.0.1'` (two strings, one machine — two buckets, by design)
- header shape: `/^[1-9][0-9]*$/`
- env: `'60'` → 60 · `''` → default · `'abc'` → default · `'0'` → default · `'-5'` → default · `'1e3'` → 1000 · `'60abc'` → default
- read paths for AC-05: `GET /<code>`, `GET /api/links`, `GET /api/stats/<code>`, `GET /healthz`

## NFR validation (load)
No load test. The per-request cost is one `Map` lookup and three arithmetic operations, and the only non-constant work is the sweep, measured directly rather than benchmarked: **15.6 ms for a full pass over 100 000 buckets**, amortised to at most one pass per `windowMs`. Resident cost measured at **~285 bytes per bucket** (100 000 unique keys, `--expose-gc`, heap delta around a forced collection), so a million idle addresses would hold ~272 MiB — which is the number that makes the sweep a requirement rather than a nicety.

## Not tested, and why
**AC-07 has no automated test in this feature.** Driving a `429` through the browser means letting the Playwright page submit the form `RATE_LIMIT_MAX + 1` times, or lowering the limit for the e2e server. The first is 61 form submissions for one assertion; the second means setting `RATE_LIMIT_MAX=2` in `playwright.config.js`'s `webServer.env`, and `playwright.config.js` is outside this feature's file set. Verify AC-07 by hand once — `for i in $(seq 1 61); do curl -s -o /dev/null -X POST localhost:3000/api/shorten -H 'content-type: application/json' -d '{"url":"https://example.com"}'; done`, then submit the form — and record it in T4's DoD. Automating it is a one-line change to the Playwright config on the day someone wants it.

## CI placement
Unit in `tests/unit/rate-limit.test.js` and integration in `tests/integration/rate-limit.test.js`, both run browser-free by `npm run test:fast` (the per-task gate) and therefore by `npm run gate`. No new e2e spec, so `npm run test:e2e` is untouched.
