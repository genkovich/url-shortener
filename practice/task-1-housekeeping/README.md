# Практика 1 — збираємо абстрактний housekeeping loop

Housekeeping не отримує конкретного тикета. На кожному проході Claude сам читає репозиторій,
знаходить одну малу корисну роботу, виконує її та залишає локальний коміт.

Джерела роботи, у порядку пріоритету:

1. червоні детерміновані ворота;
2. звичайні `TODO` і `FIXME` у коді;
3. відкриті GitHub issues із label `housekeeping`, якщо налаштований `gh`;
4. невеликий дефект або спрощення, яке можна довести тестом чи видаленням реальної дубляції.

Runner не вирішує, **що** покращувати. Він лише тримає межі:

```text
Claude обирає одну задачу → один локальний commit → runner перевіряє → sleep → знову
```

На воркшопі запустимо рівно один прохід через `--once`. Без цього прапорця цикл працює до
`Ctrl+C` або першого провалу. Він викликає модель і може витрачати гроші без участі
людини; запускайте лише після дозволу ведучого. `git push` і PR заборонені.

## 1. Підготуйте гілку

```bash
git status --short
npm run verify
git switch -c chore/housekeeping
git grep -nE "TODO|FIXME" -- src
```

Перша команда не має нічого надрукувати. Якщо дерево брудне або гілка вже існує, зупиніться й
покличте ведучого. У репозиторії вже лежать звичайні `TODO`, тому перший прохід має стартові
кандидати без окремої категорії маркерів.

## 2. Прочитайте політику однієї ітерації

Відкрийте [PROMPT.md](./PROMPT.md). Це спільна політика для різних
рушіїв:

- скрипта, який ми зараз складемо;
- вбудованого Claude Code `/loop`.
- будь-якого headless-агента (без інтерактивного діалогу), чию команду передано через `AGENT_CMD`.

Промпт наказує обрати рівно одну малу задачу, не брати roadmap-фічі, пройти TDD, запустити
ворота й зробити один локальний коміт. Якщо безпечної роботи немає — Claude нічого не змінює.

## 3. Створіть адаптер команд

Створіть порожній `practice/task-1-housekeeping/housekeeping.mjs` і додайте:

```js
#!/usr/bin/env node

import process from 'node:process';
import console from 'node:console';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { git, run } from '../../scripts/lib.mjs';

const ROOT = process.cwd();
const BRANCH = 'chore/housekeeping';
const PROMPT_FILE = 'practice/task-1-housekeeping/PROMPT.md';
const AGENT_CMD = process.env.AGENT_CMD ?? 'claude -p --permission-mode auto';
// Альтернативи: закоментуйте рядок вище й розкоментуйте рівно один нижче.
// const AGENT_CMD = process.env.AGENT_CMD ?? 'codex exec --sandbox workspace-write --ephemeral --color never';
// const AGENT_CMD = process.env.AGENT_CMD ?? 'copilot --allow-all-tools --silent --no-color --no-ask-user -p';
// const AGENT_CMD = process.env.AGENT_CMD ?? 'cursor-agent -p --trust --force --output-format text';
const INTERVAL_MS = Number(process.env.HOUSEKEEPING_INTERVAL_MS ?? 1_800_000);
const once = process.argv.includes('--once');

const [agentBin, ...agentArgs] = AGENT_CMD.trim().split(/\s+/);

const exec = (cmd, args) => run(cmd, args, { cwd: ROOT, stdio: 'inherit' }).ok;
const status = () => git(ROOT, 'status', '--porcelain', '--untracked-files=all');
const stop = (message) => {
  console.error(`housekeeping: ${message}`);
  process.exit(1);
};
```

Спільний `scripts/lib.mjs` уже вміє запускати `npm.cmd` на Windows. Інтервал за замовчуванням —
30 хвилин; перша ітерація стартує одразу.

Після цього й кожного наступного JavaScript-чанка перевіряйте файл:

```bash
node --check practice/task-1-housekeeping/housekeeping.mjs
```

Порожня відповідь означає, що синтаксис правильний. Помилка з номером рядка означає: спочатку
виправте поточний чанк, а вже тоді переходьте далі.

## 4. Додайте стартові запобіжники

Допишіть нижче:

```js
const branch = () => git(ROOT, 'branch', '--show-current');
if (branch() !== BRANCH) stop(`потрібна гілка ${BRANCH}, зараз «${branch() || 'detached HEAD'}»`);
if (status()) stop('дерево брудне — спочатку закоміть або приберіть зміни');
if (!Number.isInteger(INTERVAL_MS) || INTERVAL_MS < 1_000) stop('інтервал має бути цілим числом ≥ 1000');

const prompt = readFileSync(PROMPT_FILE, 'utf8');

const rollback = (sha, reason) => {
  console.error(`housekeeping: ${reason} → rollback до ${sha.slice(0, 7)}`);
  exec('git', ['-C', ROOT, 'reset', '--hard', sha]);
  exec('git', ['-C', ROOT, 'clean', '-fd']);
  return 'failure';
};
```

Runner працює лише на окремій чистій гілці. Початковий SHA кожної ітерації стане точкою
відкату, якщо Claude вийде за межі або залишить червоні ворота. `reset --hard` і `clean -fd`
безпечні тут саме тому, що перед стартом ми перевірили окрему чисту гілку.

## 5. Додайте одну ітерацію

```js
const workOnce = (iteration) => {
  const sha = git(ROOT, 'rev-parse', 'HEAD');
  console.log(`\n--- housekeeping ${iteration} · ${sha.slice(0, 7)} ---`);

  const agent = run(agentBin, [...agentArgs, prompt], { cwd: ROOT, stdio: 'inherit' });
  if (!agent.ok) return rollback(sha, `агент завершився з кодом ${agent.status ?? 'невідомо'}`);
  if (branch() !== BRANCH) stop('агент перемкнув гілку — потрібне ручне втручання');
  if (status()) return rollback(sha, 'агент залишив незакомічені зміни');

  const commits = Number(git(ROOT, 'rev-list', '--count', `${sha}..HEAD`));
  if (commits === 0) {
    console.log('housekeeping: безпечної роботи немає');
    return 'idle';
  }
  if (commits !== 1) return rollback(sha, `агент створив комітів: ${commits}`);

  if (!exec('npm', ['run', 'verify', '--', '--skip-e2e'])) return rollback(sha, 'ворота червоні');

  console.log(`housekeeping: зелено → ${git(ROOT, 'log', '-1', '--oneline')}`);
  return 'success';
};
```

Агент сам читає джерела роботи, запускає потрібні тести й створює змістовний коміт. Runner не
довіряє звіту моделі: він приймає лише чисте дерево, рівно один коміт і зелений незалежний gate.

## 6. Замкніть цикл

```js
let iteration = 0;

while (true) {
  iteration += 1;
  const result = workOnce(iteration);

  if (result === 'failure') stop('прохід завершився провалом');
  if (once) {
    console.log(`housekeeping: --once завершено (${result})`);
    break;
  }

  console.log(`housekeeping: наступна перевірка через ${Math.round(INTERVAL_MS / 60_000)} хв`);
  await sleep(INTERVAL_MS);
}
```

`idle` означає «безпечної роботи немає» і не є помилкою. У режимі `--once` runner завершується
після першого результату. Без `--once` він засинає між успішними або `idle`-проходами й зупиняється після
першого провалу, щоб не витрачати токени на повторення тієї самої помилки.

## 7. Перевірте й запустіть

Скрипт має бути закомічений до запуску, інакше власний preflight побачить брудне дерево:

```bash
node --check practice/task-1-housekeeping/housekeeping.mjs
git add practice/task-1-housekeeping/housekeeping.mjs
git commit -m "chore: add housekeeping loop"
node practice/task-1-housekeeping/housekeeping.mjs --once
```

Увесь вивід агента й воріт уже видно в цьому терміналі. Щоб одночасно бачити й зберігати його в
лог, на macOS або Linux запустіть:

```bash
node practice/task-1-housekeeping/housekeeping.mjs --once 2>&1 | tee /tmp/housekeeping.log
```

Стежити за цим логом з іншого термінала:

```bash
tail -f /tmp/housekeeping.log
```

У PowerShell той самий запуск виглядає так:

```powershell
node practice/task-1-housekeeping/housekeeping.mjs --once 2>&1 |
  Tee-Object -FilePath "$env:TEMP\housekeeping.log"
```

Не зберігайте лог всередині репозиторію: runner побачить новий файл як брудне дерево. `/tmp` і
`$env:TEMP` лежать поза репозиторієм, тому не заважають перевірці.

За замовчуванням використовується Claude. Той самий runner можна віддати іншому агентові:

```bash
AGENT_CMD='codex exec --sandbox workspace-write --ephemeral --color never' node practice/task-1-housekeeping/housekeeping.mjs --once
```

У PowerShell змінну задайте окремо:
`$env:AGENT_CMD='codex exec --sandbox workspace-write --ephemeral --color never'`.

Перша ітерація стартує негайно, а `--once` завершує процес після її результату. Перевірте:

```bash
git log --oneline -3
git status --short
npm run verify
```

Після воркшопу запуск без `--once` вмикає справжній періодичний цикл із паузою 30 хвилин:

```bash
node practice/task-1-housekeeping/housekeeping.mjs
```

## Альтернатива: той самий prompt через Claude `/loop`

Після кроку 1 відкрийте Claude Code:

```bash
claude --permission-mode auto
```

Усередині сесії запустіть ту саму політику кожні 30 хвилин:

```text
/loop 30m Прочитай practice/task-1-housekeeping/PROMPT.md і виконай одну ітерацію дослівно.
```

`/loop` потребує Claude Code 2.1.72 або новішого, працює лише поки сесія відкрита й успадковує
її дозволи. `Esc` скасовує наступне пробудження.

У [практиці 4](../task-4-self-improvement/README.md) цей runner отримає окрему reflection-смугу,
яка покращує `PROMPT.md` лише через RED → GREEN eval.
