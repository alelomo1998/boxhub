import { test, expect, Page } from '@playwright/test';

async function login(page: Page, email: string) {
  await page.goto('/auth/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !u.pathname.includes('/auth/login'), { timeout: 20000 });
}

test('athlete logs a score, sees the leaderboard, and logs a PR lift', async ({ page }) => {
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

  // athlete logs a time on that WOD
  await login(page, 'athlete@demo.io');
  await page.goto('/athlete/wod');
  const card = page.locator('.tk', { hasText: title });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Log score' }).click();
  await card.locator('input[name="mins"]').fill('3');
  await card.locator('input[name="secs"]').fill('30');
  await card.getByRole('button', { name: 'Save score' }).click();

  // leaderboard shows the score
  await card.getByRole('button', { name: 'Leaderboard' }).click();
  await expect(card.getByTestId('leaderboard')).toBeVisible();
  await expect(card.getByTestId('leaderboard').getByText('3:30')).toBeVisible();

  // log a Back Squat; use a unique load so this run's entry is identifiable (and re-run safe)
  const load = String(200 + (stamp % 90)); // 200..289, always > the seeded max (120)
  await page.goto('/athlete/lifts');
  await page.fill('[data-testid="lift-movement"]', 'Back Squat');
  await page.fill('input[name="load"]', load);
  await page.getByRole('button', { name: 'Save' }).click();
  // the lift appears in the movement's history table with its load
  await expect(page.getByRole('heading', { name: 'Back Squat history' })).toBeVisible();
  await expect(page.locator('tbody tr', { hasText: load })).toBeVisible();

  // progress page renders the PR sections
  await page.goto('/athlete/progress');
  await expect(page.getByRole('heading', { name: 'Records' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Back Squat progression' })).toBeVisible();
});
