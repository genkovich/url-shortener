---
id: T1
title: "Domain: pure token-bucket limiter with an injected clock"
feature: rate-limiting
project: url-shortener
layer: domain
deps: []
acs: ["AC-03", "AC-04"]
files_hint: ["src/rate-limit.js"]
wave: 1
priority: Must
estimate: M
blocks: [T2]
owner: "TBD"
status: todo
context_budget: "~2500 tokens"
created: 2026-07-10
spec_refs: ["§5 AC-03", "§5 AC-04", "§6 Non-functional requirements"]
sad_refs: ["§4 Solution strategy", "§5 Building block view", "§10 QG-3", "§10 QG-4", "§10 QG-6"]
openapi_paths: []
adr_refs: ["ADR-0001"]
---

# T1 · The token bucket

**Feature:** [rate-limiting](./_epic.md)
**Priority:** Must
**Estimate:** M
**Wave:** 1 (domain)

## Position in the sequence

- **Blocked by:** — nothing. First task, one new file, no database, no HTTP.
- **Blocks:** T2 — the middleware turns `retryAfterMs` into a header and relies on it being strictly positive.
- **Why this wave:** everything downstream assumes two guarantees that only exist here: a refused request always reports a delay above zero, and the memory holding the buckets does not grow forever. Both are arithmetic, and both are cheaper to get right before HTTP is in the picture.

## Why (user story)

As a **client**, I want my budget to refill as time passes rather than snapping back on a boundary, and I want my neighbour's exhausted budget to be none of my business.

Spec US-01, US-02. AC-03 (buckets are keyed per client), AC-04 (the bucket refills continuously).

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#6-runtime-view) — `take(req.ip)` and the two branches that follow it
- 🗄  Data delta:   none — the bucket lives in the heap; SQLite is not involved and must not become involved
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — `Retry-After` is `integer, minimum: 1`; this task guarantees the *positive* part, T2 does the *integer* part
- 📜 Relevant ADR: [ADR-0001](../adr/0001-in-memory-token-bucket.md) — why the bucket is hand-rolled, why the clock is a parameter, why the sweep is not a timer
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-03, AC-04
- 🧬 Parity ref:   `generateCode` in `src/shorten.js` — the project's other pure, dependency-free unit. This file is the same: no `express`, no `better-sqlite3`, no `process`

## Data delta

```
NO DB CHANGES IN THIS TASK — the state is a Map in the heap and nothing else.

New file src/rate-limit.js:

  export const DEFAULT_MAX        = 60      -- spec §6; also the largest burst from cold
  export const DEFAULT_WINDOW_MS  = 60000   -- time to refill from empty to full

  export function createRateLimiter({ max = DEFAULT_MAX,
                                      windowMs = DEFAULT_WINDOW_MS,
                                      now = Date.now } = {})

Internal state:
  buckets     : Map<string, { tokens: number, lastRefillMs: number }>
  lastSweepMs : number      -- amortises the O(n) pass; NOT a timer

Returned surface:
  take(key) -> { allowed: true }
             | { allowed: false, retryAfterMs }     -- retryAfterMs is STRICTLY > 0
  size()    -> number        -- buckets currently resident; exists so QG-4 is testable

take(key), in order:
  1. t = now()
  2. if (t - lastSweepMs >= windowMs) sweep(t)            -- at most one pass per window
  3. bucket = buckets.get(key) ?? { tokens: max, lastRefillMs: t }   -- absent means full
  4. refill: tokens = min(max, tokens + ((t - bucket.lastRefillMs) * max) / windowMs)
             lastRefillMs = t
  5. if (tokens < 1) return { allowed: false, retryAfterMs: ((1 - tokens) * windowMs) / max }
  6. tokens -= 1 ; return { allowed: true }
     (store the bucket back in both cases — a refusal still records the refill)

sweep(t):
  for (const [key, b] of buckets) if (t - b.lastRefillMs >= windowMs) buckets.delete(key)
  lastSweepMs = t
```

## API contract

_API surface: none — internal task._ `take` returns milliseconds; seconds, ceilings and headers are HTTP's business and belong to T2.

```
{ allowed: false, retryAfterMs }   with retryAfterMs > 0, always, by construction:
                                   the bucket was refused, so tokens < 1,
                                   so (1 - tokens) > 0.

T2 relies on exactly that. It is the reason Math.ceil there can never emit 0.
```

## Acceptance criteria (GWT)

- [ ] **AC-t1-1 (capacity):** Given a fresh limiter with `max = 2`, when `take('a')` is called three times at the same instant, then the first two are allowed and the third is refused.
- [ ] **AC-t1-2 (per-key isolation — AC-03):** Given `'a'` is exhausted, when `take('b')` is called, then it is allowed. An absent bucket is created full.
- [ ] **AC-t1-3 (fractional refill — AC-04):** Given `max = 2, windowMs = 1000` (one token per 500 ms) and an exhausted bucket, when the clock advances 500 ms, then exactly one `take` succeeds and the next is refused. Advance 250 ms twice, in two separate `take` calls, and the token still arrives — the leftover milliseconds must survive a call.
- [ ] **AC-t1-4 (an obedient client is served — AC-04, QG-3):** Given a refusal reporting `retryAfterMs`, when the clock advances by `Math.ceil(retryAfterMs / 1000) * 1000`, then the next `take` on that key is allowed. Assert for `max` ∈ {1, 5, 60, 1000} — the guarantee must not depend on the capacity.
- [ ] **AC-t1-5 (`retryAfterMs` is strictly positive):** Every refusal returns `retryAfterMs > 0`. Not `>= 0`. T2's header invariant is a corollary of this one and of nothing else.
- [ ] **AC-t1-6 (a refusal costs nothing):** Given an exhausted bucket, when `take` is called ten more times at the same instant, then the tenth refusal reports the same `retryAfterMs` as the first. Hammering must not push recovery further away.
- [ ] **AC-t1-7 (the ceiling holds):** Given a bucket idle for `10 × windowMs`, when `take` runs, then at most `max` requests are served before the next refusal. Tokens accrue to `max` and stop.
- [ ] **AC-t1-8 (the sweep frees — QG-4):** Given buckets for `'a'` and `'b'`, when the clock advances past `windowMs` and one further `take('c')` runs, then `size()` counts only `'c'`. The pass runs on write; nothing runs on its own.
- [ ] **AC-t1-9 (the sweep grants nothing):** Given `'a'` is exhausted, when the clock advances to just **under** `windowMs` and `take('a')` runs, then it is still refused. An eviction that fired early would hand `'a'` a full bucket.
- [ ] **AC-t1-10 (purity — QG-6):** `src/rate-limit.js` contains no `setInterval`, no `setTimeout`, no `process`, and imports nothing. `grep -nE "setInterval|setTimeout|process\.|^import" src/rate-limit.js` returns nothing.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — RED: create `tests/unit/rate-limit.test.js` and assert AC-t1-1 with `createRateLimiter({ max: 2, windowMs: 1000, now: () => clock })`. It fails because the module does not exist.
- [ ] Step 2 — Create `src/rate-limit.js`. Export `DEFAULT_MAX` and `DEFAULT_WINDOW_MS`; T3 will reuse them as the env fallbacks, so the two literals live here and nowhere else.
- [ ] Step 3 — Write `createRateLimiter` with the six ordered operations in **Data delta**. Take `now` as a **function**, default `Date.now`. Never call `Date.now()` inside `take`.
- [ ] Step 4 — Refill fractionally: `tokens + ((t - lastRefillMs) * max) / windowMs`, clamped by `Math.min(..., max)`. Do **not** floor. Do **not** advance `lastRefillMs` by anything other than to `t`.
- [ ] Step 5 — Compute `retryAfterMs` as `((1 - tokens) * windowMs) / max` on the refusal branch, after the refill. It is positive because `tokens < 1` is what put you on this branch.
- [ ] Step 6 — Add the lazy sweep and `lastSweepMs`. Guard it with `t - lastSweepMs >= windowMs` so the O(n) pass is amortised. Confirm no timer exists anywhere in the file.
- [ ] Step 7 — Grow the suite through AC-t1-2 → AC-t1-3 → AC-t1-5 → AC-t1-6 → AC-t1-4 → AC-t1-7 → AC-t1-9 → AC-t1-8, each red before green.
- [ ] Step 8 — Mutation check: replace the fractional refill with `Math.floor((t - lastRefillMs) / (windowMs / max))` and confirm AC-t1-3 goes red. Revert. A suite that survives this is testing nothing.
- [ ] Step 9 — Do **not** touch `src/app.js`, `src/shorten.js` or `package.json`. The middleware is T2; the domain module is not involved at all.

## Edge cases

| Case | Behaviour |
|---|---|
| Whole-token refill with a clock reset | The single most likely bug in this file. `tokens += floor(elapsed / msPerToken); lastRefillMs = now` discards the remainder every call. Simulated at `max=60, windowMs=60000`: a client polling every **999 ms** receives **0** tokens over the next 60 s, and would receive 0 forever; the fractional refill gives it 59. At a **1000 ms** poll both spellings give 60, so the bug is invisible to any test whose interval divides the token period. AC-t1-3 uses 250 ms against a 500 ms token for exactly this reason. |
| A refusal consuming a token | Would turn a retry storm into a permanent lockout: every attempt pushes recovery one token further away, and a client that retries faster than it refills never returns. Refuse *before* the decrement, never after. AC-t1-6 pins it. |
| An absent bucket | Created **full**. This is what makes the sweep safe and it is the same statement read from the other side: deleting a full bucket is a no-op, so only full buckets may be deleted. |
| Evicting a bucket that is not full | Grants its owner a fresh `max` tokens. The predicate is idleness, `t - lastRefillMs >= windowMs`, and that alone: from empty, `windowMs` of refill adds *exactly* `max` tokens — exact equality checked for `max` ∈ {1, 3, 7, 60, 97, 1000, 60000}. So "idle" already implies "full"; asserting fullness as well costs a compare and guards a clock that jumped backwards. AC-t1-9 tests the boundary from the unsafe side. |
| `setInterval` for the sweep | Measured: `node -e "setInterval(() => {}, 1000)"` never exits and has to be killed; the same handle with `.unref()` exits at once. A timer here would hang `npm run test:fast` in every suite that constructs an app. `.unref()` would only trade the hang for a sweep that fires whenever the event loop is idle — non-deterministic in exactly the tests that care. The pass runs on write; a limiter with no traffic has nothing to sweep. |
| The sweep on every call | 15.6 ms for a pass over 100 000 buckets, measured. Paid per request that would be an obvious regression; paid once per `windowMs` it is 15.6 ms a minute. Hence `lastSweepMs`. |
| No sweep at all | ~285 bytes per bucket, measured over 100 000 unique keys with `--expose-gc`. 10⁶ idle addresses is ~272 MiB held to record that a million clients have full permission — which is precisely what an absent bucket already says. |
| `now` called twice inside one `take` | Two different instants inside one decision. Read the clock **once**, into `t`, at the top. Everything downstream — sweep, refill, `retryAfterMs` — uses that one value. |
| `key` is not a string | `take(undefined)` would work, because `Map` keys are any value, and it would silently merge every such caller into one bucket. T2 passes `req.ip ?? 'unknown'` so this never arrives; this file does not defend against it, and that division of labour is the point of the boundary. |
| `vi.useFakeTimers()` instead of the `now` parameter | Would fake `Date` globally, including for `createLink`, which stamps `created_at` with `Date.now()`. Measured: with the clock frozen, five links share one `created_at` and `listLinks`' `ORDER BY created_at DESC` stops being a total order. The injected clock reaches this limiter and nothing else. |

## Definition of Done

- [ ] Every checklist step done; AC-t1-1 … AC-t1-10 green.
- [ ] `npm run test:fast` green and **it exits** — a hanging suite is this task's characteristic failure.
- [ ] `npm run lint` clean.
- [ ] The refill is fractional, and Step 8's mutation was actually run and turned AC-t1-3 red.
- [ ] `retryAfterMs > 0` on every refusal — asserted, not reasoned about.
- [ ] `size()` returns to a bounded number after the clock passes a window — asserted on the count, not on a timer firing.
- [ ] `src/rate-limit.js` imports nothing and reads no `process.env`; `src/shorten.js`, `src/app.js` and `package.json` are untouched.
- [ ] PR linked back to `tasks/T1-token-bucket.md`.
- [ ] `tracker.md` updated: status `done`.
