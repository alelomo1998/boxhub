import { test, expect } from '@playwright/test';

test('app boots dark and login renders on warm ground', async ({ page }) => {
  await page.goto('/auth/login');
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(theme).toBe('dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  // warm near-black #17120D → rgb(23, 18, 13)
  expect(bg).toBe('rgb(23, 18, 13)');
});
