// check-tools.mjs — ворота над крос-туловими копіями скіла й деклараціями рев'юера.
//
// Навіщо окремі ворота. Скіл `implement` вендорено в ЧОТИРИ теки (по одній на інструмент), а
// рев'юера задекларовано в П'ЯТИ синтаксисах. Прибери фразу «RED first, always» з `.cursor/`,
// і користувач Cursor дістане мовчки деградований скіл, а CI лишиться зеленим: копія, яку
// ніхто не перевіряє, — це вже не копія, а форк, що чекає нагоди розійтись.
//
// Що перевіряємо:
//   1. Фрази-опори скіла `implement` живі в усіх чотирьох теках, а не лише в `.claude/`.
//   2. Рев'юер read-only в усіх п'яти синтаксисах — і, як контроль, імплементер записуваний.
//   3. Кожен `npm run X`, названий у будь-якому `.md`, існує в package.json.
//   4. AGENTS.md називає всі ворота з package.json — ворота, про які агент не прочитає,
//      він не запустить.
//
//   npm run tools:check

// ⚠ Друк тут не наш: усе йде через `Verdict` (`v.ok` / `v.fail` → `v.report()`). Тому ні
// `console`, ні `process` цей файл не чіпає — і `no-undef` йому не страшний незалежно від того,
// чи покриває `eslint.config.js` вже `**/*.mjs`, чи ще тільки `**/*.js`.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { repoRoot, Verdict } from './lib.mjs';

const REPO = repoRoot(import.meta.url);
const rel = (path) => relative(REPO, path);
const v = new Verdict('tools:check');

// ── Спільні дрібниці ─────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', '.git']);

// ⚠ `loop/JOURNAL.md` пише АГЕНТ — це його чернетка, а не документація. Ворота обходять файлову
// систему, а не git, тож `.gitignore` їх не стримує. Агент, який чесно запише «падало
// `npm run qr`», завалив би цю перевірку власним звітом про поламану команду. Та сама причина
// і той самий виняток є в `check-links.mjs`.
const JOURNAL = join(REPO, 'loop', 'JOURNAL.md');

/** Усі `.md` під `dir`, рекурсивно, у стабільному порядку. */
function mdFiles(dir) {
  const found = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const path = join(d, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path);
      } else if (entry.name.endsWith('.md') && path !== JOURNAL) {
        found.push(path);
      }
    }
  };
  walk(dir);
  return found.sort();
}

/**
 * Ключі верхнього рівня з YAML-фронтматера.
 *
 * ⚠ Рядок вважаємо ключем, ЛИШЕ якщо він починається не з пробілу. `description: >` тягне за
 * собою відступлений абзац прози, а в прозі теж бувають двокрапки. Наївний `split(':')` по
 * кожному рядку зробив би з них ключі — і випадкове «tools:» усередині опису затерло б справжній.
 */
function frontmatter(path) {
  const lines = readFileSync(path, 'utf8').split('\n');
  if (lines[0]?.trim() !== '---') return {};

  const fields = {};
  for (const line of lines.slice(1)) {
    if (line.trim() === '---') break;
    if (/^\s/.test(line)) continue;
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    fields[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
  }
  return fields;
}

/** `Read, Grep, Glob` і `[read, search, execute]` — до одного списку. */
function toolList(value = '') {
  return value
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map((tool) => tool.trim())
    .filter(Boolean);
}

/** Читає файл або реєструє провал і повертає `null` — щоб виклик не впав на відсутньому шляху. */
function readOrFail(path, why) {
  if (existsSync(path)) return readFileSync(path, 'utf8');
  v.fail(`${rel(path)}: файлу немає — ${why}`);
  return null;
}

// ── 1. Фрази-опори скіла `implement` в усіх чотирьох теках ───────────────────────
// Одна тека на інструмент. Імена різні, зміст мусить бути той самий.
const SKILL_DIRS = [
  '.claude/skills/implement', // Claude Code
  '.agents/skills/sdd-implement', // Antigravity (відкритий формат Agent Skills)
  '.cursor/skills/sdd-implement', // Cursor
  '.github/skills/sdd-implement', // GitHub Copilot
];

// Та сама трійка, яку `BREAK=1` прибирає в `eval/lint.mjs`: це правила ДИСЦИПЛІНИ, без яких TDD
// вироджується в «напиши код, потім тест, який випадково зелений». Формулювання можна міняти —
// але свідомо, разом із цим списком і з усіма чотирма теками одночасно.
const SKILL_INVARIANTS = {
  'RED first, always': 'анти-патерн «код до тесту»',
  'never make a test less strict': 'заборона послаблювати тест заради зеленого',
  'RED is load-bearing': 'RED — не формальність, а несуча стіна циклу',
};

for (const dir of SKILL_DIRS) {
  const abs = join(REPO, dir);
  if (!existsSync(abs)) {
    v.fail(`${dir}: теки немає — копію скіла для цього інструмента втрачено`);
    continue;
  }

  const files = mdFiles(abs);
  if (files.length === 0) {
    v.fail(`${dir}: жодного .md — тека є, скіла в ній немає`);
    continue;
  }

  // Фраза може жити в SKILL.md або в references/ — стережемо теку, не окремий файл.
  const text = files.map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const [phrase, why] of Object.entries(SKILL_INVARIANTS)) {
    v.check(
      text.includes(phrase),
      `${dir}: "${phrase}" — ${why}`,
      `${dir}: ЗНИКЛО "${phrase}" (${why}); шукали в ${files.length} .md цієї теки, канонічне місце — SKILL.md`
    );
  }
}

// ── 2. Рев'юер read-only у п'яти синтаксисах ─────────────────────────────────────
// ⚠ Механізм у КОЖНОГО інструмента свій. Єдиного ключа `tools:` не існує, і спроба звести їх до
// одного дала б ворота, які зеленіють, бо нічого не знайшли. Тому п'ять окремих перевірок.
//
// Рев'юер, що вміє писати, рано чи пізно «заодно виправить» те, що мав лише описати. Read-only —
// не стиль, а єдине, що робить його вердикт незалежним.

const CLAUDE_WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const COPILOT_WRITE_TOOLS = new Set(['edit', 'write']);

// 2.1 Claude Code — фронтматер `tools:` як кома-список.
const claudeReviewer = join(REPO, '.claude/agents/reviewer.md');
if (readOrFail(claudeReviewer, "рев'юера Claude Code не задекларовано")) {
  const tools = toolList(frontmatter(claudeReviewer).tools);
  // Порожній список — не «read-only», а відсутній allowlist: Claude дасть агенту все підряд.
  // Без цієї перевірки наступна проходила б вхолосту.
  if (
    v.check(
      tools.length > 0,
      `${rel(claudeReviewer)}: allowlist інструментів заданий`,
      `${rel(claudeReviewer)}: немає ключа tools: — без allowlist агент дістає ВСІ інструменти`
    )
  ) {
    const leaked = tools.filter((tool) => CLAUDE_WRITE_TOOLS.has(tool));
    v.check(
      leaked.length === 0,
      `${rel(claudeReviewer)}: read-only (tools: ${tools.join(', ')})`,
      `${rel(claudeReviewer)}: у tools: з'явилось [${leaked.join(', ')}] — read-only гарантія втрачена`
    );
  }
}

// 2.2 Cursor — окремий булів ключ `readonly:`. Ключа `tools:` тут немає взагалі.
const cursorReviewer = join(REPO, '.cursor/agents/sdd-reviewer.md');
if (readOrFail(cursorReviewer, "рев'юера Cursor не задекларовано")) {
  const { readonly } = frontmatter(cursorReviewer);
  v.check(
    readonly === 'true',
    `${rel(cursorReviewer)}: readonly: true`,
    `${rel(cursorReviewer)}: readonly: ${readonly ?? '(ключа немає)'} — Cursor тримає read-only саме цим ключем, а не через tools:`
  );
}

// 2.3 GitHub Copilot — фронтматер `tools:` як YAML-масив у квадратних дужках, імена в нижньому регістрі.
const copilotReviewer = join(REPO, '.github/agents/sdd-reviewer.agent.md');
if (readOrFail(copilotReviewer, "рев'юера GitHub Copilot не задекларовано")) {
  const tools = toolList(frontmatter(copilotReviewer).tools);
  if (
    v.check(
      tools.length > 0,
      `${rel(copilotReviewer)}: allowlist інструментів заданий`,
      `${rel(copilotReviewer)}: немає ключа tools: — без allowlist агент дістає ВСІ інструменти`
    )
  ) {
    const leaked = tools.filter((tool) => COPILOT_WRITE_TOOLS.has(tool.toLowerCase()));
    v.check(
      leaked.length === 0,
      `${rel(copilotReviewer)}: read-only (tools: [${tools.join(', ')}])`,
      `${rel(copilotReviewer)}: у tools: з'явилось [${leaked.join(', ')}] — read-only гарантія втрачена`
    );
  }
}

// 2.4 Codex — TOML, межу тримає пісочниця процесу, а не список інструментів.
const codexReviewer = join(REPO, '.codex/agents/sdd-reviewer.toml');
const codexReviewerText = readOrFail(codexReviewer, "рев'юера Codex не задекларовано");
if (codexReviewerText !== null) {
  v.check(
    /^\s*sandbox_mode\s*=\s*"read-only"\s*$/m.test(codexReviewerText),
    `${rel(codexReviewer)}: sandbox_mode = "read-only"`,
    `${rel(codexReviewer)}: немає рядка sandbox_mode = "read-only" — пісочниця Codex пустить рев'юера писати`
  );
}

// 2.5 Antigravity — відкритий формат skills-only: ключа інструментів немає ВЗАГАЛІ.
// Read-only тут декларується ПРОЗОЮ, і фраза в прозі — єдина опора. Тому стережемо саме фразу.
const antigravityReviewer = join(REPO, '.agents/skills/sdd-implement/agents/reviewer.md');
const antigravityReviewerText = readOrFail(antigravityReviewer, "рев'юера Antigravity не задекларовано");
if (antigravityReviewerText !== null) {
  v.check(
    antigravityReviewerText.includes('no write tools'),
    `${rel(antigravityReviewer)}: проза декларує "no write tools"`,
    `${rel(antigravityReviewer)}: ЗНИКЛА фраза "no write tools" — у цьому форматі немає ключа інструментів, і read-only більше нічим не заявлено`
  );
  // ⚠ Поява `tools:` тут гірша за його відсутність: Antigravity цей ключ ІГНОРУЄ, тож він дав би
  // читачеві хибне відчуття, що межу стереже інструмент, а не абзац прози нижче.
  v.check(
    !('tools' in frontmatter(antigravityReviewer)),
    `${rel(antigravityReviewer)}: ключа tools: немає — саме так і має бути`,
    `${rel(antigravityReviewer)}: з'явився ключ tools:, але Antigravity його ігнорує — це хибне відчуття захисту`
  );
}

// ── Контроль: імплементер МУСИТЬ бути записуваним ────────────────────────────────
// ⚠ Read-only, знайдений усюди, — підозрілий. Якщо парсер зламається і почне повертати порожнечу,
// усі перевірки вище пройдуть вхолосту: «жодного write-інструмента не знайдено» = зелено. Тому
// ті самі парсери на тих самих ключах мусять дати ПРОТИЛЕЖНУ відповідь на імплементері.

const codexImplementer = join(REPO, '.codex/agents/sdd-implementer.toml');
const codexImplementerText = readOrFail(codexImplementer, 'імплементера Codex не задекларовано');
if (codexImplementerText !== null) {
  v.check(
    /^\s*sandbox_mode\s*=\s*"workspace-write"\s*$/m.test(codexImplementerText),
    `${rel(codexImplementer)}: sandbox_mode = "workspace-write" (контроль)`,
    `${rel(codexImplementer)}: немає sandbox_mode = "workspace-write" — або імплементер осліп, або парсер TOML зламався і "read-only" проходить будь-де`
  );
}

const cursorImplementer = join(REPO, '.cursor/agents/sdd-implementer.md');
if (readOrFail(cursorImplementer, 'імплементера Cursor не задекларовано')) {
  const { readonly } = frontmatter(cursorImplementer);
  v.check(
    readonly === 'false',
    `${rel(cursorImplementer)}: readonly: false (контроль)`,
    `${rel(cursorImplementer)}: readonly: ${readonly ?? '(ключа немає)'} — імплементер без запису не зробить GREEN; перевір і парсер фронтматера`
  );
}

const copilotImplementer = join(REPO, '.github/agents/sdd-implementer.agent.md');
if (readOrFail(copilotImplementer, 'імплементера GitHub Copilot не задекларовано')) {
  const tools = toolList(frontmatter(copilotImplementer).tools).map((tool) => tool.toLowerCase());
  v.check(
    tools.includes('edit'),
    `${rel(copilotImplementer)}: tools: містить edit (контроль)`,
    `${rel(copilotImplementer)}: у tools: [${tools.join(', ')}] немає edit — імплементер без запису не зробить GREEN; перевір і парсер масиву`
  );
}

// ── 3. Кожен згаданий `npm run X` існує ──────────────────────────────────────────
// ⚠ Allowlist «приїде пізніше» тут навмисно немає. Команда, названа в доці, але відсутня в
// package.json, — це або друкарська помилка, або мертве посилання, і обидва варіанти читач
// виявить лише тоді, коли команда не запуститься. Дока, яка обіцяє неіснуючі ворота, гірша
// за дóку, яка мовчить.

// ⚠ Хвостові `:`, `-`, `_` зрізаємо: у тексті трапляється «`npm run gate`:» перед двокрапкою
// списку, а жодне справжнє ім'я скрипта на роздільник не закінчується.
const stripTail = (name) => name.replace(/[:_-]+$/, '');
const NPM_RUN = /npm run ([a-z0-9][a-z0-9:_-]*)/g;
const npmRunNames = (text) => [...text.matchAll(NPM_RUN)].map((m) => stripTail(m[1]));

const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
const scriptKeys = Object.keys(pkg.scripts ?? {});
const scripts = new Set(scriptKeys);

let mentions = 0;
let filesWithMentions = 0;

for (const file of mdFiles(REPO)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let hit = false;

  lines.forEach((line, i) => {
    for (const name of npmRunNames(line)) {
      mentions += 1;
      hit = true;
      if (scripts.has(name)) continue;
      v.fail(
        `${rel(file)}:${i + 1}: згадано \`npm run ${name}\`, але такої команди немає в package.json — друкарська помилка або мертва команда`
      );
    }
  });

  if (hit) filesWithMentions += 1;
}

v.ok.push(`npm run: ${mentions} згадок у ${filesWithMentions} .md — усі імена резолвляться`);

// ── 4. AGENTS.md називає всі ворота з package.json ───────────────────────────────
// AGENTS.md — єдине джерело правди для агента. Ворота, про які він там не прочитає, він не
// запустить: для нього їх не існує.
//
// Виняток — команди, які агент не запускає в принципі.
const AGENTS_MD_INTERNAL = {
  dev: 'локальний запуск сервера, а не ворота',
  start: 'прод-ентрипоінт — агент його не піднімає',
  'test:watch': 'інтерактивний вотчер — агент не має де його дивитись',
};

const agentsMd = join(REPO, 'AGENTS.md');
const agentsMdText = readOrFail(agentsMd, 'єдине джерело правди для агента зникло');
if (agentsMdText !== null) {
  // ⚠ Не `includes('npm run test')`: цей підрядок сидить усередині `npm run test:fast`, і
  // перевірка на `test` зеленіла б від згадки `test:e2e`. Тому порівнюємо МНОЖИНИ ІМЕН,
  // а не шукаємо підрядок.
  const mentioned = new Set(npmRunNames(agentsMdText));

  // ⚠ `test` документують як `npm test` — саме так її звуть у npm, і в AGENTS.md вона така.
  if (/\bnpm test\b/.test(agentsMdText)) mentioned.add('test');

  for (const key of scriptKeys) {
    if (key in AGENTS_MD_INTERNAL) continue;
    v.check(
      mentioned.has(key),
      `AGENTS.md: називає ${key}`,
      `AGENTS.md: не згадує \`npm run ${key}\` — ворота, про які агент не прочитає, він не запустить`
    );
  }

  const staleInternal = Object.keys(AGENTS_MD_INTERNAL).filter((key) => !scripts.has(key));
  if (staleInternal.length > 0) {
    v.ok.push(`AGENTS_MD_INTERNAL: ${staleInternal.join(', ')} немає в package.json — рядки чекають на свій крок`);
  }
}

v.report();
