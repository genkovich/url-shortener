# url-shortener

Навчальний URL shortener на Node.js, Express і SQLite. Робота організована як SDD-пакети
фіч із TDD-циклом і детермінованими воротами.

## Вимоги

- Git
- Node.js 24 LTS (`.nvmrc`); `npm` постачається разом із Node.js і окремо не встановлюється
- один AI coding agent: Claude Code, Codex CLI, GitHub Copilot CLI або Cursor Agent
- інтернет для `npm ci`, завантаження Chromium і роботи агента

Виконайте лише секцію для своєї операційної системи.

### macOS

Встановіть [Homebrew](https://brew.sh/):

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Наприкінці інсталятор покаже блок `Next steps`. Виконайте надруковані там команди, щоб додати
`brew` до `PATH`, а тоді перевірте встановлення й поставте Git:

```bash
brew --version
brew install git
git --version
```

Якщо Homebrew попросить встановити системні Command Line Tools, погодьтеся з діалогом — окремо
запускати їхній інсталятор не потрібно.

Встановіть [`nvm`](https://github.com/nvm-sh/nvm) і Node.js 24 LTS разом із npm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
```

Закрийте й знову відкрийте Terminal, потім виконайте:

```bash
command -v nvm
nvm install 24
nvm alias default 24
```

Альтернативні способи встановлення Git описані на
[git-scm.com](https://git-scm.com/install/mac).

### Linux

Встановіть Git і `curl` через пакетний менеджер свого дистрибутива:

```bash
# Debian / Ubuntu
sudo apt update
sudo apt install -y git curl

# Fedora
sudo dnf install -y git curl

# Arch Linux
sudo pacman -S --needed git curl
```

Потрібно виконати лише блок для свого дистрибутива. Інші дистрибутиви перелічені на
[git-scm.com](https://git-scm.com/install/linux).

Встановіть [`nvm`](https://github.com/nvm-sh/nvm) і Node.js 24 LTS разом із npm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
```

Перезапустіть термінал або виконайте `source ~/.bashrc` чи `source ~/.zshrc`, а потім:

```bash
command -v nvm
nvm install 24
nvm alias default 24
```

### Windows

Відкрийте PowerShell і встановіть Git:

```powershell
winget install --id Git.Git -e --source winget
```

Якщо `winget` недоступний, завантажте інсталятор із
[git-scm.com](https://git-scm.com/install/windows). Після встановлення перезапустіть
PowerShell.

Node.js 24 LTS разом із npm встановіть офіційним `.msi`:

1. Відкрийте [архів останнього Node.js 24](https://nodejs.org/download/release/latest-v24.x/).
2. Завантажте `node-v24.*-x64.msi` для звичайного Intel/AMD-комп'ютера або
   `node-v24.*-arm64.msi` для Windows on ARM.
3. Запустіть інсталятор із типовими налаштуваннями та перезапустіть PowerShell.

Перевірка до клонування:

```bash
git --version
node --version
npm --version

# достатньо однієї команди
claude --version
codex --version
copilot --version
cursor-agent --version
```

## Встановлення

```bash
git clone https://github.com/genkovich/url-shortener.git
cd url-shortener
```

На macOS/Linux активуйте версію Node.js із `.nvmrc`:

```bash
nvm use
```

На macOS/Windows встановіть залежності та Chromium:

```bash
npm ci
npx playwright install chromium
```

На Linux встановіть залежності, Chromium і потрібні йому системні бібліотеки:

```bash
npm ci
npx playwright install --with-deps chromium
```

Docker, окремий SQLite, глобальні npm-пакети та SDD-плагіни не потрібні.

## Перевірка середовища

```bash
npm run doctor
npm run verify
```

`doctor` перевіряє Node.js, npm, Git, агенти та `node_modules`. `verify` додатково запускає
всі ворота, включно з Playwright E2E. Зелений `verify` означає, що середовище готове.

## Запуск

```bash
npm run dev
```

Застосунок: <http://localhost:3000>. Локальна база створюється автоматично в
`data/links.db`.

## Практики воркшопу

Послідовність вправ і переходи між ними: [`practice/README.md`](practice/README.md).

## Робота з фічею

1. Прочитайте [`AGENTS.md`](AGENTS.md) і [`docs/architecture-map.md`](docs/architecture-map.md).
2. Оберіть фічу з [`docs/roadmap.md`](docs/roadmap.md).
3. Прочитайте `docs/features/<slug>/spec.md`, `tasks/_epic.md` і файл поточної задачі.
4. Запустіть вендорений скіл `implement`:
   - Claude Code: `/implement <slug>`
   - Codex: `$sdd-implement <slug>`
   - Cursor: `/` → `sdd-implement`
5. Після кожної правки запускайте `npm run verify`.

Скіл працює за циклом `RED → GREEN → REFACTOR → GATE → COMMIT`. Зовнішній плагін для нього
не потрібен.

## Команди

| Команда | Призначення |
|---|---|
| `npm run dev` | локальний сервер на `http://localhost:3000` |
| `npm run lint` | ESLint |
| `npm run test:unit` | unit-тести |
| `npm run test:integration` | integration-тести |
| `npm run test:fast` | unit + integration без браузера |
| `npm run test:e2e` | Playwright E2E на порту `3100` |
| `npm test` | усі тести |
| `npm run gate` | lint + усі тести |
| `npm run doctor` | перевірка локального середовища |
| `npm run verify` | усі детерміновані ворота |
| `npm run tools:check` | синхронність вендорених скілів |
| `npm run links:check` | валідність посилань у документації |
| `npm run eval:self-test` | self-test behavioral grader-а без моделі |

## Автономний луп

```bash
git checkout -b feat/<slug>
npm run ralph -- --feature <slug> --dry-run
npm run ralph -- --feature <slug>
```

Луп не працює на `main` і не виконує `git push`. Повний протокол: [`loop/README.md`](loop/README.md).

## Структура

```text
src/                    код застосунку і frontend
tests/                  unit, integration та e2e
docs/features/<slug>/   SDD-пакети фіч
docs/roadmap.md         черга фіч
docs/architecture-map.md  архітектурні конвенції
loop/                   автономний ранер
practice/               чотири практики воркшопу
scripts/                локальні ворота
```

## Ліцензія

MIT — див. [LICENSE](LICENSE).
