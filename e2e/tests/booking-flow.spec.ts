import { test, expect, Page } from '@playwright/test';

async function login(page: Page, email: string) {
  await page.goto('/auth/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !u.pathname.includes('/auth/login'), { timeout: 20000 });
}

test('admin schedules a class, athlete books it, coach checks them in from the photo grid', async ({ page }) => {
  const stamp = Date.now();
  const className = 'E2E WOD ' + stamp;

  // admin creates a weekly class type (capacity 1) -> sessions auto-generate
  await login(page, 'admin@demo.io');
  await expect(page).toHaveURL(/\/admin/);
  await page.goto('/admin/schedule');
  await page.fill('[data-testid="template-name"]', className);
  await page.fill('input[name="capacity"]', '1');
  await page.click('[data-testid="template-create"]');
  await expect(page.locator('li', { hasText: className })).toBeVisible();

  // athlete books the first session of that class from the card list
  await login(page, 'athlete@demo.io');
  await expect(page).toHaveURL(/\/athlete/);
  await page.goto('/athlete/book');
  await page.locator('.cards, .empty').first().waitFor(); // sessions loaded
  // page shows today; the new weekly class may generate on a later day — page through the pager
  const card = page.locator('.card', { hasText: className }).first();
  for (let i = 0; i < 14 && !(await card.isVisible().catch(() => false)); i++) {
    await page.locator('button[aria-label="Next day"]').click();
    await page.waitForTimeout(100);
  }
  await expect(card).toBeVisible();
  await card.getByTestId('book-btn').dispatchEvent('click');
  await expect(card.getByText('Booked')).toBeVisible({ timeout: 10000 });

  // Home shows an upcoming booking (the earliest one — may be another class on a shared DB)
  await page.goto('/athlete/home');
  await expect(page.getByTestId('next-booking')).toBeVisible();

  // coach checks the athlete in from the photo grid
  await login(page, 'coach@demo.io');
  await page.goto('/coach/classes');
  const row = page.locator('.row', { hasText: className }).filter({ hasText: '1/1' }).first();
  await expect(row).toBeVisible();
  await row.getByTestId('checkin-link').click();
  await expect(page.getByTestId('checkin-grid')).toBeVisible();
  await page.locator('[data-testid^="athlete-"]').first().click();
  await expect(page.getByTestId('checkin-count')).toContainText('1/1');
});
