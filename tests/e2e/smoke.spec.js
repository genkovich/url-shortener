import { test, expect } from '@playwright/test';

// E2E-smoke: єдиний шлях «очима користувача» — сторінка вантажиться, форма створює
// короткий лінк, редірект працює. Навмисно мінімальний: ширші e2e приїжджають разом
// зі своїми фічами (валідація, expiry, QR).
//
// Ціль редіректу — власний /healthz, щоб тест не ходив у зовнішню мережу.
test('скорочує лінк через обморду, і редірект веде на оригінал', async ({ page, baseURL }) => {
  const target = `${baseURL}/healthz`;

  await page.goto('/');
  await expect(page.locator('h1')).toContainText('URL Shortener');

  await page.fill('#url', target);
  await page.click('button[type="submit"]');

  const short = page.locator('#short');
  await expect(short).toBeVisible();

  const shortUrl = (await short.textContent()).trim();
  const code = shortUrl.split('/').pop();
  expect(code).toMatch(/^[A-Za-z0-9]{7}$/);

  // лінк зʼявився в таблиці «Мої лінки»
  await expect(page.locator('#rows')).toContainText(code);

  // перехід за коротким кодом веде на оригінал
  const response = await page.goto(`/${code}`);
  expect(response.ok()).toBe(true);
  expect(page.url()).toBe(target);
});
