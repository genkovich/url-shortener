---
id: T3
title: "App: env configuration and wiring"
feature: rate-limiting
project: url-shortener
layer: app
deps: ["T2"]
acs: ["AC-01", "AC-06"]
files_hint: ["src/server.js", "src/app.js", ".env.example"]
wave: 2
priority: Must
estimate: S
blocks: [T4, T5]
owner: "TBD"
status: todo
context_budget: "~2000 tokens"
created: 2026-07-10
spec_refs: ["§5 AC-01", "§5 AC-06", "§6 Non-functional requirements"]
sad_refs: ["§8 Crosscutting concepts", "§11 Risks and technical debt"]
openapi_paths: []
adr_refs: ["ADR-0001"]
---

# T3 · Configuration from the environment, and the boot line

**Feature:** [rate-limiting](./_epic.md)
**Priority:** Must
**Estimate:** S
**Wave:** 2 (app)

## Position in the sequence

- **Blocked by:** T2 — a limiter must be injectable before there is a point in configuring one.
- **Blocks:** T4 (the frontend needs a limit it can actually trip) and T5 (the suites test the parser).
- **Why this wave:** the last app-layer change. It moves two numbers out of the source and gives the operator a way to see which numbers won.

## Why (user story)

As an **operator**, I want to set the capacity and the window without editing source, and I want to see at boot which values are actually in force.

Spec US-01. AC-06 (env with defaults `60` / `60000`), AC-01 (with the defaults, ordinary use is untouched — including the seed suites, which never inject a limiter).

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#8-crosscutting-concepts) — why `process.env` is read in `src/app.js` and never in `src/rate-limit.js`
- 🗄  Data delta:   none
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — unchanged by this task; the capacity is not part of the contract
- 📜 Relevant ADR: [ADR-0001](../adr/0001-in-memory-token-bucket.md) — the limiter is a parameter, so the environment is read exactly once, at the composition root
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01, AC-06
- 🧬 Parity ref:   `openDb(path = process.env.DB_PATH || 'data/links.db')` in `src/db.js` — the repo's existing precedent for a factory whose default comes from the environment

## Data delta

```
NO DB CHANGES IN THIS TASK.

src/app.js — new export, used by createApp's default and by src/server.js:

  export function readRateLimitEnv(env = process.env) {
    const num = (raw, fallback) => {
      const n = Number(raw);                         -- NOT parseInt
      return Number.isInteger(n) && n > 0 ? n : fallback;
    };
    return {
      max:      num(env.RATE_LIMIT_MAX,       DEFAULT_MAX),        -- 60
      windowMs: num(env.RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS),  -- 60000
    };
  }

  createApp(db, { rateLimiter = createRateLimiter(readRateLimitEnv()) } = {})

src/server.js — read once, inject explicitly, print what won:

  const { max, windowMs } = readRateLimitEnv(process.env);
  const app = createApp(db, { rateLimiter: createRateLimiter({ max, windowMs }) });
  app.listen(PORT, () => console.log(
    `url-shortener → http://localhost:${PORT}  (rate limit: ${max} / ${windowMs}ms)`
  ));

.env.example — ALREADY declares both keys at these defaults. Verify; do not duplicate.
```

## API contract

_API surface: none — internal task._ The capacity is deliberately absent from `openapi.yaml`: it is an operational setting, and publishing it would make every redeploy a contract change.

## Acceptance criteria (GWT)

- [ ] **AC-t3-1 (defaults — AC-06):** Given an environment with neither variable, when `readRateLimitEnv({})` runs, then it returns `{ max: 60, windowMs: 60000 }`.
- [ ] **AC-t3-2 (values honoured — AC-06):** Given `{ RATE_LIMIT_MAX: '5', RATE_LIMIT_WINDOW_MS: '1000' }`, then it returns `{ max: 5, windowMs: 1000 }` — numbers, not strings.
- [ ] **AC-t3-3 (garbage falls back — AC-06):** Each of `''`, `'abc'`, `'0'`, `'-5'`, `'60abc'`, `'1.5'` yields the default for its key. `'1e3'` yields `1000`, because `Number('1e3')` is `1000` and it is a positive integer.
- [ ] **AC-t3-4 (independent keys):** A broken `RATE_LIMIT_MAX` must not disturb a valid `RATE_LIMIT_WINDOW_MS`. Each key falls back on its own.
- [ ] **AC-t3-5 (`createApp(db)` still works — AC-01):** With no injected limiter, `createApp(db)` builds one from the environment. `tests/integration/shorten.test.js` and `tests/unit/shorten.test.js` pass **unmodified**.
- [ ] **AC-t3-6 (injection still wins):** `createApp(db, { rateLimiter })` never calls `readRateLimitEnv`. The default is a parameter default; it is not evaluated when an argument is given.
- [ ] **AC-t3-7 (the boot line):** `npm run dev` prints the port and the effective `max / windowMs` on one line, once.
- [ ] **AC-t3-8 (`.env.example` is honest):** It declares `RATE_LIMIT_MAX=60` and `RATE_LIMIT_WINDOW_MS=60000`, matching `DEFAULT_MAX` and `DEFAULT_WINDOW_MS` in `src/rate-limit.js`. If the constants ever move, this file moves with them.
- [ ] **AC-t3-9 (`src/rate-limit.js` stays pure):** It reads no `process.env`. `grep -n "process" src/rate-limit.js` returns nothing.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — RED: in `tests/unit/rate-limit.test.js`, assert AC-t3-3 for `RATE_LIMIT_MAX: '0'`. It fails because `readRateLimitEnv` does not exist.
- [ ] Step 2 — In `src/app.js`, add `readRateLimitEnv(env = process.env)` per **Data delta**, importing `DEFAULT_MAX` and `DEFAULT_WINDOW_MS` from `./rate-limit.js`. Take `env` as an argument so the test never mutates `process.env`.
- [ ] Step 3 — Parse with `Number`, then `Number.isInteger(n) && n > 0`. Do **not** use `parseInt`, and do **not** use `Number(raw) || fallback` — see **Edge cases** for what each of them accepts.
- [ ] Step 4 — Change `createApp`'s default from `createRateLimiter()` to `createRateLimiter(readRateLimitEnv())`.
- [ ] Step 5 — In `src/server.js`, read the pair once, build the limiter, inject it, and print the effective values inside the `listen` callback.
- [ ] Step 6 — Open `.env.example` and confirm both keys are present with `60` and `60000`. They are. Change nothing; this step is a check, not an edit.
- [ ] Step 7 — Grow the suite through AC-t3-1 → AC-t3-2 → AC-t3-4 → AC-t3-6 → AC-t3-5, each red before green.
- [ ] Step 8 — Run `RATE_LIMIT_MAX=2 npm run dev` and read the boot line. Then run `npm run dev` with a `.env` file present and read it again: it says `60`. That is not a bug, and **Edge cases** explains why.

## Edge cases

| Case | Behaviour |
|---|---|
| Nothing in this repo loads `.env` | Measured: no `dotenv` dependency and no `--env-file` flag anywhere in `package.json`, `src/`, `scripts/` or `.github/`. `.env.example` says "copy to `.env` if you need it", and copying it changes nothing. The variables take effect when exported into the environment, or when Node is started with `--env-file=.env` (Node ≥ 20.6; verified working). The boot line from Step 5 is the whole mitigation: an operator who set `RATE_LIMIT_MAX=5` in a file and sees `60` at boot learns the truth in one second. Do **not** fix this by adding `dotenv` — that is a new runtime dependency, which needs its own ADR (`docs/architecture-map.md` → Dependencies). |
| `parseInt` | Wrong parser, twice over. `parseInt('1e3', 10) === 1` — it stops at the `e`. `parseInt('60abc', 10) === 60` — it stops at the `a` and returns a number the operator never wrote. `Number` returns `NaN` for both `'60abc'` and `'abc'`, which is at least an answer you can test for. |
| `Number(raw) \|\| fallback` | Accepts `'-5'` as `-5`, and maps `'0'` to the fallback because `0` is falsy — so an operator who deliberately sets `RATE_LIMIT_MAX=0` to close the endpoint silently gets `60`. Measured across `undefined`, `''`, `'60'`, `' 60 '`, `'60abc'`, `'abc'`, `'0'`, `'-5'`, `'1e3'`. Use the explicit predicate. |
| `RATE_LIMIT_MAX=0` | Falls back to `60`. Zero capacity means every request is refused with an infinite delay — `windowMs / 0` is `Infinity`, and `Math.max(1, Infinity)` is `Infinity`, which Express sends as the header `Retry-After: Infinity`. Measured. Turning the endpoint off is not a rate limit; it is a deployment decision with no route through this parser. |
| `RATE_LIMIT_WINDOW_MS=abc` without the guard | `Number('abc')` is `NaN`, so `retryAfterMs` is `NaN`, so `Math.ceil(NaN)` is `NaN` — and `Math.max(1, NaN)` is **`NaN`**, not `1`. Express then sends `Retry-After: NaN` beside a real `429`. Measured. The `>= 1` floor in T2 does not protect against a bad window; this parser does. That is why AC-t3-3 and T2's AC-t2-3 are separate tests: they fail for different reasons. |
| `' 60 '` | Accepted as `60`. `Number` trims. Fine, and not worth a rule of its own. |
| `1.5` | Falls back. `Number.isInteger(1.5)` is `false`. A fractional token capacity has no meaning; a fractional window would work but nobody wrote it on purpose. |
| Reading `process.env` inside `createRateLimiter` | Would make the limiter untestable without saving and restoring globals, and would put `process` inside the one file that currently imports nothing. `src/app.js` is the composition root — it is already where `db` arrives — so the environment is read there, exactly as `src/db.js` reads `DB_PATH` in its own factory default. |
| `createApp(db)` in the seed suites | Builds a limiter from the environment. So `RATE_LIMIT_MAX=1 npm run test:fast` will break `tests/integration/shorten.test.js`. That is correct behaviour, not a flake: the suite is asserting the default configuration. Never set these variables in CI. |

## Definition of Done

- [ ] Every checklist step done; AC-t3-1 … AC-t3-9 green.
- [ ] `npm run test:fast` green; `npm run lint` clean.
- [ ] `tests/integration/shorten.test.js` and `tests/unit/shorten.test.js` pass **unmodified**.
- [ ] The parser is `Number` + `Number.isInteger(n) && n > 0`. No `parseInt`, no `||` fallback.
- [ ] `readRateLimitEnv` takes `env` as an argument; no test mutates `process.env`.
- [ ] `npm run dev` prints the effective `max / windowMs` once, and Step 8 was actually run with both a set variable and a `.env` file.
- [ ] `src/rate-limit.js` still reads no `process.env`; `package.json` is untouched.
- [ ] PR linked back to `tasks/T3-env-config.md`.
- [ ] `tracker.md` updated: status `done`.
