---
status: Accepted
owner: "genkovich"
reviewers: []
updated_at: "2026-07-10"
feature_size: "M"
ticket: "rate-limiting"
---

# 0001 — A hand-rolled in-memory token bucket, over Redis and over `express-rate-limit`

- **Status:** Accepted
- **Date:** 2026-07-10
- **Deciders:** genkovich (Architect)

## Context
`POST /api/shorten` must stop accepting writes from a client that sends too many. Everything else in the service must keep working, including for that same client.

Three things have to be decided together, because the wrong answer to any one of them makes the other two moot: **where the counter lives**, **how time enters the calculation**, and **what we owe a refused client**. The last one has a specification: `Retry-After` (RFC 9110 §10.2.3) carries `delay-seconds`, a non-negative integer. The other two are ours.

This project has one relevant standing rule, from `docs/architecture-map.md`: *no new runtime dependency unless the feature's ADR explicitly accepts it*. `qr-codes` will have to negotiate that rule. This feature should not need to.

## Decision drivers
- The limiter guards a write path on a single-process toy. Whatever guards it must cost less than what it guards.
- A rule about time must be testable without waiting. A suite that sleeps for a second per assertion is a suite people stop running.
- State that grows per client and never shrinks is a memory leak. Slow, silent, and diagnosed six months later.
- No timer may keep the process alive. `npm run test:fast` must exit.
- Failing to limit is a nuisance. Failing to *redirect* is a broken link. The limiter must be unable to touch the read path.

## Considered options
1. **Hand-rolled token bucket in the process heap.** A `Map` of address → `{ tokens, lastRefillMs }`, a lazily injected clock, a lazy sweep.
2. **Redis.** A counter or a bucket in a shared store, with `EXPIRE` doing the eviction.
3. **`express-rate-limit`.** The obvious npm package. Roughly what option 1 does, written by other people.

## Decision outcome
**Chosen:** Option 1.

**Option 2, Redis,** is the only option that actually solves the interesting problem — one limit shared by many processes. It is also the only one that requires a second process, a connection, a failure mode ("what does the service do when Redis is down: fail open and be unlimited, or fail closed and be offline?"), and a deployment story for a project whose entire datastore is a file. The problem it solves does not exist here: exactly one process serves this route. Buying infrastructure to fix a problem you do not have is how a toy acquires an operations team. Reopened the day a second worker appears — see `sad.md` §11, where that trigger is written down rather than remembered.

**Option 3, `express-rate-limit`,** deserves more than a shrug, because it is what a reviewer will ask for. It is a dependency for about forty lines of arithmetic, and the forty lines are not the hard part of this feature. The hard part is the four decisions in `spec.md` §6 — a fractional refill, a `Retry-After` that is a positive integer, a key taken from the socket, and a bucket that gets deleted. A library gives us the arithmetic and *not one of those four*. Worse: its default store is an in-memory `Map` in the process, which is precisely option 1's single real weakness. So it does not fix the sharding problem; it inherits it, and hides it behind an import, where the next person will assume it was solved. A dependency that conceals the limitation it shares is worse than no dependency, because it removes the reason to write the limitation down.

Against that: the arithmetic is a bucket refilled by elapsed time, and a clock we can pass in. Two of the measurements below took ten minutes each, and neither would have been possible through a library's API.

Four facts, measured against this codebase, shape what "option 1" actually means:

- **The refill must be fractional, not whole tokens.** The tempting simplification — add `floor(elapsed / msPerToken)` tokens and set `lastRefillMs = now` — throws away the leftover milliseconds on every call. A client polling every 999 ms therefore resets the clock before a whole token accrues, and is granted **0** requests over the next 60 s. Forever. The fractional refill grants it 59 over the same interval. Polling at exactly 1000 ms hides the bug completely: 60 requests, both ways. The bug is invisible to any test whose poll interval divides the token period.
- **`Retry-After: 0` cannot arise from `Math.ceil`, and that is not a reason to drop the floor.** A refused client holds fewer than one token, so the deficit is positive, so the delay is positive, so its ceiling is at least `1` — checked across `max` ∈ {1, 5, 60, 250, 1000, 5000} and five clock offsets; the smallest header emitted was `1`, and no client that obeyed the header was refused twice in a row. `Math.round` and `Math.floor` do produce `0`: at `RATE_LIMIT_MAX=1000` a token accrues every 60 ms, and `round(0.06) === 0`. And Express forwards whatever it is given — `res.set('Retry-After', 0)` sends `0`, `0.06` sends `0.06`, `NaN` sends `NaN`, none of them throwing. `0` is a legal `delay-seconds` meaning *retry immediately*, so a refused client would loop as fast as it can. The `Math.max(1, …)` is therefore a tripwire on a future refactor, and it is documented as one rather than pretended to be load-bearing.
- **A bucket idle for `windowMs` is provably full, so deleting it is free.** From empty, `windowMs` of refill adds exactly `max` tokens — exact equality for `max` ∈ {1, 3, 7, 60, 97, 1000, 60000}. A full bucket is indistinguishable from an absent one, since an absent one is created full. So the sweep predicate is idleness alone, and it cannot grant a client tokens it had not already earned. Without the sweep, each address costs ~285 bytes and never leaves: 10⁶ addresses is 272 MiB of buckets that all say "this client has full permission".
- **The sweep must not be a `setInterval`.** Measured: `setInterval(fn, 1000)` keeps Node alive indefinitely — a probe process had to be killed with `SIGTERM`; the same call with `.unref()` exits at once. A timer inside `createRateLimiter` would hang `npm run test:fast` on every suite that builds an app, and `.unref()` would trade that for a sweep that fires whenever the event loop feels like it. A lazy pass on write, amortised to once per `windowMs`, needs no timer and no `.unref()`: a limiter with no traffic has nothing to sweep. It costs 15.6 ms per 100 000 entries, once a minute at the defaults.

## Consequences
**Positive**
- Zero new dependencies. `docs/architecture-map.md` → Dependencies is upheld, not negotiated.
- The clock is a constructor parameter, so AC-04 (the bucket refills) is a microsecond-scale unit test rather than a `sleep`.
- No timer, so nothing holds the process open and nothing fires between tests.
- The bucket is unreachable from `GET /:code`: the middleware is mounted on one route, so the read path cannot be refused by construction rather than by care.
- The `Map` is the whole design, so the sweep, the key, and the refill are all visible in one file and can each be argued with.

**Negative**
- **The limit is per process.** Two workers give a client `2 × max`. This is the one thing Redis would have fixed, and we did not fix it. `sad.md` §11 records the exact condition under which this stops being a trade and becomes a defect.
- **A restart is a reset.** Any deploy grants every client a full bucket.
- **The key is `req.ip`, and `req.ip` is a deployment property.** Behind a proxy without `trust proxy`, everyone shares one bucket. With `trust proxy: true`, the client picks its own key by sending `X-Forwarded-For` — measured: `9.9.9.9, 8.8.8.8` with `trust proxy: true` yields `req.ip === '9.9.9.9'`; with `trust proxy: 1` it yields `8.8.8.8`. The feature ships with the setting untouched and the hazard written down.
- We own forty lines of arithmetic, including the fractional refill, forever.

**Neutral**
- Integration tests cannot exercise per-client isolation. Under supertest every request arrives from `::ffff:127.0.0.1` — measured, including with a spoofed `X-Forwarded-For`, which `trust proxy: false` correctly ignores. So AC-03 is proven at the unit level against `take(key)` directly, and the limiter is *injected* into `createApp` so the HTTP tests can shrink the budget instead of faking an address. The injection is not a testing convenience bolted on afterwards; it is the only seam that exists.
- `req.ip` is a string, not a normalised address. Over a real socket, `http://localhost:3100` arrives as `::1` and `http://127.0.0.1:3100` as `::ffff:127.0.0.1` — measured — so the same machine can hold two buckets. Harmless here; it is the same reason `/64` prefix keying is listed as debt.

## Links
- Spec: [spec.md](../spec.md) §5 (AC-02, AC-03, AC-04), §6, §6.1.
- SAD: [sad.md](../sad.md) §4, §10 (QG-3, QG-4, QG-6), §11.
- Test plan: [test-plan.md](../test-plan.md) — where each measured fact becomes a named test.
- Related: [0001-reject-at-edge-allowlist-schemes.md](../../input-validation/adr/0001-reject-at-edge-allowlist-schemes.md) — the same instinct to refuse loudly at the edge, applied to schemes rather than to request rate.
- Related: [0002-sqlite-better-sqlite3.md](../../../adr/0002-sqlite-better-sqlite3.md) — why the datastore is a file, which is why a second one for counters is not free.
