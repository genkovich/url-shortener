# CLAUDE.md

Єдине джерело правди для роботи в цьому репо — **[AGENTS.md](AGENTS.md)**. Прочитай його першим.
Той самий файл читають Codex, Copilot, Cursor і Antigravity, тож правила спільні для всіх.

## Скіли (вендорені в репо — плагін ставити не треба)

- скіл — `.claude/skills/implement/` (project-скіл, знаходиться автоматично; самодостатній);
- агенти — `.claude/agents/` (`test-author`, `implementer`, `reviewer`).

Скіл реалізації/TDD — **`implement`** (в інших інструментах він зветься `sdd-implement`):
цикл `RED → GREEN → REFACTOR → GATE → COMMIT`, тест-першим, підіймає субагентів
(`test-author` пише червоний тест → `implementer` робить зелений і рефакторить → `reviewer`
незалежно рев'ює). Політика моделей по ролях — секція **Agents** у `.claude/skills/implement/SKILL.md`
плюс frontmatter кожного агента в `.claude/agents/` (`model: sonnet` для виконавців, `opus` для reviewer).

Виклик: `/implement <slug>`, де `<slug>` — тека під `docs/features/`.
