---
id: T2
title: "App: limiter middleware on `POST /api/shorten` → 429 + Retry-After"
feature: rate-limiting
project: url-shortener
layer: app
deps: ["T1"]
acs: ["AC-01", "AC-02", "AC-05"]
files_hint: ["src/app.js"]
wave: 2
priority: Must
estimate: S
blocks: [T3]
owner: "TBD"
status: todo
context_budget: "~2500 tokens"
created: 2026-07-10
spec_refs: ["§5 AC-01", "§5 AC-02", "§5 AC-05", "§6.1 Security / privacy"]
sad_refs: ["§4 Solution strategy", "§6 Runtime view", "§10 QG-1", "§10 QG-2"]
openapi_paths: ["POST /api/shorten"]
adr_refs: ["ADR-0001"]
---

# T2 · The middleware, the `429`, and the header

**Feature:** [rate-limiting](./_epic.md)
**Priority:** Must
**Estimate:** S
**Wave:** 2 (app)

## Position in the sequence

- **Blocked by:** T1 — there is no `retryAfterMs` to convert and no `take` to call before it.
- **Blocks:** T3 — the limiter must be injectable before there is anything for the environment to configure.
- **Why this wave:** the only HTTP change in the feature. One middleware, one status code, one header, and one route that is allowed to see it.

## Why (user story)

As a **client over the budget**, I want a `429` and a delay I can act on; as a **visitor**, I want the link I already shared to keep redirecting while somebody else's script is being throttled.

Spec US-02, US-03. AC-01 (under the limit, nothing changed), AC-02 (`429` + `Retry-After`, nothing written), AC-05 (reads are never refused).

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#6-runtime-view) — where `take` sits relative to `createLink`
- 🗄  Data delta:   none — `src/app.js` contains no SQL and must not gain any
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — `POST /api/shorten`: `201`, and `429` with `Retry-After` as `integer, minimum: 1`
- 📜 Relevant ADR: [ADR-0001](../adr/0001-in-memory-token-bucket.md) — why the limiter is injected rather than constructed here, and why `Math.max(1, …)` stays even though it can never fire
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01, AC-02, AC-05
- 🧬 Parity ref:   `createApp(db)` itself — `db` is injected so tests can pass `':memory:'`. The limiter is injected for the same reason and for a sharper one: under supertest the tests cannot change their own IP

## Data delta

```
NO DB CHANGES IN THIS TASK — and the 429 branch performs no query at all.

Signature change in src/app.js:
  createApp(db, { rateLimiter = createRateLimiter() } = {})

Middleware, route-level, on ONE route:
  const limit = (req, res, next) => {
    const verdict = rateLimiter.take(req.ip ?? 'unknown');
    if (verdict.allowed) return next();
    const seconds = Math.max(1, Math.ceil(verdict.retryAfterMs / 1000));
    res.set('Retry-After', String(seconds));
    res.status(429).json({ error: 'rate limited' });
  };

  app.post('/api/shorten', limit, (req, res) => { ...unchanged... });

NOT mounted on: GET /:code · GET /api/links · GET /api/stats/:code · GET /healthz
                GET /metrics · GET /api/qr/:code · DELETE /api/:code   (the 501 stubs)
```

## API contract

```
POST /api/shorten     { url }

  Response:
    201 { code, short_url }                               a token was consumed        (AC-01)
    429 { error: 'rate limited' } + Retry-After: <int>    nothing written, no token consumed (AC-02)

Retry-After = String(Math.max(1, Math.ceil(retryAfterMs / 1000)))

Unchanged: GET /:code · GET /api/links · GET /api/stats/:code · /healthz  (AC-05)
```

`Math.ceil` is what makes the header a positive integer, because T1 guarantees `retryAfterMs > 0`.
`Math.max(1, …)` can therefore never fire. Keep it anyway; the **Edge cases** table says what it is for.

## Acceptance criteria (GWT)

- [ ] **AC-t2-1 (under the limit — AC-01):** Given a limiter with budget remaining, when `POST /api/shorten` runs with a valid body, then `201` with a 7-character code and a `short_url` containing it, and **no** `Retry-After` header on the response.
- [ ] **AC-t2-2 (over the limit — AC-02):** Given an injected limiter with `max: 1`, when the second `POST /api/shorten` runs, then `429` with body exactly `{ error: 'rate limited' }`.
- [ ] **AC-t2-3 (the header — AC-02):** That `429` carries `Retry-After`, and its value matches `/^[1-9][0-9]*$/`. Assert the string, not `Number(header) >= 0` — `'0'`, `'0.06'` and `'NaN'` all satisfy a lazy assertion, and Express will send any of them.
- [ ] **AC-t2-4 (a refusal writes nothing — QG-2):** After the `429`, `GET /api/links` returns exactly the rows that existed before it. Assert the row count, not the status code.
- [ ] **AC-t2-5 (reads are never refused — AC-05, QG-1):** Given the bucket is empty, when `GET /<code>`, `GET /api/links`, `GET /api/stats/<code>` and `GET /healthz` run, then they answer `302`, `200`, `200`, `200`. The redirect still counts its click.
- [ ] **AC-t2-6 (one route):** The `501` stubs (`GET /metrics`, `GET /api/qr/:code`, `DELETE /api/:code`) still answer `501` with an empty bucket. They are not creation and must not consume a token.
- [ ] **AC-t2-7 (the limiter is injected):** `createApp(db, { rateLimiter })` uses the given limiter. `createApp(db)` builds its own and the seed suites keep passing untouched.
- [ ] **AC-t2-8 (the key comes from the socket):** The middleware calls `take(req.ip ?? 'unknown')`. `grep -n "x-forwarded-for\|X-Forwarded-For\|trust proxy" src/app.js` returns nothing. The key is never read from a header.
- [ ] **AC-t2-9 (no regression):** A malformed JSON body still yields `400 { error: 'bad request' }`, an unknown code still `404`. `tests/integration/shorten.test.js` and `tests/unit/shorten.test.js` pass **unmodified**.
- [ ] **AC-t2-10 (route stays thin):** `src/app.js` holds no bucket, no `Map`, no `Date.now()` and no refill arithmetic. It converts milliseconds to seconds and nothing more.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — RED: in `tests/integration/rate-limit.test.js`, build `createApp(openDb(':memory:'), { rateLimiter: createRateLimiter({ max: 1, windowMs: 60000, now: () => clock }) })` and assert AC-t2-2. It fails because `createApp` ignores its second argument.
- [ ] Step 2 — In `src/app.js`, import `createRateLimiter` from `./rate-limit.js` and widen the signature to `createApp(db, { rateLimiter = createRateLimiter() } = {})`. Every existing caller — `createApp(db)` — must keep working; T3 makes that default read the environment.
- [ ] Step 3 — Write the `limit` middleware exactly as in **Data delta**. Read `req.ip` once. Pass `req.ip ?? 'unknown'`.
- [ ] Step 4 — Mount it as route-level middleware on `POST /api/shorten` only: `app.post('/api/shorten', limit, handler)`. Do **not** `app.use` it. Do **not** mount it above `express.json()` — see **Edge cases**.
- [ ] Step 5 — On refusal, set the header before the body, with `String(seconds)`. Return; do not call `next()`.
- [ ] Step 6 — Grow the suite through AC-t2-3 → AC-t2-4 → AC-t2-5 → AC-t2-6 → AC-t2-1, each red before green.
- [ ] Step 7 — Verify AC-t2-5 by hand once, against a real server rather than supertest. Drain the bucket with `for i in $(seq 1 61); do curl -s -o /dev/null -X POST localhost:3000/api/shorten -H 'content-type: application/json' -d '{"url":"https://example.com"}'; done`, then `curl -i localhost:3000/healthz` and `curl -i localhost:3000/<a known code>`. Both must answer. A rate-limited redirect is a broken link, and that is the finding worth seeing with your own eyes.
- [ ] Step 8 — Run `npm run test:fast`. The seed suites must pass without a single edit, and the process must exit.

## Edge cases

| Case | Behaviour |
|---|---|
| `Retry-After: 0` | Express does not validate the header: `res.set('Retry-After', 0)` sends `0`, `0.06` sends `0.06`, `NaN` sends `NaN`, and none of them throw — measured. `0` is a legal `delay-seconds` under RFC 9110 §10.2.3 and means *retry immediately*, so an obedient client turns a refusal into a busy-wait. `Math.ceil` over T1's strictly positive `retryAfterMs` can never produce it; `Math.round` and `Math.floor` can — at `RATE_LIMIT_MAX=1000` a token accrues every 60 ms and `round(0.06) === 0`. So `Math.max(1, …)` is dead code today and a **tripwire** for the refactor that swaps the rounding. Leave it, and leave this row explaining why. |
| Mounting the limiter above `express.json()` | Would make a malformed body cost a token, and would let a `429` outrank the `400` that describes the client's actual mistake. Do not. |
| A malformed body therefore costs no token | Measured: for `POST /api/shorten` with body `{"url": broken`, `express.json()` throws, the error handler answers `400 { error: 'bad request' }`, and route-level middleware ran **zero** times. This is a real gap in the *limit* and not in the *protection*: no link is created, and the parse is bounded by the 100 kB default body limit. Accepted, recorded in `sad.md` §11. AC-t2-9 pins the `400`, so turning it into a `429` becomes a visible decision rather than a side effect. |
| `req.ip` under supertest | Always `::ffff:127.0.0.1` — from any number of `request(app)` agents, and unchanged by an `X-Forwarded-For` header, because `trust proxy` is false and Express is right to ignore it. Measured. **The integration suite is one client**, which is why AC-03 lives in T1's unit tests and why the limiter is injected here rather than worked around. |
| `app.set('trust proxy', true)` | Not this task's call, and never `true`. Measured: with `trust proxy: true` and `X-Forwarded-For: 9.9.9.9, 8.8.8.8`, `req.ip` becomes `9.9.9.9` — the value the client typed. The limiter would then be a formality any script can step around. With `trust proxy: 1` it becomes `8.8.8.8`. Deployment decision; `sad.md` §11. |
| `req.ip` is `undefined` | Possible when the socket is gone before the middleware runs. `undefined` is a perfectly good `Map` key, so every such request would quietly share one bucket. `req.ip ?? 'unknown'` names that bucket instead of pretending it does not exist. |
| The same machine, two buckets | Measured over a real socket: `http://localhost:3100` arrives as `::1`, `http://127.0.0.1:3100` as `::ffff:127.0.0.1`. The key is the string Express hands us, not a normalised address. Harmless here; the same reason `/64` prefix keying is listed as debt. |
| Limiting `GET /:code` | Would make a shared link stop working under load — the exact failure the service exists to prevent. AC-t2-5 exists to make that regression impossible to land quietly. |
| The `501` stubs | Untouched. They create nothing, so they cost nothing. When `qr-codes` or `bulk-and-delete` ship, whoever makes them write decides whether they consume a token, and says so in their own spec. |

## Definition of Done

- [ ] Every checklist step done; AC-t2-1 … AC-t2-10 green.
- [ ] `npm run test:fast` green; `npm run lint` clean.
- [ ] `tests/integration/shorten.test.js` and `tests/unit/shorten.test.js` pass **unmodified**.
- [ ] `Retry-After` is asserted against `/^[1-9][0-9]*$/`, not against `Number(header) >= 0`.
- [ ] A `429` leaves the row count unchanged — asserted through `GET /api/links`, not by reading the source.
- [ ] Step 7's manual check was actually run: with an empty bucket, `/healthz` and a known code both still answer.
- [ ] `src/app.js` reads no header for the key and contains no refill arithmetic.
- [ ] PR linked back to `tasks/T2-middleware.md`.
- [ ] `tracker.md` updated: status `done`.
