#!/usr/bin/env node

import { copyFileSync, cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../../../scripts/lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');

// Промпт завжди додається останнім аргументом. Для Copilot рядок тому закінчується на `-p`.
const AGENT_CMD = process.env.AGENT_CMD ?? 'claude -p --permission-mode acceptEdits --output-format text';
// const AGENT_CMD = process.env.AGENT_CMD ?? 'codex exec --sandbox workspace-write --ephemeral --color never';
// const AGENT_CMD = process.env.AGENT_CMD ?? 'copilot --allow-all-tools --silent --no-color --no-ask-user -p';
// const AGENT_CMD = process.env.AGENT_CMD ?? 'cursor-agent -p --trust --output-format text';

const [AGENT_BIN, ...AGENT_ARGS] = AGENT_CMD.trim().split(/\s+/);
const SKILL_DIRS = [
  '.claude/skills/review-only',
  '.agents/skills/review-only',
  '.cursor/skills/review-only',
  '.github/skills/review-only',
];
const TASK = `Use the repository's review-only skill exactly as written to review src/shorten.js.
Cite findings as file:line, write the review in English, and finish with exactly one
VERDICT: ACCEPT, VERDICT: WARN, or VERDICT: REJECT.`;

const args = new Set(process.argv.slice(2));
const allowedArgs = new Set(['--broken', '--dry-run', '--self-test', '--help']);
const unknown = [...args].find((arg) => !allowedArgs.has(arg));

function usage(exitCode = 0) {
  console.log(`Usage: node practice/task-3-skill-eval/behavioral/eval.mjs [options]

Options:
  --dry-run    prepare sandbox and validate the selected CLI; spend 0 tokens
  --self-test  test only the grader; spend 0 tokens
  --broken     run with the intentionally broken skill
  --help       show this help

Select another tool with AGENT_CMD, for example:
  AGENT_CMD='codex exec --sandbox workspace-write --ephemeral --color never' node .../eval.mjs`);
  process.exit(exitCode);
}

if (args.has('--help')) usage();
if (unknown) {
  console.error(`Невідомий аргумент: ${unknown}`);
  usage(2);
}
if (args.has('--self-test') && (args.has('--broken') || args.has('--dry-run'))) {
  console.error('--self-test не поєднується з --broken або --dry-run');
  usage(2);
}

// Приймаємо як точний рядок `:3`, так і діапазон `:1-3`, якщо він перетинає дефектні 2–3.
function citesRelevantLine(response) {
  return [...response.matchAll(/src\/shorten\.js:(\d+)(?:-(\d+))?/g)].some((match) => {
    const first = Number(match[1]);
    const last = Number(match[2] ?? match[1]);
    return first <= last && first <= 3 && last >= 2;
  });
}

function inspect(response, { agentOk, headUnchanged, status }) {
  const verdicts = [...response.matchAll(/\bVERDICT:\s*(ACCEPT|WARN|REJECT)\b/g)];
  const explainsScheme = /(scheme|protocol|схем|протокол)/iu.test(response);
  const namesUnsafeInput = /(javascript:|https?:|allowlist|unsafe|небезпеч|дозвол)/iu.test(response);
  const checks = [
    { id: 'agent', passed: agentOk, message: 'agent завершився з кодом 0' },
    {
      id: 'verdict',
      passed: verdicts.length === 1 && verdicts[0][1] === 'REJECT',
      message: 'є рівно один VERDICT: REJECT',
    },
    {
      id: 'finding',
      passed: citesRelevantLine(response) && explainsScheme && namesUnsafeInput,
      message: 'finding цитує рядок або діапазон із дефектом і пояснює небезпечну URL-схему',
    },
    { id: 'head', passed: headUnchanged, message: 'agent не створив жодного коміту' },
    { id: 'status', passed: status === '', message: 'agent не змінив жодного файла' },
  ];
  return { checks, passed: checks.every((check) => check.passed), status };
}

function check(result, id) {
  return result.checks.find((item) => item.id === id)?.passed;
}

function runSelfTest() {
  const facts = { agentOk: true, headUnchanged: true, status: '' };
  const point = 'src/shorten.js:3 accepts the javascript: scheme. VERDICT: REJECT';
  const range = 'src/shorten.js:1-3 accepts an unsafe javascript: protocol. VERDICT: REJECT';
  const wrongRange = 'src/shorten.js:8-9 accepts an unsafe javascript: protocol. VERDICT: REJECT';

  const acceptsPoint = inspect(point, facts).passed;
  const acceptsRange = inspect(range, facts).passed;
  const rejectsWrongRange = !check(inspect(wrongRange, facts), 'finding');
  const rejectsMutation = !check(inspect(range, { ...facts, status: ' M src/shorten.js' }), 'status');
  const cases = [
    [acceptsPoint, 'grader приймає точну цитату :3'],
    [acceptsRange, 'grader приймає релевантний діапазон :1-3'],
    [rejectsWrongRange, 'grader відхиляє нерелевантний діапазон :8-9'],
    [rejectsMutation, 'grader відхиляє зміну файла'],
  ];

  for (const [passed, message] of cases) console.log(`  ${passed ? '✓' : '✗'} ${message}`);
  const passed = cases.every(([ok]) => ok);
  console.log(passed ? '\ngrader self-test PASS' : '\ngrader self-test FAIL');
  if (!passed) process.exitCode = 1;
}

function git(cwd, ...gitArgs) {
  const result = run('git', gitArgs, { cwd });
  if (!result.ok) throw new Error(`git ${gitArgs.join(' ')} failed\n${result.out.trim()}`);
  return result.out.trimEnd();
}

function prepareSandbox(broken) {
  const sandbox = mkdtempSync(join(tmpdir(), 'url-shortener-review-skill-eval-'));
  cpSync(join(HERE, 'fixture'), sandbox, { recursive: true });
  const skill = broken ? join(HERE, 'broken', 'SKILL.md') : join(ROOT, '.agents/skills/review-only/SKILL.md');

  for (const skillDir of SKILL_DIRS) {
    const destination = join(sandbox, skillDir);
    mkdirSync(destination, { recursive: true });
    copyFileSync(skill, join(destination, 'SKILL.md'));
  }

  git(sandbox, 'init', '-q');
  git(sandbox, '-c', 'user.name=eval', '-c', 'user.email=eval@example.com', 'add', '-A');
  git(
    sandbox,
    '-c', 'user.name=eval',
    '-c', 'user.email=eval@example.com',
    '-c', 'commit.gpgsign=false',
    'commit', '-qm', 'seed: clean review fixture', '--no-verify',
  );
  return { sandbox, seedSha: git(sandbox, 'rev-parse', 'HEAD') };
}

function printGrade(result) {
  for (const item of result.checks) console.log(`  ${item.passed ? '✓' : '✗'} ${item.message}`);
  if (result.status) console.error(`\nЗміни моделі:\n${result.status}`);
  console.log(result.passed ? '\nreview eval PASS' : '\nreview eval FAIL');
}

if (args.has('--self-test')) {
  runSelfTest();
} else {
  try {
    const version = run(AGENT_BIN, ['--version']);
    if (!version.ok) throw new Error(`${AGENT_BIN} не запускається. Перевірте npm run doctor і PATH.`);

    const { sandbox, seedSha } = prepareSandbox(args.has('--broken'));
    console.log(`agent:   ${AGENT_CMD} · ${version.out.trim().split('\n')[0]}`);
    console.log(`skill:   ${args.has('--broken') ? 'BROKEN control' : 'review-only'}`);
    console.log(`sandbox: ${sandbox}`);

    if (args.has('--dry-run')) {
      console.log(`task:    ${TASK.replaceAll('\n', ' ')}`);
      console.log('dry-run: модель не викликана, токени не витрачені');
    } else {
      const agent = run(AGENT_BIN, [...AGENT_ARGS, TASK], { cwd: sandbox });
      const response = agent.out.trim();
      const status = git(sandbox, 'status', '--porcelain', '--untracked-files=all');
      const result = inspect(response, {
        agentOk: agent.ok,
        headUnchanged: git(sandbox, 'rev-parse', 'HEAD') === seedSha,
        status,
      });
      printGrade(result);
      writeFileSync(join(sandbox, 'review.md'), `${response}\n`);
      console.log(`\n--- review.md ---\n${response}`);
      if (!result.passed) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`review eval ERROR — ${error.message}`);
    process.exitCode = 1;
  }
}
