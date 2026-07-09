import { defineConfig } from '@playwright/test';

// E2E живе на СВОЄМУ порту. Причина: `npm run dev` слухає :3000, і з reuseExistingServer
// Playwright перевикористав би саме той процес — з робочою базою data/links.db і зі старим
// кодом. Тест тоді міряв би не те, що щойно написали.
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

// testDir + testMatch тримають Playwright усередині tests/e2e — він ніколи не підбирає
// vitest-файли з tests/unit і tests/integration.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.js',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Один воркер, і не «бо CI». Усі e2e б'ють в ОДИН сервер з ОДНІЄЮ файловою базою:
  // паралельні файли міняли б спільний стан один одному під ногами, і тест «список
  // порожній» падав би залежно від того, хто встиг першим. Спільний мутабельний стан —
  // це відсутність паралельності, скільки воркерів не постав.
  workers: 1,
  fullyParallel: false,
  // На CI додаємо html-репортер: саме він пише playwright-report/, який
  // .github/workflows/gate.yml вивантажує артефактом при падінні.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    // Скидання бази — ПЕРШИМ, у тій самій команді. Playwright запускає webServer раніше
    // за globalSetup, тож чистити звідти було б пізно: сервер уже тримає файл відкритим.
    command: 'node tests/e2e/reset-db.js && npm run dev',
    url: `${baseURL}/healthz`,
    // Ніколи не переймати чужий процес — навіть локально. Якщо :3100 зайнятий,
    // Playwright має впасти голосно, а не тестувати не той сервер.
    reuseExistingServer: false,
    // Свій порт і своя БД, щоб e2e не писав у робочу data/links.db (див. src/db.js → DB_PATH).
    env: { ...process.env, PORT: String(PORT), DB_PATH: 'data/e2e.db' },
  },
});
