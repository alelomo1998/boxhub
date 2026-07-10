import { test, expect, Page } from '@playwright/test';

async function login(page: Page, email: string) {
  await page.goto('/auth/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !u.pathname.includes('/auth/login'), { timeout: 20000 });
}

test('athlete logs a score on Today, sees the leaderboard, and logs a lift on Progress', async ({ page }) => {
  const stamp = Date.now();
  const title = 'Track WOD ' + stamp;
  const todayIso = new Date().toISOString().slice(0, 10);

  // coach guarantees a published TIME WOD on today's RX slot
  await login(page, 'coach@demo.io');
  await page.goto('/coach/wods/new');
  await page.fill('[data-testid="wod-title"]', title);
  await page.getByRole('button', { name: 'Save WOD' }).click();
  await expect(page).toHaveURL(/\/coach\/wods$/);
  await page.goto('/coach/calendar');
  const todayCell = page.locator(`[data-testid^="cell-"][data-testid$="-${todayIso}"]`).first();
  await todayCell.click();
  await page.locator('[data-testid="wod-picker"] select').selectOption({ label: title });
  await page.getByRole('button', { name: 'Assign' }).click();
  await page.getByRole('button', { name: 'Publish week' }).click();
  await expect(page.locator('.wod.pub .wt', { hasText: title })).toBeVisible();

  // athlete: Today hub shows the WOD; log a time via the score sheet
  await login(page, 'athlete@demo.io');
  await page.goto('/athlete/today');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.locator('.wt', { hasText: title })).toBeVisible();
  // slot may already carry a score from a previous run (shared seeded DB): Edit instead of Log
  const logBtn = page.getByTestId('log-score');
  if (await logBtn.isVisible().catch(() => false)) await logBtn.click();
  else await page.getByRole('button', { name: 'Edit' }).click();
  await page.locator('input[name="mins"]').fill('3');
  await page.locator('input[name="secs"]').fill('30');
  await page.getByRole('button', { name: 'Save score' }).click();

  // the card now shows the logged score; leaderboard sheet shows the time
  await expect(page.getByTestId('my-score')).toBeVisible();
  await expect(page.getByTestId('my-score')).toContainText('3:30');
  await page.getByRole('button', { name: 'Leaderboard' }).click();
  await expect(page.getByTestId('leaderboard')).toBeVisible();
  await expect(page.getByTestId('leaderboard').getByText('3:30')).toBeVisible();
  await page.keyboard.press('Escape');

  // Progress: quick-log a Back Squat with a unique load; history shows it
  const load = String(200 + (stamp % 90) + 0.5); // unique, > seeded max
  await page.goto('/athlete/progress');
  await expect(page.getByRole('heading', { name: 'Records' })).toBeVisible();
  await page.fill('[data-testid="lift-movement"]', 'Back Squat');
  await page.fill('input[name="load"]', load);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: /Back Squat/ })).toBeVisible();
  await expect(page.locator('.hrow', { hasText: load })).toBeVisible();
});
