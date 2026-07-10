// ralph.mjs — сліпий луп над ОДНІЄЮ фічею цього репо.
//
// Цикл навмисно дурний: він знову і знову згодовує ОДИН промпт агентові в headless-режимі
// (свіжий контекст щоразу), доки модель не створить файл DONE у корені. Усе, що має пережити
// хід, лежить на диску — git, `tasks/tracker.md`, `loop/JOURNAL.md`. Саме тому контекст не
// гниє на довгих прогонах: ітерація не пам'ятає попередню, вона її ЧИТАЄ.
//
// ЗАПУСК (з кореня репо, на власній гілці):
//
//   git checkout -b feat/qr-codes
//   npm run ralph -- --dry-run                     димова перевірка, 0 токенів
//   npm run ralph -- --feature qr-codes --dry-run  ціль і метрика, 0 токенів
//   npm run ralph -- --feature qr-codes            справжній прогін
//   MAX_ITER=3 npm run ralph -- --feature custom-alias
//
// Ціль задається ЛИШЕ через `--feature <slug>`. Ранер не вгадує, що робити далі: черга — це
// рішення людини, і воно живе в `docs/roadmap.md`, який читають очима.
//
// ── ТРИ ЖОРСТКІ ЗУПИНКИ ──────────────────────────────────────────────────────────────
// Критерій «готово» тут — судження МОДЕЛІ про себе: вона сама створює DONE. Без запобіжників
// це генератор рахунків, а не ранер. Тому цикл ніколи не крутиться нескінченно:
//
//   1. Ліміт ітерацій     MAX_ITER=6          не більше N кругів
//   2. K провалів поспіль K_FAILURES=3        гейт червоний K разів підряд → стоп
//   3. Немає прогресу     NO_IMPROVEMENT=2    метрика не зросла N ітерацій → плато
//
// Третя — найцікавіша. Ліміт ітерацій каже «досить крутитись». No-improvement stop каже
// «крутитись більше НЕМАЄ СЕНСУ»: метрика вийшла на плато. Саме він ловить агента, який
// уперся в питання, на яке не має права відповісти сам.
//
// ⚠ Зупинки по бюджету тут немає — і це рішення, а не недогляд. Вартість ходу приходить уже
// ПІСЛЯ того, як її витрачено, тож бюджет був зупинкою, а не стелею: виміряно $1.93 при
// BUDGET_USD=1. Справжня стеля — MAX_ITER: він спрацьовує ДО виклику агента. Заразом зникла
// й єдина причина парсити stream-json, а з нею — і вся таблиця адаптерів під кожен інструмент.
//
// ── ЩО САМЕ Є МЕТРИКОЮ ───────────────────────────────────────────────────────────────
// Скільки рядків `done` у трекері ЦІЄЇ фічі. Факт із диска, не думка моделі про себе. Трекери
// інших пакетів метрику не рухають: чужий прогрес не має права ховати наше плато.
//
// ── ПАМ'ЯТЬ МІЖ ІТЕРАЦІЯМИ ───────────────────────────────────────────────────────────
// Агент наприкінці ходу дописує в `loop/JOURNAL.md`: що зробив, на чому спіткнувся, що варто
// знати наступному. Хук `.claude/hooks/loop-memory.mjs` на SessionStart виливає цей журнал у
// контекст наступної ітерації — разом зі свіжими фактами з git і трекера, які рахує сам.
// Ранер тут лише започатковує журнал заголовком прогону.
//
// ── КОДИ ВИХОДУ ──────────────────────────────────────────────────────────────────────
//   0  модель створила DONE (або --dry-run відпрацював)
//   1  спрацювала жорстка зупинка
//   2  конфігурація зламана: немає PROMPT.md, лежить старий DONE, невідомий slug, не передано
//      --feature, режим acceptEdits, HEAD на main, брудне дерево
//   3  у трекері цілі не лишилось жодного `todo` — робити нема чого

import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { git, repoRoot, run } from '../scripts/lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = repoRoot(import.meta.url);

// ── АГЕНТ ────────────────────────────────────────────────────────────────────────────
//
// Розкоментуй ОДИН рядок. Промпт ранер додає ОСТАННІМ аргументом — тому порядок прапорців тут
// не косметика: у `copilot` промпт стає ЗНАЧЕННЯМ `-p`, тому рядок закінчується саме на `-p`.
// Права агента живуть тут-таки: окремої змінної PERMISSION_MODE більше немає.
//
// Усі чотири рядки виміряні живим прогоном, а не взяті з доків.
//
// ⚠ `-p` означає різне: у `claude` це «headless», у `copilot` — «промпт», у `cursor-agent` —
// «друкуй у консоль», а в `codex exec` це взагалі `--profile`, і промпт там позиційний.

const AGENT_CMD = process.env.AGENT_CMD ?? 'claude -p --permission-mode auto';
// const AGENT_CMD = process.env.AGENT_CMD ?? 'codex exec --sandbox workspace-write';
// const AGENT_CMD = process.env.AGENT_CMD ?? 'copilot --allow-all-tools -s -p';
// const AGENT_CMD = process.env.AGENT_CMD ?? 'cursor-agent --print --force';

const [BIN, ...ARGS] = AGENT_CMD.split(/\s+/);

const MAX_ITER = Number(process.env.MAX_ITER ?? 6);
const K_FAILURES = Number(process.env.K_FAILURES ?? 3);
const NO_IMPROVEMENT = Number(process.env.NO_IMPROVEMENT ?? 2);

const PROMPT_FILE = process.env.PROMPT_FILE ?? join(HERE, 'PROMPT.md');
const JOURNAL = join(HERE, 'JOURNAL.md');
const DONE_FILE = join(ROOT, 'DONE');
const GATE = ['lint', 'test:fast', 'links:check'];

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const allowDirty = argv.includes('--allow-dirty');
const featureAt = argv.indexOf('--feature');
const slug = featureAt === -1 ? null : (argv[featureAt + 1] ?? '');
const TRACKER = join(ROOT, 'docs', 'features', slug ?? '', 'tasks', 'tracker.md');

/** Зламана конфігурація. Не «спробуємо все одно» — зупинка до першого токена. */
const die = (message) => {
  console.error(`ralph: ${message}`);
  process.exit(2);
};

/** Рядки трекера цілі в стані `status`. Це і метрика прогресу, і лічильник todo. */
const count = (status) =>
  existsSync(TRACKER)
    ? [...readFileSync(TRACKER, 'utf8').matchAll(new RegExp(`^\\|\\s*T\\d+\\s*\\|.*\\|\\s*${status}\\s*\\|`, 'gm'))].length
    : 0;

// `run()` з lib тримає інваріант `shell: win32` — без нього `npm.cmd` на Windows не спавниться,
// і гейт мовчки НЕ ЗАПУСКАЄТЬСЯ. Той самий гейт, що в `npm run verify`, тільки без e2e:
// браузер довгий, і його ганяє агент там, де цього вимагає DoD задачі.
const gateIsGreen = () => GATE.every((s) => run('npm', ['run', s], { cwd: ROOT, stdio: 'ignore' }).ok);

// ⚠ `HEAD` — це не ім'я гілки, а відповідь git на «ти в detached HEAD».
const branch = () => git(ROOT, 'rev-parse', '--abbrev-ref', 'HEAD');
const treeIsDirty = () => git(ROOT, 'status', '--porcelain').length > 0;

/** Секція, яку ранер дописує до статичного PROMPT.md. Плейсхолдерів і шаблонізатора немає. */
const targetSection = (iteration) =>
  ['', '## Ціль цього прогону', '', `**Ітерація:** ${iteration} з ${MAX_ITER}`, `**Slug:** \`${slug}\``,
    `**Трекер:** \`docs/features/${slug}/tasks/tracker.md\``, `**Епік:** \`docs/features/${slug}/tasks/_epic.md\``,
    `**Специфікація:** \`docs/features/${slug}/spec.md\``, `**Гілка:** \`${branch()}\` — ти вже на ній, не перемикайся.`,
    ''].join('\n');

/**
 * Один хід. Жодних адаптерів: усім агентам `stdio: 'inherit'`, промпт останнім аргументом.
 * Різницю між інструментами тримає рядок AGENT_CMD, а не гілка коду.
 */
const runAgent = (prompt) =>
  new Promise((done) => {
    // ⚠ Хук на SessionStart не має звідки дізнатись, чий трекер читати. Крім цього рядка.
    const env = { ...process.env, RALPH_FEATURE: slug };
    const child = spawn(BIN, [...ARGS, prompt], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32', env });
    // Агент, якого немає в PATH, інакше виглядав би як тихий успішний хід.
    child.on('error', (err) => done({ ok: false, why: err.message }));
    // ⚠ Код виходу читаємо ОБОВ'ЯЗКОВО. Інакше агент, який навіть не стартував,
    // виглядає як успішний хід, і луп крутить порожні ітерації «без прогресу».
    child.on('close', (code) => done({ ok: code === 0, why: `код виходу ${code}` }));
  });

// ── Перевірки, спільні для сухого і справжнього прогону ──────────────────────────────

if (!existsSync(PROMPT_FILE)) die(`немає ${PROMPT_FILE} — лупу нема що згодовувати агентові`);
if (existsSync(DONE_FILE)) die('DONE уже лежить у корені — цикл вийшов би одразу. Прибери його: rm -f DONE');
if (featureAt !== -1 && !existsSync(TRACKER)) die(`немає ${TRACKER} — пакета «${slug}» у репо не існує`);

// ⚠ Зупинка, задана сміттям, — це зупинка, якої немає. `MAX_ITER=abc` дає NaN, а `i >= NaN`
// завжди хибне: єдина справжня стеля лупа мовчки зникає, і він крутиться за реальні гроші.
for (const [name, value] of [['MAX_ITER', MAX_ITER], ['K_FAILURES', K_FAILURES], ['NO_IMPROVEMENT', NO_IMPROVEMENT]]) {
  if (!Number.isInteger(value) || value < 0) die(`${name}=${process.env[name]} — мусить бути невід'ємним цілим`);
}

// ── Сухий прогін ─────────────────────────────────────────────────────────────────────
//
// ⚠ Він існує рівно тому, що `npm run verify` мусить ганяти ранер БЕЗ захардкодженого slug'а.
// Ворота, у які зашито ім'я пакета, ламаються того дня, коли той пакет заshipиться, — і тоді
// зелене репо показує червоне, бо беклог доробили. Це не ворота, а міна.

if (dryRun) {
  console.log(`  агент:    ${AGENT_CMD}`);
  console.log(`  промпт:   ${PROMPT_FILE}`);
  console.log(`  ціль:     ${slug ? `${slug}: ${count('done')} done, ${count('todo')} todo` : 'не задано (--feature <slug>)'}`);
  console.log(`  трекер:   ${slug ? TRACKER : '—'}`);
  console.log(`  гілка:    ${branch()} · дерево ${treeIsDirty() ? 'брудне' : 'чисте'}`);
  console.log(`  старт:    ${branch() === 'main' ? 'не готовий — створи окрему гілку' : treeIsDirty() ? 'не готовий — закоміть або прибери зміни' : 'готовий'}`);
  console.log(`  зупинки:  MAX_ITER=${MAX_ITER} · K_FAILURES=${K_FAILURES} · NO_IMPROVEMENT=${NO_IMPROVEMENT}`);
  console.log('  Жодного токена не витрачено. Прибери --dry-run, щоб поїхало насправді.');
  process.exit(0);
}

// ── Перевірки справжнього прогону ────────────────────────────────────────────────────

if (!slug) die('ціль не задано — передай --feature <slug>; список пакетів: ls docs/features/');

// ⚠ `acceptEdits` дозволяє правити файли і НЕ дозволяє Bash. У headless підтвердити нікому, тож
// агент не запустить ні тесту, ні `git commit`. Виміряно живим прогоном: `node -e "console.log(1)"`
// віддає «This command requires approval». Цикл RED → GREEN → GATE → COMMIT там нездійсненний,
// а ітерація коштує реальних грошей — тож ловимо це до першого токена.
if (AGENT_CMD.includes('acceptEdits')) die('acceptEdits — агент правитиме файли, але не запустить ані тесту, ані `git commit`. Постав auto.');

// Гілку створює ЛЮДИНА. Скрипт у git не пише взагалі — він лише відмовляється працювати на main.
if (branch() === 'main') die(`HEAD на main — створи гілку: git checkout -b feat/${slug}`);

// ⚠ Брудне дерево перевіряємо лише тут. У сухому прогоні воно нікому не заважає, а `verify`
// ганяє саме сухий — інакше ворота червоніли б від будь-якої незбереженої правки.
if (!allowDirty && treeIsDirty()) {
  die('робоче дерево брудне — закоміть або сховай зміни, або передай --allow-dirty');
}

if (count('todo') === 0) {
  console.log(`ralph: у трекері ${slug} не лишилось жодного todo — робити нема чого`);
  process.exit(3);
}

// ── Цикл ─────────────────────────────────────────────────────────────────────────────

let iteration = 0;

const stop = (code, reason) => {
  console.log(`\n=== СТОП: ${reason} (ітерацій: ${iteration}) ===`);
  process.exit(code);
};

console.log(`ralph: ціль ${slug} (todo: ${count('todo')}, done: ${count('done')}), гілка ${branch()}`);

// Дописуємо, не перезаписуємо: прогін, перерваний Ctrl-C і продовжений, не має втрачати
// уроки попередніх ходів.
appendFileSync(JOURNAL, `\n## Прогін ${new Date().toISOString()} — ціль \`${slug}\`, гілка \`${branch()}\`\n`);

process.on('SIGINT', () => {
  console.log(`\nПерервано на ітерації ${iteration}. Стан на диску — дивись git status.`);
  process.exit(130);
});

let failures = 0;
let best = count('done');
let stagnant = 0;

while (!existsSync(DONE_FILE)) {
  // Зупинка 1 спрацьовує ДО виклику агента: `MAX_ITER=0` не має лишати по собі ані токена.
  if (iteration >= MAX_ITER) stop(1, `ліміт ітерацій (MAX_ITER=${MAX_ITER}) вичерпано без DONE`);
  iteration += 1;
  console.log(`\n--- ітерація ${iteration}/${MAX_ITER} ---`);

  // Промпт будуємо щоітерації: номер ходу мусить бути в тексті, інакше агент його вгадує.
  // Холодний старт щоходу: жодного накопиченого контексту. Модель перечитує промпт, журнал
  // (його вливає SessionStart-хук) і реальний стан репо з нуля.
  const { ok, why } = await runAgent(readFileSync(PROMPT_FILE, 'utf8') + targetSection(iteration));
  // Агент, що впав, — це не «ітерація без прогресу», це зламаний ранер. Мовчати не можна.
  if (!ok) stop(1, `агент «${AGENT_CMD}» не відпрацював: ${why}`);

  // Зупинка 2: K провалів гейта поспіль. Зелений хід не може зупинити луп — навіть при K=0.
  const green = gateIsGreen();
  failures = green ? 0 : failures + 1;
  if (!green && failures >= K_FAILURES) stop(1, `гейт червоний ${K_FAILURES} ітерацій поспіль`);

  // Зупинка 3: метрика вийшла на плато. Так само: ітерація, що дала прогрес, лупа не спиняє.
  const done = count('done');
  const improved = done > best;
  best = Math.max(best, done);
  stagnant = improved ? 0 : stagnant + 1;
  console.log(`  ${slug}: ${done} done, ${count('todo')} todo · гейт ${green ? 'зелений' : `червоний (${failures}/${K_FAILURES})`}`);
  if (!improved && stagnant >= NO_IMPROVEMENT) stop(1, `немає прогресу ${NO_IMPROVEMENT} ітерацій поспіль — метрика на плато`);

  await sleep(1000); // щоб Ctrl-C між ходами спрацьовував надійно
}

stop(0, 'модель створила DONE');
