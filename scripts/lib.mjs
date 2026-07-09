// lib.mjs — спільний мінімум скриптів-воріт.
//
// Усе, що тут є, свідомо крихітне. Ворота мають читатись за хвилину: якщо для розуміння
// перевірки треба спершу вивчити фреймворк перевірок, її вимкнуть при першому ж червоному.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/** Корінь репозиторію: змінна від Claude Code або один рівень угору від scripts/. */
export function repoRoot(importMetaUrl) {
  if (process.env.CLAUDE_PROJECT_DIR) return resolve(process.env.CLAUDE_PROJECT_DIR);
  return resolve(dirname(fileURLToPath(importMetaUrl)), '..');
}

/** Запускає команду і повертає { ok, out }. Ніколи не кидає. */
export function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options,
  });
  return { ok: result.status === 0, out: `${result.stdout ?? ''}${result.stderr ?? ''}`, status: result.status };
}

/**
 * git у корені репо.
 *
 * ⚠ `trimEnd()`, а НЕ `trim()`. У `git status --porcelain` перші два символи рядка — це код
 * стану, і для незакоміченої правки він виглядає як `" M path"`. Повний `trim()` з'їдав би
 * провідний пробіл ПЕРШОГО рядка, і той, хто ріже `line.slice(3)`, отримував би шлях без
 * першого символа: `.claude/…` перетворювалось на `claude/…`. Ворота бачили б файл, якого
 * немає в allowlist, і давали хибний провал — рівно в тому випадку, який трапляється завжди.
 */
export function git(root, ...args) {
  return run('git', ['-C', root, ...args]).out.trimEnd();
}

/**
 * Убиває процеси, що СЛУХАЮТЬ порт. Сервер, який витік із минулого прогону, відповідав би
 * СТАРИМ кодом, і ворота мовчки дали б хибний зелений.
 *
 * ⚠ `-sTCP:LISTEN` тут не косметика. Без нього `lsof -ti tcp:<port>` повертає будь-який сокет
 * із цим портом — зокрема наші власні КЛІЄНТСЬКІ з'єднання з пулу `fetch`. Скрипт надсилав би
 * SIGTERM самому собі. Плюс явно виключаємо власний pid.
 */
export function killListeners(port) {
  if (process.platform === 'win32') return; // на Windows порт звільняє сама ОС після виходу
  const pids = run('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'])
    .out.split('\n')
    .map((p) => Number(p.trim()))
    .filter((p) => Number.isInteger(p) && p > 0 && p !== process.pid);

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // процес уже помер між lsof і kill — саме те, чого ми й хотіли
    }
  }
}

/** Зібрати вердикт із перевірок і надрукувати його однаково в усіх воротах. */
export class Verdict {
  constructor(title) {
    this.title = title;
    this.ok = [];
    this.fails = [];
  }

  check(condition, good, bad) {
    if (condition) this.ok.push(good);
    else this.fails.push(bad);
    return condition;
  }

  fail(message) {
    this.fails.push(message);
  }

  /** Друкує підсумок і виходить із правильним кодом. Ніколи не повертається. */
  report({ quiet = false } = {}) {
    if (!quiet) for (const line of this.ok) console.log(`  ✓ ${line}`);
    for (const line of this.fails) console.error(`  ✗ ${line}`);

    console.log('');
    if (this.fails.length > 0) {
      console.error(`${this.title} FAIL — ${this.fails.length} проблем.`);
      process.exit(1);
    }
    console.log(`${this.title} OK — ${this.ok.length} перевірок.`);
    process.exit(0);
  }
}
