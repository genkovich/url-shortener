# AGENTS.md — url-shortener

> Єдине джерело правди для будь-якого AI-агента в цьому репо (Claude Code, Codex,
> GitHub Copilot, Cursor, Antigravity). Кожен з цих інструментів автоматично читає
> цей файл (Claude — через `CLAUDE.md`, який сюди веде). Прочитай його перед будь-якою
> задачею. **Жоден плагін ставити не треба** — усі протоколи вже лежать у репо.

## Що це за проєкт

URL shortener на Node/Express/SQLite з живою frontend і трирівневим набором тестів.
Базова вертикаль (скоротити → перейти → лічильник) працює; частина ендпоінтів — заглушки
на `501`. Кожна наступна фіча приїжджає готовим SDD-пакетом під `docs/features/<slug>/`
і реалізується скілом `implement` по TDD.

## Команди

| Команда | Що робить |
|---|---|
| `npm run dev` | підняти сервер → http://localhost:3000 (frontend) |
| `npm run lint` | ESLint по всьому репо |
| `npm run test:unit` | лише unit (Vitest, project `unit`) — доменні функції над `openDb(':memory:')` |
| `npm run test:integration` | лише integration (Vitest, project `integration`) — HTTP через supertest |
| `npm run test:fast` | unit + integration разом, без браузера — **це і є per-task TDD ворота** |
| `npm run test:e2e` | E2E через обморду (Playwright, свій порт :3100 і своя база) |
| `npm test` | усі три рівні (`test:fast` + `test:e2e`) — підіймає браузер, довше |
| `npm run gate` | повні ворота репо: `lint` + `npm test` |
| `npm run doctor` | що є на цій машині (node, git, `claude`, `codex`, `node_modules`) |
| `npm run verify` | **усі детерміновані ворота однією командою, 0 токенів** — матриця + `exit 1` на червоному |
| `npm run tools:check` | крос-тулові ворота: вендоровані скіли й рев'юери не розійшлись |

**Після кожної правки — `npm run verify`.** Прапорці: `--skip-e2e` (без браузера, так ганяє
Windows у CI) і `--fail-fast` (зупинитись на першому червоному).

⚠ У `verify` немає «м'яких» пропусків. Зникне будь-який скрипт-ворота з `package.json` —
матриця почервоніє. Ворота, що мовчки скіпаються, гірші за їх відсутність: вони показують
зелене там, де ніхто нічого не перевірив.

Тестова база — in-memory: unit і integration тести ганяють `createApp(openDb(':memory:'))`.
E2E ганяє окрему файлову базу (`playwright.config.js` → `DB_PATH=data/e2e.db`).

**Per-task гейт — `npm run test:fast`.** `npm test` і `npm run gate` тягнуть Playwright і
підіймають браузер — ганяй їх рідше (перед комітом фічі), не після кожного кроку.

## Золоті правила (конвенції, які фіча має тримати)

Повний перелік — `docs/architecture-map.md`. Стисло:

- **Домен vs HTTP.** Нове доменне правило (валідація, expiry, dedup) → `src/shorten.js`.
  Роути в `src/app.js` лишаються тонкими: викликають домен і маплять результат у HTTP.
- **Тестування.** Усе через `createApp(openDb(':memory:'))`. Прецедент HTTP-шва:
  `tests/integration/shorten.test.js`; прецедент доменного: `tests/unit/shorten.test.js`.
- **Форма помилки.** `res.status(4xx).json({ error: '<short>' })`. Ніколи не кидати голий рядок.
- **Статус-коди.** 201 create · 302 redirect · 400 validation · 404 missing · 409 conflict ·
  410 expired · 429 rate-limit · 501 ще-не-зроблено.
- **Міграції.** Нова колонка → окрема ідемпотентна `ALTER TABLE` у `src/db.js`; базову схему не редагуємо.
- **Порядок роутів.** `/api/*` оголошуються ВИЩЕ за catch-all `GET /:code`, інакше catch-all
  перехоплює їх першим.
- **Без нових залежностей** у продукті, доки ADR фічі не скаже інакше.
- **TDD.** Кожна задача стартує з червоного тесту (див. протокол нижче).

## Як реалізовувати фічу

1. **Візьми специфікацію.** Кожна фіча — це готовий пакет під `docs/features/<slug>/`:
   `spec.md` (acceptance-критерії), `sad.md` (дизайн), `contracts/openapi.yaml` (HTTP-контракт),
   `adr/` (рішення), `tasks.json` + `tasks/` (задачі). Це звичайний markdown — читає будь-який
   агент, **жоден плагін не потрібен**. Черга фіч — у `docs/roadmap.md`. Готовий worked example —
   `base-vertical` (вже shipped).
2. **Прочитай таск цілком.** Кожен `tasks/T*.md` має GWT-критерії, покроковий чекліст,
   таблицю edge cases і Definition of Done. Питати нічого не треба — усе там.
3. **Жени по TDD скілом `implement`** (в інших інструментах — `sdd-implement`). Цикл
   `RED → GREEN → REFACTOR → GATE → COMMIT`, один acceptance-критерій за раз, тест-першим.
   Код до червоного тесту писати заборонено. Він сам підіймає субагентів: `test-author`
   (пише червоний тест) → `implementer` (робить зелений і рефакторить) → `reviewer`
   (незалежно рев'ює). Політика моделей по ролях — секція **Agents** усередині `implement/SKILL.md`.
4. **Тримай ворота зеленими.** Після кожного кроку — `npm run test:fast`. Наявні тести
   (`tests/unit/shorten.test.js`, `tests/integration/shorten.test.js`) мають лишатися зеленими.
5. **Закрий таск.** Онови `tasks/tracker.md` (`status: done`) і зішли PR на файл таска.

## Скіли (вендорені в репо — плагін ставити не треба)

У репо вендорено скіл `implement` (TDD-движок, самодостатній — уся політика в його `SKILL.md`
+ `references/`) і три його субагенти (`test-author` · `implementer` · `reviewer`). Їдуть із
клоном, окремими файлами під кожен інструмент, зміст однаковий (формат SKILL.md — відкритий
стандарт Agent Skills):

| Інструмент | Де лежать скіли | Як викликати | Субагенти |
|---|---|---|---|
| Claude Code | `.claude/skills/` | `/implement <slug>` | `.claude/agents/` |
| Codex | `.agents/skills/sdd-implement/` | `$sdd-implement <slug>` | `.codex/agents/` |
| Copilot | `.github/skills/` | Agent Skills (авто) | `.github/agents/*.agent.md` |
| Cursor | `.cursor/skills/sdd-implement/` | `/` → `sdd-implement` | `.cursor/agents/` |
| Antigravity | `.agents/skills/sdd-implement/` | skill за описом (авто) | `.agents/skills/sdd-implement/agents/` |

Ключовий (і єдиний) скіл — **`implement`** / **`sdd-implement`**. Специфікації фіч у
`docs/features/` авторовані за SDD, тож скіл читає їх напряму. Ворота (`npm run *`) однакові
в усіх інструментах і в CI: двигун змінний, ворота ні.

## Де що лежить

- `src/` — код (`shorten.js` домен · `app.js` роути · `db.js` БД · `server.js` вхід · `public/` frontend).
- `docs/features/<slug>/` — SDD-пакети фіч (spec · sad · contracts · adr · tasks).
- `docs/_templates/` — шаблони `task.md`, `_epic.md`, `tracker.md` для нових пакетів.
- `docs/roadmap.md` — черга фіч.
- `docs/architecture-map.md` — конвенції (читай першим).
- `docs/CONTEXT.md` — глосарій домену.
- `docs/adr/` — наскрізні рішення проєкту (не фічеві).
- `.claude/skills/` · `.agents/skills/sdd-implement/` · `.cursor/skills/sdd-implement/` · `.github/skills/` — вендорені SDD-скіли.
- `scripts/` — ворота як скрипти (`verify.mjs` · `doctor.mjs` · `check-tools.mjs` · спільний
  `lib.mjs`). Чистий Node, без залежностей.
- `tests/unit/` · `tests/integration/` — Vitest (project `unit` / project `integration`).
- `tests/e2e/` — Playwright.

## Чого НЕ робити

- Не додавати фреймворки у frontend (vanilla HTML/CSS/JS).
- Не редагувати базову схему БД — тільки окремі міграції.
- Не писати код до червоного тесту.
- Не вимагати зовнішніх плагінів чи сервісів — усе має працювати з чистого клону.
- Не додавати npm-залежність, якщо ADR фічі цього прямо не дозволив.
