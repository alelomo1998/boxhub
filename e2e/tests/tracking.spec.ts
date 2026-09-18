import { test, expect } from '@playwright/test';
import { login } from './_support';

test('athlete books today, logs a per-piece score, sees the leaderboard', async ({ page }) => {
  await login(page, 'athlete@demo.io');

  // book today's WOD Class so the WOD tab has a focused class (seeder publishes today's programming)
  await page.goto('/app/athlete/book');
  const card = page.locator('[data-testid^="session-"]', { hasText: 'WOD Class' }).first();
  await expect(card).toBeVisible();
  const bookBtn = card.getByTestId('book-btn');
  if (await bookBtn.isVisible().catch(() => false)) await bookBtn.click();

  // the WOD tab shows the booked class's pieces; log the TIME-scored metcon (Fran)
  await page.goto('/app/athlete/wod');
  const fran = page.locator('.piece', { hasText: 'Fran' });
  await expect(fran).toBeVisible();
  const logBtn = fran.locator('[data-testid^="log-"]');
  if (await logBtn.isVisible().catch(() => false)) {
    await logBtn.click();
  } else {
    await fran.getByRole('button', { name: 'Edit' }).click(); // re-run on shared DB
  }
  await page.locator('input[name="mins"]').fill('3');
  await page.locator('input[name="secs"]').fill('30');
  await page.getByRole('button', { name: 'Save score' }).click();
  await expect(fran.getByTestId('logged-mark')).toBeVisible();

  // leaderboard hero page shows the time
  await fran.getByRole('link', { name: 'Leaderboard' }).click();
  await expect(page).toHaveURL(/\/athlete\/board\//);
  await expect(page.getByTestId('leaderboard')).toBeVisible();
  await expect(page.getByTestId('leaderboard').getByText('3:30')).toBeVisible();

  // progress page still renders records
  await page.goto('/app/athlete/progress');
  await expect(page.getByRole('heading', { name: 'Records' })).toBeVisible();
});

test('athlete opens class detail and an athlete profile from the grid', async ({ page }) => {
  await login(page, 'athlete@demo.io');
  await page.goto('/app/athlete/book');
  const card = page.locator('[data-testid^="session-"]', { hasText: 'WOD Class' }).first();
  await expect(card).toBeVisible();
  await card.locator('a.body').click();
  await expect(page).toHaveURL(/\/athlete\/class\//);
  await expect(page.getByTestId('class-grid')).toBeVisible();
  await page.locator('[data-testid="class-grid"] a').first().click();
  await expect(page).toHaveURL(/\/athlete\/profile\//);
  await expect(page.locator('.name')).toBeVisible();
});
