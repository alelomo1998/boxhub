import { test, expect } from '@playwright/test';

test('app boots dark and login renders on warm ground', async ({ page }) => {
  await page.goto('/auth/login');
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(theme).toBe('dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  // warm near-black #17120D → rgb(23, 18, 13)
  expect(bg).toBe('rgb(23, 18, 13)');
});

test('brand fonts load (guards the nginx /media/ collision)', async ({ page }) => {
  await page.goto('/auth/login');
  const ok = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('800 20px "Saira Condensed"') && document.fonts.check('400 16px "Archivo"');
  });
  expect(ok).toBe(true);
});
