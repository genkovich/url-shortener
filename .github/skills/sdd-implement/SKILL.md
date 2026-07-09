---
name: sdd-implement
# Copilot Agent Skill: only `name` + `description` are standard. `agents` points to the Copilot
# subagents that run this skill's roles (../../agents/sdd-{test-author,implementer,reviewer}.agent.md);
# Copilot dispatches them by name. Per-role model lives in the "Agents" table below, not here.
agents: [sdd-test-author, sdd-implementer, sdd-reviewer]
description: >
  Use to implement a feature from its tasks.json with test-driven development — writes a failing
  test first, makes it pass, refactors, gates, and commits per task. Triggers on "implement {slug}",
  "build {slug}", "TDD {slug}", "code up the tasks for {slug}", "/sdd:implement {slug}",
  "імплементуй {slug}", "реалізуй фічу {slug}", "напиши код за задачами". Reads
  docs/features/{slug}/tasks.json + upstream artifacts, builds a dependency DAG, and drives each
  task through a strict TDD cycle against the repo's test gate (`npm run test:fast`) — sequential by
  default, optionally fanning the three subagents over a large DAG. Hard-refuses if tasks.json
  is missing.
---

# Skill: implement

The implementation engine: it turns `tasks.json` into committed, tested code through a strict per-task TDD cycle — `SELECT → RED → GREEN → REFACTOR → GATE → COMMIT`. This repo is Node + Express + SQLite; the per-task gate is `npm run test:fast` (Vitest: unit + integration) plus `npm run lint`; the full repo gate `npm run gate` adds Playwright e2e.

This file is the spine; the two files in `references/` carry the depth.

## Owner

Tech Lead drives; the engine runs the cycle. Three Copilot subagents ship with this skill: [`sdd-test-author`](../../agents/sdd-test-author.agent.md) (RED), [`sdd-implementer`](../../agents/sdd-implementer.agent.md) (GREEN/REFACTOR/GATE), [`sdd-reviewer`](../../agents/sdd-reviewer.agent.md) (read-only review).

## Agents, models & the worker contract

Model is chosen by the **kind of work** — execution gets a balanced model, independent judgment the strongest. The tiers live in each agent's frontmatter:

| Agent | Kind | Dispatch (Copilot agent) | `model` | On escalation |
|---|---|---|---|---|
| `sdd-test-author` | execution (write the failing test) | `sdd-test-author` | `Claude Sonnet 4.5` (mid) | stronger model / retry |
| `sdd-implementer` | execution (green + refactor + gate) | `sdd-implementer` | `Claude Sonnet 4.5` (mid) | stronger model / retry |
| `sdd-reviewer` | judgment (independent review) | `sdd-reviewer` | `Claude Opus 4.5` (strong) | — |

- **Dispatch.** Spawn each by its Copilot agent name, defined in `../../agents/*.agent.md`. If a named agent isn't available at runtime, fall back to a general-purpose agent with the **same prompt** — a fallback reads nothing from the agent file, so inline everything it needs.
- **Model source.** Each agent's `model:` frontmatter sets its tier (mid for the executors, strong for the reviewer). Escalation re-dispatches an executor at a stronger model. Print the resolved per-role model in the banner.
- **`.size` scaling.** For **L/XL** features raise execution effort to `high` before dispatch; keep the cheap defaults for **XS/S**.
- **Worker contract (every spawned agent):**
  1. **Clean, isolated context** — the agent sees only its prompt string, not this conversation; it re-reads the upstream artifacts itself. For the reviewer this isolation *is* the point (fresh eyes).
  2. **Worker preamble** — wrap the task: «execute directly, do not spawn sub-agents, use tools directly, report with absolute file paths». A subagent cannot fan out; the lead owns orchestration.
  3. **Verify before claiming done** — identify the command that proves it, run it, read the output, then claim with evidence.
  4. **Cite or drop** — `sdd-reviewer` emits only cited findings (`file:line` + the AC/artifact clause); an uncited finding is dropped.

## Inputs

- `<slug>` — feature slug.
- **Gate (hard refuse):** `docs/features/<slug>/tasks.json` must exist and parse as JSON. Missing or malformed → «run `tasks <slug>` first». Never reconstruct tasks from the markdown — `tasks.json` is the contract.
- Read for context (agents read these directly, no paraphrase): `spec.md` §5 (AC), `data-model.md`, `contracts/openapi.yaml`, `test-plan.md`, `sad.md`, Accepted `adr/`, and `docs/architecture-map.md` (existing conventions + the closest precedent to copy).

## Protocol

1. **Preconditions.** Verify `tasks.json` exists and parses; confirm each task carries `id`/`title`/`layer`/`deps`/`acs`/`dod`/`files_hint`. Load the upstream artifacts above (the agents read them directly). Note the current branch — if on the default branch, create/switch to a feature branch before any commit. Don't touch unrelated dirty changes; work only the files each task's `files_hint` names.
2. **Build the DAG.** Parse `tasks.json`, validate `deps` is acyclic, topologically sort into phases (Kahn). Compute `task_count`, `longest_chain`, `parallel_width`. Mark serialization lanes (overlapping `files_hint`, or a shared contract file — the compile-coupled lane).
3. **Banner.** Before acting, print how the engine will behave: `tdd=on gate=npm run test:fast commit=per-task branch=<…> tasks=<n> phases=<n>` plus the resolved per-role model.
4. **Execute** in topo order — every task runs the TDD cycle → [`./references/tdd-loop.md`](./references/tdd-loop.md). See **Execution** for sequential-vs-fan-out.
5. **Summary + hand off.** Report covered AC, commits made (with `SDD-Task`/`SDD-AC` trailers), any task dropped/blocked, and per-task gate results. Then **emit the stage-handoff block**: *What I did* (covered AC, commits with `SDD-Task` trailers, gate results) + *Review* (the committed diff + `tasks/tracker.md`) + *Run next* (start a fresh context, then re-review the whole diff before shipping). `implement` does not self-certify the whole change — an independent review over the full diff is the authoritative gate.

## Execution

**Default: sequential single-agent TDD.** Walk the DAG in topo order; for each task whose `deps` are all `done`, run the full `SELECT → RED → GREEN → REFACTOR → GATE → COMMIT` cycle ([`./references/tdd-loop.md`](./references/tdd-loop.md)) yourself before the next. Right for this workshop repo — the DAGs are small and a linear history is easiest to review.

**Optional fan-out for a large DAG.** When the graph is genuinely wide — `parallel_width >= 2` and the feature is non-trivial (`size` in {M,L,XL} or `task_count >= 4`) — you MAY dispatch the **same three subagents** concurrently: a team via `TeamCreate`, or a dynamic `Workflow` from the Kahn layers, one pipeline per task (`sdd-test-author` → `sdd-implementer` → `sdd-reviewer`). Each concurrent agent needs its own git worktree so two never edit one tree; the lead still **serializes commits in dependency order** ([`./references/tdd-loop.md`](./references/tdd-loop.md) §COMMIT), and same-lane tasks queue. If `TeamCreate`/`Workflow` isn't available, or the DAG isn't wide enough, fall back to sequential — the cycle and its gate are identical either way.

## TDD cycle (per task)

`SELECT → RED → GREEN → REFACTOR → GATE → COMMIT` → [`./references/tdd-loop.md`](./references/tdd-loop.md). RED is load-bearing: write the test first, run it, and **classify the first run** — GOOD red (assertion fails / unimplemented) vs BAD red (the test won't run → fix the test) vs false-pass (green immediately → the test is too weak, strengthen it). What a good test asserts is [`./references/test-quality.md`](./references/test-quality.md). Quote the failing line before any production code. On a red that survives a normal GREEN retry, **escalate rather than weaken the test**: stronger model → retry → split the task → if the test encodes a wrong AC, **ask a human** → rollback to the last green. A red that survives escalation halts the run with a report; never make a test less strict to pass.

## Definition of Done

- Every task in `tasks.json` is either committed (test-first, gate-clean, `SDD-Task`/`SDD-AC` trailers) or reported as dropped/blocked with the reason.
- Unit gate green (`npm run test:fast`).
- The banner printed the run's behavior before execution.
- `tracker.md` reflects final status; the summary reports the gate results and hands off to `review` (the independent gate) — `implement` does not self-certify the whole change.
- The per-task GATE (`npm run test:fast` + `npm run lint`) is this skill's **structural self-check**; its result is reported in the handoff.

## Anti-patterns

- **Code before the test.** RED first, always.
- **Weakening a test to make it pass.** If the AC is wrong, ask a human and fix the AC; never edit the test to be less strict.
- **A weak or tautological test.** A false-pass that looks green hides a useless test — classify the first run, and check it against [`./references/test-quality.md`](./references/test-quality.md).
- **Parallel agents editing one working tree.** Fan-out requires a worktree per agent.
- **Committing with a red gate** and calling it done.

## References

`tdd-loop.md · test-quality.md` — both in [`./references/`](./references/).
