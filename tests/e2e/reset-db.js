import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

// Стирає e2e-базу ПЕРЕД тим, як Playwright підійме сервер (playwright.config.js →
// webServer.command = `node tests/e2e/reset-db.js && npm run dev`).
//
// Чому не globalSetup: Playwright запускає webServer РАНІШЕ за globalSetup. Скидання
// звідти зносило б файл, уже відкритий сервером — на macOS/Linux це мовчки «працює»
// через unlink-after-open, на Windows впало б, а WAL лишався б без файлів-супутників.
//
// Навіщо взагалі: без скидання рядки з минулого прогону лишаються в базі, і тест на
// dedup («скороти той самий URL двічі → той самий код») бачить код, створений не в
// цьому прогоні. Тест стає флейкі й бреше про AC-07.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// WAL-режим (src/db.js) тримає ще два файли-супутники — прибираємо всі три.
for (const suffix of ['', '-wal', '-shm']) {
  rmSync(join(repoRoot, `data/e2e.db${suffix}`), { force: true });
}
