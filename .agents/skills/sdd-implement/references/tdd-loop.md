# TDD loop — the per-task cycle (step 6)

Every task runs `SELECT → RED → GREEN → REFACTOR → GATE → COMMIT`. This is the same cycle whether the runner is the sequential agent or a fanned-out `implementer`. The RED step is the load-bearing one — skip its discipline and the whole method collapses into "write code, write a test that happens to pass".

## SELECT

Pick the next task whose `deps` are all `done` (in sequential mode that's the topo order). Read the task body + its `acs` from `spec.md §5` + the relevant `test-plan.md` rows. Know, before writing anything, what observable outcome the test will assert.

## RED — write the failing test first

1. Write the test(s) for this task's `acs` **before any production code**. Put them where the repo keeps tests (here: `tests/unit/` for domain functions, `tests/integration/` for HTTP via supertest; `tests/e2e/` is Playwright and is not part of the per-task loop). **What the test should assert — and what makes it a good test rather than a coupled or tautological one — is [`test-quality.md`](./test-quality.md); read it before writing the RED.**
2. Run the unit command. Capture the output.
3. **Classify the first run** — this is mandatory and must be stated aloud:

   | Class | What it looks like | Action |
   |---|---|---|
   | **GOOD red** | test compiles, runs, fails on an assertion or «not implemented» | proceed to GREEN |
   | **BAD red** | the test itself won't run / import-errors / references a symbol that the test got wrong | the test is broken, not the code — **fix the test**, re-run, re-classify |
   | **false-pass** | green on the very first run, before any production code | the test is too weak (asserts nothing real) — **strengthen it** until it's GOOD red |

4. **Quote the failing line** (the assertion + expected-vs-actual, or the «undefined: X» line) before writing any production code. This is the proof that the test exercises the right thing.

## GREEN — minimal code to pass

Write the **least** code that turns the quoted failing assertion green. No speculative generality, no unrelated edits, nothing outside the task's `files_hint`. Re-run the unit command; confirm the previously-quoted failure is now green and nothing else broke.

## REFACTOR — clean while staying green

Tidy names, extract helpers, remove duplication — re-running the unit command after each change. If a refactor goes red and isn't trivially fixable, **revert it**; the task's job is the GREEN, not the cleanup.

## GATE — the task isn't done until this is clean

Run the gate:

- **unit + integration** — `npm run test:fast` must be green.
- **lint** — `npm run lint` must be clean.
- **e2e** — `npm run test:e2e` drives a browser; it belongs to the repo gate (`npm run gate`), not the per-task loop.

A red unit gate → the task is not done. On a red that survives a normal GREEN retry, **escalate rather than weaken the test**: stronger model → retry → split the task → if the test encodes a wrong AC, **ask a human** → rollback to the last green. A red that survives escalation halts the run with a report; never make a test less strict to pass, never commit a red gate as done.

## COMMIT — task-scoped, traceable

Commit only this task's files, one commit per task, with a message like:

```
<type>(<slug>): <task title>

<one-line what + why>

SDD-Task: T3
SDD-AC: AC-02
SDD-AC: AC-04
```

One `SDD-AC` trailer per AC the task satisfied; the `SDD-Task` trailer ties the commit to `tasks.json`. Then mark the task `done` in `tracker.md`.

**Compile-coupled lane exception.** Tasks in one compile-coupled lane (a shared-contract change + its implementer(s), marked by the shared file in `files_hint`) cannot each be committed green alone — the contract change breaks every implementer at once. They run **one shared GATE and one commit**: the commit carries an `SDD-Task` trailer **per task** and all of their `SDD-AC` trailers together, and the body names the coupling (e.g. «compile-coupled: T3 interface change + T4 implementation»). This is a sanctioned exception to task-scoped commits, not a license to batch unrelated tasks.

If tasks were fanned out to run concurrently, the **lead serializes commits in dependency order** even though the work happened in parallel — the history stays linear and bisectable.
