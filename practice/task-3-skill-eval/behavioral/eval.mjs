#!/usr/bin/env node

import { appendFileSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../../../scripts/lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const SKILL_DIRS = [
  '.claude/skills/review-only',
  '.agents/skills/review-only',
  '.cursor/skills/review-only',
  '.github/skills/review-only',
];
const TASK = `Use the repository's review-only skill exactly as written to review src/shorten.js.
Cite findings as file:line, write the review in English, and finish with exactly one
VERDICT: ACCEPT, VERDICT: WARN, or VERDICT: REJECT.`;
const AGENTS = {
  claude: {
    bin: 'claude',
    args: (task) => ['-p', '--permission-mode', 'acceptEdits', '--output-format', 'text', task],
  },
  codex: {
    bin: 'codex',
    args: (task) => ['exec', '--sandbox', 'workspace-write', '--ephemeral', '--color', 'never', task],
  },
  copilot: {
    bin: 'copilot',
    args: (task) => ['--allow-all-tools', '--silent', '--no-color', '--no-ask-user', '-p', task],
  },
  cursor: {
    bin: 'cursor-agent',
    args: (task) => ['-p', '--trust', '--output-format', 'text', task],
  },
};

let sandbox;
let seedSha;

function usage(exitCode = 0) {
  console.log(`Usage: node practice/task-3-skill-eval/behavioral/eval.mjs [options]

Options:
  --agent <claude|codex|copilot|cursor>  coding agent (default: claude)
  --dry-run                              prepare sandbox, validate CLI, spend 0 tokens
  --self-test                            test the grader without invoking a model
  --broken                               use the intentionally broken skill
  --help                                 show this help`);
  process.exit(exitCode);
}

function parseOptions(argv) {
  const options = { agent: 'claude', broken: false, dryRun: false, selfTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') usage();
    else if (arg === '--broken') options.broken = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--self-test') options.selfTest = true;
    else if (arg === '--agent') {
      options.agent = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--agent=')) options.agent = arg.slice('--agent='.length);
    else {
      console.error(`Невідомий аргумент: ${arg}`);
      usage(2);
    }
  }

  if (!(options.agent in AGENTS)) {
    console.error(`Невідомий agent: ${options.agent ?? '(не задано)'}`);
    usage(2);
  }
  if (options.selfTest && (options.broken || options.dryRun)) {
    console.error('--self-test не поєднується з --broken або --dry-run');
    usage(2);
  }
  return options;
}

function git(...args) {
  const result = run('git', args, { cwd: sandbox });
  if (!result.ok) throw new Error(`git ${args.join(' ')} failed\n${result.out.trim()}`);
  return result.out.trimEnd();
}

function prepare({ broken = false } = {}) {
  sandbox = mkdtempSync(join(tmpdir(), 'url-shortener-review-skill-eval-'));
  cpSync(join(HERE, 'fixture'), sandbox, { recursive: true });
  const sourceSkill = broken
    ? join(HERE, 'broken', 'SKILL.md')
    : join(ROOT, '.agents', 'skills', 'review-only', 'SKILL.md');

  for (const skillDir of SKILL_DIRS) {
    const destination = join(sandbox, skillDir);
    mkdirSync(destination, { recursive: true });
    copyFileSync(sourceSkill, join(destination, 'SKILL.md'));
  }

  git('init', '-q');
  git('-c', 'user.name=eval', '-c', 'user.email=eval@example.com', 'add', '-A');
  git(
    '-c',
    'user.name=eval',
    '-c',
    'user.email=eval@example.com',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-qm',
    'seed: clean review fixture',
    '--no-verify',
  );
  seedSha = git('rev-parse', 'HEAD');
}

function inspect(response, agentOk) {
  const status = git('status', '--porcelain', '--untracked-files=all');
  const head = git('rev-parse', 'HEAD');
  const findingBlock = response
    .split(/\n\s*\n/)
    .find((block) => /src\/shorten\.js:(?:2|3)\b/.test(block));
  const namesScheme = /(scheme|protocol|схем|протокол)/iu.test(findingBlock ?? '');
  const namesUnsafeInput = /(javascript:|https?:|allowlist|unsafe|небезпеч|дозвол)/iu.test(findingBlock ?? '');
  const verdicts = [...response.matchAll(/\bVERDICT:\s*(ACCEPT|WARN|REJECT)\b/g)];
  const checks = [
    { id: 'agent', passed: agentOk, message: 'agent завершився з кодом 0' },
    {
      id: 'verdict',
      passed: verdicts.length === 1 && verdicts[0][1] === 'REJECT',
      message: 'є рівно один VERDICT: REJECT',
    },
    {
      id: 'finding',
      passed: Boolean(findingBlock && namesScheme && namesUnsafeInput),
      message: 'finding цитує реальний рядок і пояснює небезпечну URL-схему',
    },
    { id: 'head', passed: head === seedSha, message: 'agent не створив жодного коміту' },
    { id: 'status', passed: status === '', message: 'agent не змінив жодного файла' },
  ];
  return { checks, passed: checks.every((check) => check.passed), status };
}

function printGrade(result) {
  for (const check of result.checks) console.log(`  ${check.passed ? '✓' : '✗'} ${check.message}`);
  if (result.status) console.error(`\nЗміни моделі:\n${result.status}`);
  console.log(result.passed ? '\nreview eval PASS' : '\nreview eval FAIL');
}

function preflight(adapter) {
  const version = run(adapter.bin, ['--version']);
  if (!version.ok) {
    throw new Error(`${adapter.bin} не запускається. Перевірте npm run doctor, встановлення і PATH.\n${version.out.trim()}`);
  }
  return version.out.trim().split('\n')[0];
}

function runSelfTest() {
  prepare();
  try {
    const knownGood = `- Blocking — src/shorten.js:3: The function accepts the javascript: protocol because it never allowlists http: and https: URL schemes. Reject every other scheme before returning the URL.\n\nVERDICT: REJECT — unsafe URL schemes violate the function contract.`;
    const positive = inspect(knownGood, true);

    appendFileSync(join(sandbox, 'src', 'shorten.js'), '\n// committed mutation\n');
    git('add', 'src/shorten.js');
    git(
      '-c',
      'user.name=eval',
      '-c',
      'user.email=eval@example.com',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-qm',
      'bad agent commit',
      '--no-verify',
    );
    const committedMutation = inspect(knownGood, true);
    const rejectedCommit =
      !committedMutation.passed && !committedMutation.checks.find((c) => c.id === 'head').passed;

    console.log(`  ${positive.passed ? '✓' : '✗'} grader приймає відомий правильний review`);
    console.log(`  ${rejectedCommit ? '✓' : '✗'} grader відхиляє зміну, яку agent закомітив`);
    console.log(positive.passed && rejectedCommit ? '\ngrader self-test PASS' : '\ngrader self-test FAIL');
    if (!(positive.passed && rejectedCommit)) process.exitCode = 1;
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

const options = parseOptions(process.argv.slice(2));

try {
  if (options.selfTest) {
    runSelfTest();
  } else {
    const adapter = AGENTS[options.agent];
    const version = preflight(adapter);
    prepare({ broken: options.broken });
    console.log(`agent:   ${options.agent} · ${version}`);
    console.log(`skill:   ${options.broken ? 'BROKEN control' : 'review-only'}`);
    console.log(`sandbox: ${sandbox}`);

    if (options.dryRun) {
      console.log(`task:    ${TASK.replaceAll('\n', ' ')}`);
      console.log('dry-run: модель не викликана, токени не витрачені');
    } else {
      const agent = run(adapter.bin, adapter.args(TASK), { cwd: sandbox });
      const response = agent.out.trim();
      const result = inspect(response, agent.ok);
      printGrade(result);
      writeFileSync(join(sandbox, 'review.md'), `${response}\n`);
      console.log(`\n--- review.md ---\n${response}`);
      if (!result.passed) process.exitCode = 1;
    }
  }
} catch (error) {
  console.error(`review eval ERROR — ${error.message}`);
  process.exitCode = 1;
}
