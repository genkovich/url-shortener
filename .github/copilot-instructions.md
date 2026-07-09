# Copilot instructions — url-shortener

Single source of truth for this repo is **[AGENTS.md](../AGENTS.md)** — read it first.
The same file is shared by Claude Code, Codex, Cursor and Antigravity, so the rules are common.

Everything is vendored in the repo — no plugin to install:
- **Skills** (Agent Skills, SKILL.md format): Copilot reads them from `.github/skills/`.
  The implementation/TDD skill is **`sdd-implement`** (`.github/skills/sdd-implement/SKILL.md`) —
  red → green → refactor → gate. Its `agents:` list names the three subagents below.
- **Subagents**: `.github/agents/sdd-*.agent.md` — `sdd-test-author` (writes the failing test),
  `sdd-implementer` (makes it green + refactors), `sdd-reviewer` (independent read-only review).

The golden rules — thin routes, domain logic in `src/shorten.js`, every task test-first, `npm run test:fast`
green after each change — live in AGENTS.md (single source of truth for all commands). Follow them there.
