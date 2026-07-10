---
id: T5
title: "Tests: unit with fake timers + integration with an injected limiter"
feature: rate-limiting
project: url-shortener
layer: tests
deps: ["T3"]
acs: ["AC-01", "AC-02", "AC-03", "AC-04", "AC-05", "AC-06", "AC-07"]
files_hint: ["tests/unit/rate-limit.test.js", "tests/integration/rate-limit.test.js"]
wave: 3
priority: Must
estimate: M
blocks: []
owner: "TBD"
status: todo
context_budget: "~3000 tokens"
created: 2026-07-10
spec_refs: ["§5 AC-01", "§5 AC-07", "§6 Non-functional requirements"]
sad_refs: ["§10 Quality requirements"]
openapi_paths: []
adr_refs: ["ADR-0001"]
---

# T5 · Coverage sweep for AC-01 … AC-07

**Feature:** [rate-limiting](./_epic.md)
**Priority:** Must
**Estimate:** M
**Wave:** 3 (ui + tests)

## Position in the sequence

- **Blocked by:** T3 — the integration cases need the injected limiter and the env parser.
- **Blocks:** — nothing. It ships in parallel with T4.
- **Why this wave:** T1–T3 wrote most of these tests under TDD. This is the audit. Every spec AC gets a named case, and the four ways this feature can be quietly wrong — a refill that discards milliseconds, a header that says `0`, a sweep that hands out tokens, a limiter mounted on a read path — get tests that go red when they break.

## Why (user story)

As a **maintainer**, I want the fractional refill, the positive-integer header, the unswept read paths and the bounded memory pinned by tests, so that the four silent failures of this feature become four loud ones.

Spec §5 (AC-01 … AC-07), [test-plan.md](../test-plan.md) → AC coverage.

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#10-quality-requirements) — QG-1 reads never refused, QG-2 a refusal writes nothing, QG-3 back-off is correct, QG-4 bounded state, QG-6 no timer
- 🗄  Data delta:   none — the integration suite opens `createApp(openDb(':memory:'), { rateLimiter })`; the unit suite constructs a limiter from three literals
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — the integration cases assert `201`, `429`, `{ error: 'rate limited' }` and the header shape
- 📜 Relevant ADR: [ADR-0001](../adr/0001-in-memory-token-bucket.md) — every measured fact below has its reasoning there
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01 … AC-07
- 🧬 Parity ref:   [test-plan.md](../test-plan.md) — the AC-coverage table and the test-data list are the source of every literal below

## Data delta

```
NO SCHEMA CHANGE. Each suite builds its own subject:

  unit:        createRateLimiter({ max: 2, windowMs: 1000, now: () => clock })
               -- one token per 500ms; a 250ms or 750ms step does NOT divide the token period

  integration: createApp(openDb(':memory:'), {
                 rateLimiter: createRateLimiter({ max: 1, windowMs: 60000, now: () => clock })
               })
               -- max: 1, so the SECOND create in any test is the refused one

The clock is `let clock = 0` and `clock += ms`. It is not vi.useFakeTimers().
```

## API contract

_API surface: none._ The integration suite drives `POST /api/shorten`, `GET /:code`, `GET /api/links`, `GET /api/stats/:code` and `/healthz` through supertest.

## Acceptance criteria (GWT)

- [ ] **AC-t5-1 (coverage — all):** Each of AC-01 … AC-07 has at least one test whose name names it, matching the table in [test-plan.md](../test-plan.md).
- [ ] **AC-t5-2 (the header shape — AC-02):** `Retry-After` is asserted against `/^[1-9][0-9]*$/`. Not `Number(h) >= 0`, which `'0'`, `'0.06'` and `'NaN'` all satisfy — and Express sends every one of them without complaint.
- [ ] **AC-t5-3 (fractional refill — AC-04):** With one token per 500 ms, advancing the clock by 250 ms twice — in two separate `take` calls — yields a token. A whole-token refill that resets the clock yields none. Do **not** use a step that divides the token period; at a 500 ms step both implementations pass.
- [ ] **AC-t5-4 (the obedient client — AC-04, QG-3):** For `max` ∈ {1, 5, 60, 1000}: refuse, read `retryAfterMs`, advance by `Math.ceil(retryAfterMs / 1000) * 1000`, and assert the retry succeeds. The guarantee must not depend on capacity.
- [ ] **AC-t5-5 (per-key isolation — AC-03):** `take('1.1.1.1')` exhausted; `take('2.2.2.2')` allowed. **Unit only.** Under supertest every request arrives from `::ffff:127.0.0.1`, so this cannot be written at the HTTP level — see **Edge cases**.
- [ ] **AC-t5-6 (a refusal writes nothing — AC-02, QG-2):** After the `429`, `GET /api/links` returns exactly the rows that existed before. Assert the count, not the status.
- [ ] **AC-t5-7 (reads never refused — AC-05, QG-1):** With the bucket empty, `GET /<code>` → `302` and the click is counted, `GET /api/links` → `200`, `GET /api/stats/<code>` → `200`, `GET /healthz` → `200`. Four assertions; a limiter mounted with `app.use` passes none of them.
- [ ] **AC-t5-8 (the sweep frees, and grants nothing — QG-4):** Advance past `windowMs`, run one `take`, assert `size()` dropped. Then: exhaust a key, advance to just **under** `windowMs`, and assert the next `take` is still refused. The second half is the one that catches an eviction that fires early and hands out a full bucket.
- [ ] **AC-t5-9 (a refusal costs nothing):** Ten refusals in a row at one instant all report the same `retryAfterMs`. A limiter that decrements on refusal locks out any client that retries faster than it refills.
- [ ] **AC-t5-10 (env parsing — AC-06):** `''`, `'abc'`, `'0'`, `'-5'`, `'60abc'` and `'1.5'` each fall back; `'1e3'` yields `1000`; `'5'` yields `5`. `readRateLimitEnv` is called with a literal object, never with a mutated `process.env`.
- [ ] **AC-t5-11 (no regression — AC-01, QG-5):** `tests/unit/shorten.test.js` and `tests/integration/shorten.test.js` pass **unmodified**, and a malformed body still returns `400 { error: 'bad request' }` rather than `429`.
- [ ] **AC-t5-12 (the suite exits — QG-6):** `npm run test:fast` returns. A `setInterval` anywhere in the limiter turns this into a hang, not a failure, so it is worth naming as an acceptance criterion rather than assuming it.
- [ ] **AC-t5-13 (AC-07's server half):** The `429` response carries a `Retry-After` the browser can parse into a positive integer. The rendered sentence is verified by hand in T4; `test-plan.md` → *Not tested, and why* records the reason and the one-line change that would automate it.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — Read the test-data list in [test-plan.md](../test-plan.md). Every literal is there: the two limiter shapes, the keys `'1.1.1.1'` / `'2.2.2.2'`, the header pattern, the env table, and the four read paths.
- [ ] Step 2 — `tests/unit/rate-limit.test.js`: capacity, per-key isolation, fractional refill, the obedient client across four capacities, `retryAfterMs > 0`, a refusal costing nothing, the ceiling at `max`, both halves of the sweep, and `readRateLimitEnv` over the env table.
- [ ] Step 3 — `tests/integration/rate-limit.test.js`: `201` under the limit with no `Retry-After` header; `429` with `{ error: 'rate limited' }` and the header shape; the row count after the `429`; all four read paths with an empty bucket; the three `501` stubs with an empty bucket; a malformed body still `400`.
- [ ] Step 4 — Add AC-t5-6 explicitly: read `GET /api/links` before and after the refusal and compare lengths. A `429` says nothing about what was written.
- [ ] Step 5 — Add AC-t5-7 as four separate assertions, not one loop. When a limiter creeps onto a read path, the test name should say which path.
- [ ] Step 6 — Mutation check. Run each of these, confirm the named test goes red, then revert. A suite that survives any of them is not testing what its names claim.
  1. Replace the fractional refill with `Math.floor(elapsed / (windowMs / max))` → **AC-t5-3** red.
  2. Replace `Math.ceil` with `Math.round` in `src/app.js` and set `RATE_LIMIT_MAX=1000` → **AC-t5-2** red (the header becomes `0`).
  3. Change the sweep predicate from `>= windowMs` to `>= windowMs / 2` → **AC-t5-8** red (an exhausted client is granted a full bucket early).
  4. Change `app.post('/api/shorten', limit, handler)` to `app.use(limit)` → **AC-t5-7** red on all four paths.
- [ ] Step 7 — Run `npm run test:fast`, and check that it **exits**. Then `npm run gate`.

## Edge cases

| Case | Behaviour |
|---|---|
| Trying to test per-IP isolation over supertest | Impossible, and worth knowing why before an hour is spent on it. Measured against `createApp(openDb(':memory:'))` with a probe route: `req.ip` is `::ffff:127.0.0.1` for every request, from any number of independent `request(app)` agents. Adding `X-Forwarded-For: 203.0.113.9` changes nothing, because `trust proxy` is false and Express correctly ignores the header. Setting `trust proxy` to make the test work would ship a limiter any client can step around. AC-03 belongs to the unit suite, over `take(key)`; the injected limiter is what the HTTP suite gets instead. |
| `vi.useFakeTimers()` | Do not. It fakes `Date` globally, and `createLink` stamps `created_at` with `Date.now()`. Measured: with the clock frozen, five links share one `created_at` and `listLinks`' `ORDER BY created_at DESC` stops being a total order — SQLite returned insertion order in that run, which is not a promise it makes. The injected `now` reaches the limiter and nothing else. The task title says *fake timers*; it means a fake clock, and the clock is a parameter. |
| A 500 ms step against a 500 ms token | Passes for both the correct and the broken refill. Simulated at `max=60, windowMs=60000`: a client polling every 1000 ms gets 60 requests either way, while at 999 ms the broken one gives it **0** — forever — and the correct one gives it 59. Any test step that divides `windowMs / max` proves nothing about the refill. Use 250 ms or 750 ms. |
| `expect(Number(header)).toBeGreaterThanOrEqual(0)` | Passes for `'0'`, for `'0.06'`, and — since `NaN >= 0` is `false` — fails loudly only for `NaN`. Two of the three bad values slip through. Match the string against `/^[1-9][0-9]*$/`, which is the `delay-seconds` grammar (RFC 9110 §10.2.3) plus the one thing the grammar allows and we do not. |
| Asserting the `429` and stopping there | A status code says nothing about what was written. AC-t5-6 counts rows, because the one thing a refused create must never do is create. |
| Testing the sweep by waiting | There is nothing to wait for: the pass runs on `take`, not on a timer. Advance the clock, call `take` once, read `size()`. If a test ever needs `await`, a timer has appeared and QG-6 is broken. |
| A `429` where a `400` belongs | Measured: a malformed JSON body never reaches route-level middleware, because `express.json()` throws first and the error handler answers `400`. AC-t5-11 pins that `400`. The day someone mounts the limiter with `app.use` above the parser, this test is the one that explains what changed. |
| `size()` existing only for tests | Yes, and it earns it. QG-4 is a claim about memory, and the only alternative way to check it is to measure the heap — which is how the ~285 bytes per bucket in `test-plan.md` was obtained, and which is far too slow and too noisy for a suite. |

## Definition of Done

- [ ] Every checklist step done; AC-t5-1 … AC-t5-13 green.
- [ ] `npm run test:fast` green **and it exits**; `npm run lint` clean; `npm run gate` green.
- [ ] `tests/unit/shorten.test.js` and `tests/integration/shorten.test.js` pass unmodified.
- [ ] Every AC in [test-plan.md](../test-plan.md)'s coverage table maps to a named test.
- [ ] All four of Step 6's mutations were actually run, and each turned the named test red.
- [ ] No test calls `vi.useFakeTimers()`, mutates `process.env`, or sleeps.
- [ ] `Retry-After` is asserted as a string against `/^[1-9][0-9]*$/`.
- [ ] PR linked back to `tasks/T5-tests.md`.
- [ ] `tracker.md` updated: status `done`.
