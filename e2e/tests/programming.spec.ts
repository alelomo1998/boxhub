import { test, expect, Page } from '@playwright/test';

async function login(page: Page, email: string) {
  await page.goto('/auth/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !u.pathname.includes('/auth/login'), { timeout: 20000 });
}

test('coach builds a WOD, programs today, publishes; athlete sees it on the board', async ({ page }) => {
  const stamp = Date.now();
  const title = 'E2E WOD ' + stamp;
  const todayIso = new Date().toISOString().slice(0, 10);

  // coach builds a WOD
  await login(page, 'coach@demo.io');
  await page.goto('/coach/wods/new');
  await page.fill('[data-testid="wod-title"]', title);
  await page.getByRole('button', { name: 'Save WOD' }).click();
  await expect(page).toHaveURL(/\/coach\/wods$/);
  await expect(page.locator('tr', { hasText: title })).toBeVisible();

  // program it onto today's first track (RX) and publish the week
  await page.goto('/coach/calendar');
  const todayCell = page.locator(`[data-testid^="cell-"][data-testid$="-${todayIso}"]`).first();
  await expect(todayCell).toBeVisible();
  await todayCell.click();
  await page.locator('[data-testid="wod-picker"] select').selectOption({ label: title });
  await page.getByRole('button', { name: 'Assign' }).click();
  await expect(page.locator('.wt', { hasText: title })).toBeVisible();
  await page.getByRole('button', { name: 'Publish week' }).click();
  await expect(page.locator('.wod.pub .wt', { hasText: title })).toBeVisible();

  // athlete sees the published WOD on today's board
  await login(page, 'athlete@demo.io');
  await page.goto('/athlete/wod');
  await expect(page.getByRole('heading', { name: 'WOD Board' })).toBeVisible();
  await expect(page.locator('.wt', { hasText: title })).toBeVisible();
});
