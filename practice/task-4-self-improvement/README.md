# Практика 4 — self-improvement: evidence → eval → prompt

У практиці 1 housekeeping покращував продукт. Тепер навчимо той самий runner помічати
повторювану власну помилку й окремим проходом покращувати свою policy.

Ми не будемо одразу будувати весь механізм. Спочатку побачимо конкретну прогалину, потім
навчимо runner розпізнавати evidence, виконаємо одну reflection-ітерацію вручну і лише після
цього під'єднаємо її до основного циклу.

```text
два однакові work failure
          ↓
detector вирішує: reflection потрібен
          ↓
старий prompt → RED eval
          ↓
мінімальна зміна prompt → GREEN eval
          ↓
наступний workOnce() читає новий prompt
```

Це code-along приблизно на 30 хвилин і один виклик моделі.

## Що буде змінюватися

| Роль | Файл |
|---|---|
| Product-runner, який ми розширюємо | `practice/task-1-housekeeping/housekeeping.mjs` |
| Policy product-ітерації | `practice/task-1-housekeeping/PROMPT.md` |
| Policy reflection-ітерації | `practice/task-4-self-improvement/REFLECT_PROMPT.md` |
| Факти про проходи | `practice/task-4-self-improvement/JOURNAL.jsonl` |
| Доказ нового правила | `practice/task-4-self-improvement/eval.mjs` |

Під час reflection агент може змінити рівно два файли: housekeeping prompt і eval. Product-код,
runner та reflection prompt не входять до allowlist.

## Фаза 1 — побачити проблему

### 1. Створіть окрему гілку

Практика продовжує результат задачі 1, але не змінює її гілку:

```bash
git status --short
git switch -c workshop/self-improvement chore/housekeeping
```

Перша команда не має нічого надрукувати. Відкрийте створений у задачі 1
`practice/task-1-housekeeping/housekeeping.mjs`. Якщо runner ще працює, спочатку зупиніть його
через `Ctrl+C`.

За бажанням перевірте наявність runner-а командою для своєї оболонки:

```bash
test -f practice/task-1-housekeeping/housekeeping.mjs
```

```powershell
Test-Path practice/task-1-housekeeping/housekeeping.mjs
```

У Bash/zsh порожній результат означає успіх; PowerShell має надрукувати `True`.

### 2. Переконайтеся, що правило справді відсутнє

Відкрийте `practice/task-1-housekeeping/PROMPT.md` і знайдіть відповідь на питання:

> Чи забороняє product-ітерація редагувати власний prompt або інші файли control plane?

Зараз — ні. Це і є прогалина, яку ми будемо виправляти. Не додавайте правило руками:
reflection має спочатку довести його eval-ом.

### 3. Відтворіть evidence

У папці практики є `JOURNAL.example.jsonl` із двома однаковими виміряними провалами. Скопіюйте
його в робочий journal.

macOS/Linux:

```bash
cp practice/task-4-self-improvement/JOURNAL.example.jsonl \
  practice/task-4-self-improvement/JOURNAL.jsonl
```

PowerShell:

```powershell
Copy-Item practice/task-4-self-improvement/JOURNAL.example.jsonl `
  practice/task-4-self-improvement/JOURNAL.jsonl
```

Перевірте:

```bash
git status --short
```

Команда має мовчати: `JOURNAL.jsonl` gitignored. Кожен рядок містить лише lane і результат,
достатні для рішення runner-а. Це контрольована навчальна подія, а не самозвіт моделі.

## Фаза 2 — навчити runner бачити trigger

Відкрийте створений у задачі 1 `practice/task-1-housekeeping/housekeeping.mjs`.

### 4. Додайте мінімальну конфігурацію

Розширте імпорт із `node:fs`:

```js
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
```

Замініть назву гілки:

```js
const BRANCH = 'workshop/self-improvement';
```

Після `PROMPT_FILE` додайте:

```js
const SELF_DIR = 'practice/task-4-self-improvement';
const JOURNAL = `${SELF_DIR}/JOURNAL.jsonl`;
const REFLECT_PROMPT_FILE = `${SELF_DIR}/REFLECT_PROMPT.md`;
const REFLECT_EVAL = `${SELF_DIR}/eval.mjs`;
const REFLECT_ALLOWED = new Set([PROMPT_FILE, REFLECT_EVAL]);
const reflectOnly = process.argv.includes('--reflect-only');
```

Окрема гілка ізолює вправу від `chore/housekeeping`. `--reflect-only` пізніше дозволить
виконати один reflection-прохід без product work.

Checkpoint:

```bash
node --check practice/task-1-housekeeping/housekeeping.mjs
```

Порожня відповідь означає, що перший чанк синтаксично правильний.

### 5. Збережіть виміряну причину failure

У `rollback()` замініть останній рядок:

```js
return `failure:${reason}`;
```

Раніше всі провали повертали однакове слово `failure`. Тепер runner може відрізнити два
повтори тієї самої проблеми від двох різних проблем.

### 6. Додайте journal

Перед `workOnce()` додайте читання й запис фактів:

```js
const readJournal = () =>
  existsSync(JOURNAL)
    ? readFileSync(JOURNAL, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
    : [];

const record = (lane, result) => {
  appendFileSync(JOURNAL, `${JSON.stringify({ lane, result })}\n`);
};
```

Тепер додайте detector:

```js
const pendingWorkFailures = () => {
  const entries = readJournal();
  const lastSuccess = entries.findLastIndex(
    (entry) => entry.lane === 'reflection' && entry.result === 'reflected',
  );
  return entries
    .slice(lastSuccess + 1)
    .filter((entry) => entry.lane === 'work')
    .slice(-2);
};

const shouldReflect = () => {
  const last = pendingWorkFailures();
  return last.length === 2
    && last.every((entry) => entry.result.startsWith('failure:'))
    && last[0].result === last[1].result;
};
```

Прочитайте detector зверху вниз на наших двох рядках:

1. успішної reflection ще не було;
2. після неї залишаються два `work`-записи;
3. обидва є однаковими failure;
4. отже, `shouldReflect()` поверне `true`.

Успішна reflection стане межею: старі failure більше не запускатимуть її повторно.

Checkpoint:

```bash
node --check practice/task-1-housekeeping/housekeeping.mjs
git status --short
```

У status має бути лише змінений runner. Journal там не з'являється.

## Фаза 3 — виконати одну reflection-ітерацію

### 7. Підготуйте prompt із evidence

Після `workOnce()` додайте дві маленькі допоміжні функції:

```js
const reflectionPrompt = () => `${readFileSync(REFLECT_PROMPT_FILE, 'utf8')}

## Evidence з journal
${pendingWorkFailures().map((entry) => JSON.stringify(entry)).join('\n')}`;

const changedSince = (sha) =>
  git(ROOT, 'diff', '--name-only', `${sha}..HEAD`).split('\n').filter(Boolean);
```

Перша передає моделі лише два pending failure. Друга читає реальний diff із Git — звіту
моделі про змінені файли ми не довіряємо.

### 8. Додайте контрольований reflection-прохід

Нижче додайте:

```js
const reflectOnce = () => {
  const sha = git(ROOT, 'rev-parse', 'HEAD');
  console.log(`\n--- reflection · ${sha.slice(0, 7)} ---`);

  const agent = run(agentBin, [...agentArgs, reflectionPrompt()], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (!agent.ok) return rollback(sha, `reflection agent: код ${agent.status ?? 'невідомо'}`);
  if (branch() !== BRANCH) stop('reflection agent перемкнув гілку — потрібне ручне втручання');
  if (status()) return rollback(sha, 'reflection agent залишив незакомічені зміни');

  const commits = Number(git(ROOT, 'rev-list', '--count', `${sha}..HEAD`));
  if (commits !== 1) return rollback(sha, `reflection commit count: ${commits}`);

  const changed = changedSince(sha);
  if (changed.length !== REFLECT_ALLOWED.size || changed.some((path) => !REFLECT_ALLOWED.has(path))) {
    return rollback(sha, `reflection вийшов за allowlist: ${changed.join(', ')}`);
  }

  const before = run('node', [REFLECT_EVAL, '--ref', sha], { cwd: ROOT, stdio: 'inherit' });
  if (before.status !== 1) return rollback(sha, `старий prompt: очікували RED=1, маємо ${before.status}`);
  if (!exec('node', [REFLECT_EVAL])) return rollback(sha, 'eval червоний на новому prompt');
  if (!exec('npm', ['run', 'verify', '--', '--skip-e2e'])) return rollback(sha, 'ворота червоні');

  console.log(`reflection: зелено → ${git(ROOT, 'log', '-1', '--oneline')}`);
  return 'reflected';
};
```

Функція має три незалежні ворота:

1. агент завершив роботу одним чистим комітом;
2. коміт змінив рівно два дозволені файли;
3. той самий eval червоніє на старому prompt, зеленіє на новому й не ламає репозиторій.

### 9. Додайте тимчасову точку входу

Одразу після `reflectOnce()` додайте:

```js
if (reflectOnly) {
  if (!shouldReflect()) stop('немає двох однакових work failure для reflection');
  const result = reflectOnce();
  record('reflection', result);
  process.exit(result === 'reflected' ? 0 : 1);
}
```

Поки що reflection ще не є частиною основного циклу. Ми навмисно запускаємо її окремо, щоб
побачити весь RED → GREEN прохід без наступної product-ітерації.

Перевірте й зафіксуйте готову ручну смугу:

```bash
node --check practice/task-1-housekeeping/housekeeping.mjs
git add practice/task-1-housekeeping/housekeeping.mjs
git commit -m "chore(self-improvement): add reflection pass"
```

### 10. Запустіть один reflection-прохід

```bash
node practice/task-1-housekeeping/housekeeping.mjs --reflect-only
```

Очікуємо один новий коміт, який змінив housekeeping prompt і створив `eval.mjs`. Runner сам
відхилить результат, якщо старий prompt не дає RED або новий не дає GREEN.

Перевірте результат:

```bash
git diff --name-only HEAD~1..HEAD
node practice/task-4-self-improvement/eval.mjs --ref HEAD~1
node practice/task-4-self-improvement/eval.mjs
git status --short
```

Перша eval-команда має показати RED і завершитися з кодом `1`; це очікуваний negative control.
Друга має показати GREEN і код `0`. У diff мають бути рівно:

```text
practice/task-1-housekeeping/PROMPT.md
practice/task-4-self-improvement/eval.mjs
```

## Фаза 4 — під'єднати reflection до loop

Ми вже довели один reflection-прохід. Тепер автоматизуємо лише його запуск.

### 11. Зробіть product prompt hot-reloadable

Видаліть глобальне читання:

```js
const prompt = readFileSync(PROMPT_FILE, 'utf8');
```

І додайте його першим рядком усередині `workOnce()`:

```js
const workOnce = (iteration) => {
  const prompt = readFileSync(PROMPT_FILE, 'utf8');
```

Наступний product-прохід тепер прочитає policy з reflection-коміту без рестарту процесу.

### 12. Замініть тимчасову точку входу на дві смуги

Видаліть блок `if (reflectOnly) { ... }` із кроку 9 і поставте на його місце:

```js
const cycleOnce = (iteration) => {
  if (shouldReflect()) {
    const reflection = reflectOnce();
    record('reflection', reflection);
    if (reflectOnly || reflection.startsWith('failure:')) return reflection;
  }

  const work = workOnce(iteration);
  record('work', work);
  return work;
};

if (reflectOnly && !shouldReflect()) stop('немає двох однакових work failure для reflection');
```

У головному `while` замініть:

```js
const result = workOnce(iteration);
failures = result === 'failure' ? failures + 1 : 0;

if (once && result === 'failure') stop('один прохід завершився провалом');
```

на:

```js
const result = cycleOnce(iteration);
failures = result.startsWith('failure:') ? failures + 1 : 0;

if (reflectOnly) process.exit(result === 'reflected' ? 0 : 1);
if (once && result.startsWith('failure:')) stop('один прохід завершився провалом');
```

Normal mode спочатку виконує pending reflection, а після GREEN одразу переходить у
`workOnce()`. Режим `--reflect-only` зупиняється після control-plane коміту й не торкається
продукту.

Checkpoint:

```bash
node --check practice/task-1-housekeeping/housekeeping.mjs
git add practice/task-1-housekeeping/housekeeping.mjs
git commit -m "chore(self-improvement): connect reflection loop"
```

Не запускайте `--reflect-only` удруге: успішна reflection уже спожила два навчальні failure,
тому detector правильно відповість, що нових evidence немає.

## Фаза 5 — перевірити замкнений контур

```bash
node practice/task-4-self-improvement/eval.mjs
git diff --exit-code chore/housekeeping...HEAD -- src tests
git status --short
npm run verify
```

Друга команда має мовчати: практика не змінила product-код або product-тести.

Готово, якщо:

- journal містить два `work failure` і наступний запис `reflection: reflected`;
- reflection-коміт змінив рівно prompt та eval;
- eval відтворює RED на старому prompt і GREEN на новому;
- product-код не змінився;
- runner перечитує prompt усередині `workOnce()`;
- повні ворота зелені.

На воркшопі normal mode не запускаємо. Ми окремо довели control plane; наступна справжня
product-ітерація вже автоматично підхопить покращене правило.
