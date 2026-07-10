// doctor.mjs — інвентар середовища: що РЕАЛЬНО стоїть на цій машині.
//
// Це не інсталятор і не список побажань. Ворота і хуки деградують МОВЧКИ, коли бракує
// бінарника: без `node_modules` ESLint-хук стає no-op і пропускає будь-який код, без
// `claude` не підіймається жоден субагент. Doctor робить цю тишу видимою до того, як
// хтось півгодини шукає, чому «ворота зелені, а нічого не перевіряється».
//
// Критичне (node, npm, git, node_modules) → exit 1 і точна команда лікування.
// Опційне (claude, codex, copilot, cursor-agent) → ⚠ і рядок про те, що саме без нього вимикається.

// ⚠ `process` і `console` — явним імпортом, а не з глобалів. Так файл лишається зеленим під
// eslint незалежно від того, чи роздає конфіг node-глобали розширенню `.mjs`: блок із
// `globals.node` в eslint.config.js довго покривав лише `**/*.js`, і кожен `.mjs` падав у `no-undef`.
import process from 'node:process';
import console from 'node:console';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { run, repoRoot } from './lib.mjs';

const ROOT = repoRoot(import.meta.url);

const SEMVER = /\d+\.\d+\.\d+(?:[-+][\w.-]+)?/;

// Колір лише в живому терміналі: у пайпі й у CI ANSI-коди осідають у логах як сміття.
const COLOR = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code, text) => (COLOR ? `\u001b[${code}m${text}\u001b[0m` : text);
const OK = () => paint(32, '✓');
const WARN = () => paint(33, '⚠');
const BAD = () => paint(31, '✗');

/**
 * Версія з ПЕРШОГО непорожнього рядка: `git version 2.50.1 (Apple Git-155)` → `2.50.1`,
 * `codex-cli 0.142.4` → `0.142.4`, `2.1.205 (Claude Code)` → `2.1.205`.
 *
 * ⚠ Саме перший рядок, а не «останній semver у виводі». `gh --version` другим рядком друкує
 * URL релізу (`.../releases/tag/v2.89.0`), і жадібний пошук по всьому виводу витяг би версію
 * з посилання. Сьогодні вона збігається з реальною, а завтра — ні.
 */
function firstLineSemver(out) {
  const line = out.split('\n').find((l) => l.trim());
  const found = line ? line.match(SEMVER) : null;
  return found ? found[0] : null;
}

/** `">=20"` → `[20]`; `">=20.11.0"` → `[20, 11, 0]`. Порівнюємо рівно стільки чисел, скільки задано. */
function parseMin(range) {
  const nums = range.match(/\d+/g);
  return nums ? nums.map(Number) : null;
}

/** Чи задовольняє `actual` мінімум `min`. Покомпонентно, а не по мажору: `>=20.11` ≠ `>=20`. */
function satisfies(actual, min) {
  const have = (actual.match(/\d+/g) ?? []).map(Number);
  for (let i = 0; i < min.length; i += 1) {
    const part = have[i] ?? 0;
    if (part > min[i]) return true;
    if (part < min[i]) return false;
  }
  return true;
}

/** Вимога до Node — з `engines.node`, а не з голови: package.json лишається єдиним джерелом. */
function readEnginesNode() {
  const manifest = join(ROOT, 'package.json');
  if (!existsSync(manifest)) return null;
  try {
    const parsed = JSON.parse(readFileSync(manifest, 'utf8'));
    return parsed.engines && parsed.engines.node ? parsed.engines.node : null;
  } catch {
    return null; // побитий package.json — не привід падати зі стектрейсом
  }
}

const TOOLS = [
  {
    label: 'npm',
    cmd: 'npm',
    args: ['-v'],
    critical: true,
    fix: 'npm їде разом із Node.js → перевстанови Node (nodejs.org) або `brew install node`',
  },
  {
    label: 'git',
    cmd: 'git',
    args: ['--version'],
    critical: true,
    fix:
      process.platform === 'darwin'
        ? 'brew install git  (якщо brew ще немає — виконай macOS-підготовку з README.md)'
        : 'встанови git пакетним менеджером (напр. `apt install git`)',
  },
  { label: 'claude', cmd: 'claude', args: ['--version'], hint: '(опційно: implement, loop та behavioral eval)' },
  { label: 'codex', cmd: 'codex', args: ['--version'], hint: '(опційно: implement, loop та behavioral eval)' },
  { label: 'copilot', cmd: 'copilot', args: ['--version'], hint: '(опційно: loop та behavioral eval)' },
  { label: 'cursor-agent', cmd: 'cursor-agent', args: ['--version'], hint: '(опційно: implement, loop та behavioral eval)' },
];

const rows = [];
const fixes = []; // критичні проблеми — кожна з точною командою лікування
let missingOptional = 0;

rows.push({ label: 'платформа', value: `${process.platform} ${process.arch}` });

// Версія інтерпретатора, який ЗАРАЗ виконує цей файл, а не `node` із PATH. Ворота і хуки
// успадкують саме його, тож питати PATH означало б звіряти не той node.
const engines = readEnginesNode();
const min = engines ? parseMin(engines) : null;
const nodeOk = min ? satisfies(process.versions.node, min) : true;

rows.push({
  label: 'node',
  value: process.version,
  mark: nodeOk ? OK() : BAD(),
  hint: engines ? `(потрібно ${engines.replace('>=', '≥ ')})` : '(вимогу не звірив: немає engines.node)',
});

if (!engines) {
  fixes.push(`engines.node: не читається ${join(ROOT, 'package.json')} → запусти doctor у клоні репо`);
} else if (!nodeOk) {
  fixes.push(`node ${process.version} старіший за ${engines} → nvm use  (версія лежить у .nvmrc)`);
}

for (const tool of TOOLS) {
  const res = run(tool.cmd, tool.args);

  // ⚠ Відсутній бінарник — це не виняток: spawnSync віддає status:null і порожній out, а run()
  // ніколи не кидає. «Немає» і «є, але впав» тут навмисно зливаються в один випадок: обидва
  // означають рівно одне — цією командою користуватись не можна.
  if (!res.ok) {
    if (tool.critical) {
      rows.push({ label: tool.label, value: 'немає', mark: BAD(), hint: tool.hint });
      fixes.push(`${tool.label}: ${tool.fix}`);
    } else {
      missingOptional += 1;
      rows.push({ label: tool.label, value: 'немає', mark: WARN(), hint: tool.hint });
    }
    continue;
  }

  // Бінарник відповів, але вивід не розібрався — це «є, версія невідома», а не «немає».
  rows.push({ label: tool.label, value: firstLineSemver(res.out) ?? '?', mark: OK(), hint: tool.hint });
}

// ⚠ `existsSync`, а не `npm ls`: `npm ls` обходить усе дерево, галасує про peer-залежності і
// коштує секунди. Питання ж бінарне — чи є куди резолвити `eslint` і `vitest`.
const hasModules = existsSync(join(ROOT, 'node_modules'));
rows.push({
  label: 'node_modules',
  value: '',
  mark: hasModules ? OK() : BAD(),
  hint: '(без них не запуститься жодне з воріт)',
});
if (!hasModules) fixes.push('node_modules: npm ci');

// ⚠ padEnd рахує символи, а не ширину на екрані, тож ANSI-послідовності в позначці зсунули б
// колонки. Тому вирівнюємо лише безбарвні `label` і `value`, а позначку клеїмо після них.
const labelWidth = Math.max(...rows.map((r) => r.label.length));
const valueWidth = Math.max(...rows.map((r) => (r.value ?? '').length));

console.log(`\ndoctor · ${ROOT}\n`);
for (const row of rows) {
  const cells = `${row.label.padEnd(labelWidth)}  ${(row.value ?? '').padEnd(valueWidth)}`;
  const tail = [row.mark, row.hint].filter(Boolean).join(' ');
  console.log(`  ${tail ? `${cells}  ${tail}` : cells.trimEnd()}`);
}
console.log('');

if (fixes.length > 0) {
  console.error(`doctor FAIL — бракує критичного (${fixes.length}). Полагодь так:`);
  for (const fix of fixes) console.error(`  ${fix}`);
  process.exit(1);
}

console.log(
  missingOptional > 0
    ? `doctor OK — критичне на місці. Опційного бракує: ${missingOptional} (дивись ⚠ вище).`
    : 'doctor OK — усе на місці.',
);
process.exit(0);
