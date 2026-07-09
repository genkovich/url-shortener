---
name: sdd-implement
model: inherit
effort: medium
agents: [sdd-test-author, sdd-implementer, sdd-reviewer]
description: >
  Implement a feature from its tasks.json with test-driven development — write a failing test
  first, make it pass, refactor, gate, commit per task. Triggers on "implement {slug}",
  "build {slug}", "TDD {slug}", "code up the tasks for {slug}", "/sdd:implement {slug}",
  "імплементуй {slug}", "реалізуй фічу {slug}", "напиши код за задачами". Reads
  docs/features/{slug}/tasks.json + upstream artifacts, builds a dependency DAG, and drives each
  task through a strict TDD cycle against the repo's test gate (`npm run test:fast`) — sequential by
  default, optionally fanning the three subagents over a large DAG. Hard-refuses if tasks.json
  is missing.
---

# Skill: implement

Turns `tasks.json` into committed, tested code through a strict per-task TDD cycle — `SELECT → RED → GREEN → REFACTOR → GATE → COMMIT`. This repo is Node + Express + SQLite; the per-task gate is `npm run test:fast` (Vitest: unit + integration) plus `npm run lint`; the full repo gate `npm run gate` adds Playwright e2e.

This file is the spine; the two files in `references/` carry the depth.

## Owner

Tech Lead drives; the engine runs the cycle. Three subagents ship with this skill: [`sdd-test-author`](../../agents/sdd-test-author.md) (RED), [`sdd-implementer`](../../agents/sdd-implementer.md) (GREEN/REFACTOR/GATE), [`sdd-reviewer`](../../agents/sdd-reviewer.md) (read-only review).

## Agents, models & the worker contract

Model is chosen by the **kind of work** — execution gets a balanced model, independent judgment gets the strongest. The tiers live in each agent's frontmatter:

| Agent | Kind | Dispatch (invoke) | `model` | Effort |
|---|---|---|---|---|
| `sdd-test-author` | execution (write the failing test) | `/sdd-test-author` | `inherit` | medium → high on escalation |
| `sdd-implementer` | execution (green + refactor + gate) | `/sdd-implementer` | `inherit` | medium → high on escalation |
| `sdd-reviewer` | judgment (independent review) | `/sdd-reviewer` | `claude-opus-4-8[effort=high]` | high |

- **Dispatch.** Invoke each subagent by name (`/sdd-<name>` or a natural-language mention); Cursor routes it via the Task tool. Execution agents inherit the session model; the reviewer is pinned to the strongest model for independent judgment, with effort in its model string (`[effort=high]`). On persistent red the orchestrator may re-dispatch an executor at a stronger model. If a named subagent isn't available at runtime, fall back to a general agent with the **same prompt** — a fallback reads nothing from `agents/*.md`, so inline everything it needs.
- **Precedence (highest wins):** env var (`CLAUDE_CODE_SUBAGENT_MODEL` / `CLAUDE_CODE_EFFORT_LEVEL`) > agent frontmatter > session. Print the resolved per-role model+effort in the banner.
- **`.size` scaling:** for **L/XL** features raise execution effort to `high` before dispatch; keep the cheap defaults for **XS/S**.
- **Worker contract (every spawned agent):**
  1. **Isolated context** — the agent sees only its prompt string, not this conversation, and re-reads the upstream artifacts itself. This isolation *is* the point for the reviewer (fresh eyes).
  2. **Worker preamble** — wrap each delegated task: «execute directly, do not spawn sub-agents, use tools directly, report with absolute file paths». A subagent cannot fan out; the lead owns orchestration.
  3. **Verify before claiming done** — run the command that proves it, read the output, then claim with evidence.
  4. **Cite or drop** — `sdd-reviewer` emits only cited findings (`file:line` + AC/artifact clause); an uncited finding is dropped.

## Inputs

- `<slug>` — feature slug.
- **Gate (hard refuse):** `docs/features/<slug>/tasks.json` must exist and parse as JSON. Missing or malformed → «run `tasks <slug>` first». Never reconstruct tasks from the markdown — `tasks.json` is the contract.
- Read for context (agents read these directly, not via paraphrase): `spec.md` §5 (AC), `data-model.md`, `contracts/openapi.yaml`, `test-plan.md`, `sad.md`, Accepted `adr/`, and `docs/architecture-map.md` (existing conventions + the closest precedent to copy).

## Protocol

1. **Preconditions.** Verify `tasks.json` exists and parses; confirm each task carries `id`/`title`/`layer`/`deps`/`acs`/`dod`/`files_hint`. Load the upstream artifacts above (the agents read them directly). Note the current branch — if on the default branch, create/switch to a feature branch before any commit. Don't touch unrelated dirty changes; work only the files each task's `files_hint` names.
2. **Build the DAG.** Parse `tasks.json`, validate `deps` is acyclic, topologically sort into phases (Kahn). Compute `task_count`, `longest_chain`, `parallel_width`. Mark serialization lanes (overlapping `files_hint`, or a shared contract file — the compile-coupled lane).
3. **Banner.** Print how the engine will behave before it acts: `tdd=on gate=npm run test:fast commit=per-task branch=<…> tasks=<n> phases=<n>` plus the resolved per-role model+effort.
4. **Execute** in topo order — every task runs the TDD cycle → [`./references/tdd-loop.md`](./references/tdd-loop.md). Sequential-vs-fan-out → **Execution** below.
5. **Summary + hand off.** Report covered AC, commits made (with `SDD-Task`/`SDD-AC` trailers), any task dropped/blocked, and per-task gate results. Then **emit the stage-handoff block**: *What I did* (covered AC, commits with `SDD-Task` trailers, gate results) + *Review* (the committed diff + `tasks/tracker.md`) + *Run next* (fresh context, then re-review the whole diff before shipping). `sdd-implement` does not self-certify the whole change — an independent review over the full diff is the authoritative gate.

## Execution

**Default: sequential single-agent TDD.** Walk the DAG in topo order; for each task whose `deps` are all `done`, run the full `SELECT → RED → GREEN → REFACTOR → GATE → COMMIT` cycle ([`./references/tdd-loop.md`](./references/tdd-loop.md)) yourself before the next. Right for this workshop repo — small DAGs, and a linear history is easiest to review.

**Optional fan-out for a large DAG.** When the graph is genuinely wide — `parallel_width >= 2` and non-trivial (`size` in {M,L,XL} or `task_count >= 4`) — you MAY dispatch the **same three subagents** concurrently: a team via `TeamCreate`, or a `Workflow` from the Kahn layers, one pipeline per task (`sdd-test-author` → `sdd-implementer` → `sdd-reviewer`). Each concurrent agent needs its own git worktree so two never edit one tree; the lead still **serializes commits in dependency order** (see [`./references/tdd-loop.md`](./references/tdd-loop.md) §COMMIT), and tasks in one serialization lane queue. If `TeamCreate`/`Workflow` isn't available or the DAG isn't wide enough, fall back to sequential — the cycle and its gate are identical either way.

## TDD cycle (per task)

`SELECT → RED → GREEN → REFACTOR → GATE → COMMIT` → [`./references/tdd-loop.md`](./references/tdd-loop.md). RED is load-bearing: write the test first, run it, and **classify the first run** — GOOD red (assertion fails / unimplemented) vs BAD red (the test won't run → fix the test) vs false-pass (green immediately → the test is too weak, strengthen it). What makes a test good → [`./references/test-quality.md`](./references/test-quality.md). Quote the failing line before any production code. On a red that survives a normal GREEN retry, **escalate rather than weaken the test**: stronger model → retry → split the task → if the test encodes a wrong AC, **ask a human** → rollback to the last green. A red that survives escalation halts the run with a report; never make a test less strict to pass.

## Definition of Done

- Every task in `tasks.json` is either committed (test-first, gate-clean, `SDD-Task`/`SDD-AC` trailers) or reported as dropped/blocked with the reason.
- Unit gate green (`npm run test:fast`).
- The banner printed the run's behavior before execution.
- `tracker.md` reflects final status; the summary reports gate results and hands off to `review` (the independent review gate) — `sdd-implement` does not self-certify the whole change.
- The per-task GATE (`npm run test:fast` + `npm run lint`) is this skill's **structural self-check**; its result is reported in the handoff.

## Anti-patterns

- **Code before the test.** RED first, always.
- **Weakening a test to make it pass.** If the AC is wrong, ask a human and fix the AC; never edit the test to be less strict.
- **A weak or tautological test.** A false-pass that looks green hides a useless test — classify the first run against [`./references/test-quality.md`](./references/test-quality.md).
- **Parallel agents editing one working tree.** Fan-out requires a worktree per agent.
- **Committing with a red gate** and calling it done.

## References

`tdd-loop.md · test-quality.md` — both in [`./references/`](./references/).
