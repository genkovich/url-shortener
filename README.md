# 🔗 url-shortener

URL shortener на Node/Express/SQLite — з живою frontend, трирівневим набором тестів
і **детальним backlog'ом у форматі SDD**: кожна фіча описана достатньо, щоб AI-агент
реалізував її без жодного уточнювального питання.

Продукт тут навмисно маленький. Цінність — у тому, що навколо нього: специфікації,
контракти, ADR, атомарні таски з GWT-критеріями та детерміновані ворота, які не вміють
брехати про зелене.

## Швидкий старт

```bash
nvm use                            # Node 20+
npm install
npx playwright install chromium    # для e2e
npm run dev                        # → http://localhost:3000
```

Схему БД створює `migrate()` у `src/db.js` при першому запуску — жодного окремого кроку
міграції не потрібно. Файл бази лягає в `data/links.db` (у git не потрапляє).

Перевірити, що все зелене:

```bash
npm run doctor      # чи все є на цій машині
npm run verify      # усі детерміновані ворота однією командою
```

## Що вже працює

- Frontend: форма + список «Мої лінки».
- `POST /api/shorten` · `GET /:code` (302 + лічильник кліків) · `GET /api/links` · `GET /api/stats/:code`.
- Трирівневі тести: unit (домен) → integration (HTTP через supertest) → e2e (Playwright).
- Заглушки на `501`: `GET /metrics`, `GET /api/qr/:code`, `DELETE /api/:code` — їхні фічі
  чекають у беклозі.

## Стек

Node (ESM) + Express 4 + SQLite (`better-sqlite3`, prebuilt — без нативної компіляції).
Тести: Vitest (unit + integration) + supertest + Playwright (e2e). Лінт — ESLint flat config.
CI — GitHub Actions (`npm run verify` на трьох ОС × двох Node).

Збірки немає: `node src/server.js` і все.

## Структура

```
src/            shorten.js (домен) · app.js (роути) · db.js · server.js · public/ (frontend)
tests/          unit/ · integration/ (Vitest) · e2e/ (Playwright)
scripts/        verify.mjs · doctor.mjs · check-tools.mjs · lib.mjs — ворота, чистий Node
docs/           architecture-map.md · CONTEXT.md · roadmap.md · adr/ · features/ · _templates/
.claude/ .agents/ .codex/ .cursor/ .github/    вендорений скіл implement + три субагенти
```

## Ворота

| Команда | Що перевіряє |
|---|---|
| `npm run lint` | ESLint по всьому репо |
| `npm run test:fast` | unit + integration, без браузера — **per-task гейт** |
| `npm run test:e2e` | Playwright на своєму порту :3100 і своїй базі |
| `npm test` | усі три рівні |
| `npm run gate` | `lint` + `npm test` |
| `npm run tools:check` | вендоровані копії скіла не розійшлись між п'ятьма інструментами |
| `npm run verify` | усе вище однією командою, матриця, `exit 1` на червоному |

У `verify` немає «м'яких» пропусків: зникне скрипт — матриця почервоніє. Єдиний свідомий
пропуск — явний `npm run verify -- --skip-e2e`.

## Як реалізується фіча

Кожна фіча — це **SDD-пакет** під `docs/features/<slug>/`:

```
spec.md               контекст, user stories, acceptance-критерії (AC-01…AC-0N)
sad.md                архітектурне рішення, C4, runtime-діаграма, quality goals
contracts/openapi.yaml  HTTP-контракт: коди відповідей і схеми
adr/0001-*.md         зафіксоване рішення з альтернативами і наслідками
data-model.md         (якщо є міграція) ER, колонки, фікстури
test-plan.md          рівні тестів, покриття AC, edge cases
tasks.json            машинний контракт для скіла implement
tasks/T1…T5.md        атомарні таски: GWT, чекліст кроків, edge cases, DoD
tasks/_epic.md        граф залежностей (mermaid), хвилі, hard rules
tasks/tracker.md      статуси
```

Порядок роботи:

1. Обери фічу з `docs/roadmap.md` (секція **Now**, далі **Next**).
2. Прочитай `spec.md` §5 і `tasks/_epic.md` — там граф і хвилі.
3. Жени таски по TDD скілом `implement` (Claude Code: `/implement input-validation`;
   Codex: `$sdd-implement input-validation`; Cursor: `/` → `sdd-implement`).
4. Після кожного таска — `npm run test:fast`. Перед PR — `npm run verify`.
5. Онови `tasks/tracker.md`.

Скіл і три його субагенти (`test-author` → `implementer` → `reviewer`) вендоровані в репо
під кожен з п'яти інструментів. **Плагін ставити не треба.** Крос-туловий довідник і повні
конвенції — [`AGENTS.md`](AGENTS.md).

## Беклог

Готові пакети: [`base-vertical`](docs/features/base-vertical/) (shipped, worked example) ·
[`input-validation`](docs/features/input-validation/) ·
[`link-expiry`](docs/features/link-expiry/) ·
[`custom-alias`](docs/features/custom-alias/) ·
[`qr-codes`](docs/features/qr-codes/) ·
[`rate-limiting`](docs/features/rate-limiting/) ·
[`bulk-and-delete`](docs/features/bulk-and-delete/).

Черга і залежності — [`docs/roadmap.md`](docs/roadmap.md). Конвенції, яких мусить триматися
кожна фіча, — [`docs/architecture-map.md`](docs/architecture-map.md).

## Ліцензія

MIT — див. [LICENSE](LICENSE).
