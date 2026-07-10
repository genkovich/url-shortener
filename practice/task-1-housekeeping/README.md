# Задача 1 — Housekeeping: цикл шукає роботу сам

Зазвичай тригер приносить завдання: прийшов тикет, прийшов запит, прийшов промпт. Housekeeping-цикл
влаштований інакше. Він прокидається за розкладом **без завдання** і сам питає репозиторій, чи є
робота. Ми пишемо цей цикл: маркер у коді → агент → ворота → коміт або відкат.

Стеля автономії — коміт у локальну гілку. Ані `git push`, ані `gh pr create`.

---

## Крок 1 — підготувати ґрунт

```bash
git checkout -b chore/housekeeping
```

Посади один маркер у `src/shorten.js`, рядком вище за `return db.prepare(...)` у функції `listLinks`:

```js
// TODO(housekeeping): listLinks() без тесту на порожню базу
```

Закоміть його: `git add src/shorten.js && git commit -m 'chore: посіяти маркер'`.

**Видно:** `git status` чистий, а `grep -rnF 'TODO(housekeeping)' src` дає рівно один рядок.

---

## Крок 2 — створити `housekeeping.mjs`

Файл лягає в `practice/task-1-housekeeping/housekeeping.mjs`.

```js
#!/usr/bin/env node
// housekeeping.mjs — цикл, який прокидається без завдання і шукає роботу сам.
// Запуск із кореня репо: node practice/task-1-housekeeping/housekeeping.mjs

import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const MARKER = 'TODO(housekeeping)';
const MAX_ITER = 5;      // скільки разів пробуємо за запуск
const MAX_FIXES = 2;     // скільки комітів дозволено за запуск
const K_FAILURES = 2;    // скільки провалів поспіль до зупинки
const LESSONS = 'practice/task-1-housekeeping/lessons.log';

/** Запустити команду, показати її вивід. true, якщо код виходу 0. */
const run = (cmd, ...args) => spawnSync(cmd, args, { stdio: 'inherit' }).status === 0;

/** Прочитати stdout. Порожньо, якщо команда впала (grep без збігів теж «падає»). */
const out = (cmd, ...args) => spawnSync(cmd, args, { encoding: 'utf8' }).stdout ?? '';

const dirty = () => out('git', 'status', '--porcelain').trim();
const findings = () => out('grep', '-rnF', MARKER, 'src').split('\n').filter(Boolean);
const gatesGreen = () => run('npm', 'run', 'verify', '--', '--skip-e2e');

const promptFor = (found) => `Полагодь ${MARKER} тут: ${found}
Додай тест, який червонів би без твоєї правки. Прибери маркер.
Не чіпай інших файлів. Не комітай — коміт зробить цикл.`;

if (dirty()) {
  console.log('дерево брудне — розберись руками, я нічого не чіпаю');
  process.exit(1);
}

let fixes = 0;
let failures = 0;

for (let iter = 1; iter <= MAX_ITER; iter++) {
  if (fixes >= MAX_FIXES) { console.log(`стоп: ${MAX_FIXES} фікси за запуск`); break; }
  if (failures >= K_FAILURES) { console.log(`стоп: ${K_FAILURES} провали поспіль`); break; }

  const [found] = findings();
  if (!found) { console.log('роботи немає'); break; }

  const sha = out('git', 'rev-parse', 'HEAD').trim();
  console.log(`\n[${iter}/${MAX_ITER}] ${found}`);

  const agentOk = run('claude', '-p', promptFor(found), '--permission-mode', 'acceptEdits');

  // Вирішують ворота, а не агент. Він міг упасти, зникнути з PATH або нічого не змінити.
  if (!agentOk || !dirty()) {
    console.log('  агент не зробив правки');
    failures += 1;
  } else if (gatesGreen()) {
    run('git', 'add', '-A');
    run('git', 'commit', '-m', `chore(housekeeping): ${found.split(`${MARKER}:`)[1]?.trim() ?? found}`);
    console.log('  ворота зелені → коміт');
    fixes += 1;
    failures = 0;
  } else {
    run('git', 'reset', '--hard', sha);
    run('git', 'clean', '-fd');
    appendFileSync(LESSONS, `${new Date().toISOString()} ${found}\n`);
    console.log('  ворота червоні → відкат, урок у lessons.log');
    failures += 1;
  }
}
```

Запобіжників рівно чотири: чисте дерево на вході, ліміт ітерацій, ліміт комітів за запуск і зупинка
після K провалів поспіль. Більше нічого не треба — це не сервіс, а нічний скрипт.

Закоміть і сам скрипт: `git add practice && git commit -m 'chore: housekeeping-цикл'`. Інакше перший
же запуск побачить некомічений файл, вважатиме дерево брудним і зупиниться, не почавши.

**Видно:** `npm run lint` зелений.

---

## Крок 3 — запустити руками

Спершу подивись на цикл очима, і лише потім віддавай його розкладу.

```bash
node practice/task-1-housekeeping/housekeeping.mjs
```

**Видно:** рядок `[1/5] src/shorten.js:40:  // TODO(housekeeping): …`, а далі одне з двох. Або
`ворота зелені → коміт` і новий коміт у `git log --oneline -1`. Або `ворота червоні → відкат`,
чисте дерево і новий рядок у `lessons.log`.

---

## Крок 4 — розклад

`crontab -e`, два рядки:

```cron
PATH=/opt/homebrew/bin:/usr/local/bin:/Users/<ти>/.local/bin:/usr/bin:/bin
*/30 * * * * cd $HOME/sources/url-shortener && node practice/task-1-housekeeping/housekeeping.mjs >> /tmp/housekeeping.log 2>&1
```

Рядок `PATH=` обов'язковий. Cron дає мінімальне середовище і не бачить ані `node`, ані `npm`, ані
`claude` — без нього кожен тік мовчки падатиме на `command not found`. Щоб перевірити розклад, не
чекаючи пів години, постав тимчасово `*/1 * * * *` і дивись `tail -f /tmp/housekeeping.log`.

Дві заувaги. На macOS `/usr/sbin/cron` потребує Full Disk Access, інакше тік не прочитає репо в
`~/Documents` чи `~/Desktop`. І `crontab -r` зносить весь твій crontab без підтвердження, тож
знімай завдання через `crontab -e`, а не через `-r`.

---

## Чому свій маркер, а не наявні

У `src/` уже лежать шість маркерів `TODO(good-first-task)` — засіяний беклог інших задач, серед них
stored XSS і graceful shutdown. Це справжній продакшн-код, і агент, спущений на нього вночі,
перепише його без нагляду. Тому цикл шукає рівно `TODO(housekeeping)`, який ти посадив сам і за який
відповідаєш. Беклог описаний у [docs/good-first-tasks.md](../../docs/good-first-tasks.md).

## Чому вирішують ворота, а не агент

Агент, який відрапортував успіх, міг зламати сусідній тест, зачепити чужий файл або взагалі не
змінити жодного рядка. Його код виходу каже лише «процес завершився», а не «код став кращим». Тому
відповідь на питання «зелено чи ні» дає перепрогін `npm run verify`, а не сам агент. Провал означає
відкат на попередній коміт і рядок в `lessons.log` — щоб уранці було видно, за що цикл узявся і чому
програв.
