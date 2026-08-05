import { test, expect } from '@playwright/test';

test('app boots dark and login renders on warm ground', async ({ page }) => {
  await page.goto('/app/auth/login');
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(theme).toBe('dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  // warm near-black #17120D → rgb(23, 18, 13)
  expect(bg).toBe('rgb(23, 18, 13)');
});

test('brand fonts load (guards the nginx /media/ collision)', async ({ page }) => {
  await page.goto('/app/auth/login');
  // poll: on a cold nginx the woff2 fetch can lag the first paint
  await expect.poll(() => page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('800 20px "Saira Condensed"') && document.fonts.check('400 16px "Archivo"');
  }), { timeout: 10000 }).toBe(true);
});
