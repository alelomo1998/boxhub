import { test, expect, Page } from '@playwright/test';

async function login(page: Page, email: string) {
  await page.goto('/auth/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  // wait until we've navigated off the login page (cold-start can be slow)
  await page.waitForURL(u => !u.pathname.includes('/auth/login'), { timeout: 20000 });
}

test('admin schedules a class, athlete books it, coach checks them in', async ({ page }) => {
  const stamp = Date.now();
  const className = 'E2E WOD ' + stamp;

  // admin creates a weekly template (capacity 1) -> sessions auto-generate
  await login(page, 'admin@demo.io');
  await expect(page).toHaveURL(/\/admin/);
  await page.goto('/admin/schedule');
  await page.fill('[data-testid="template-name"]', className);
  await page.fill('input[name="capacity"]', '1');
  await page.click('[data-testid="template-create"]');
  await expect(page.locator('li', { hasText: className })).toBeVisible();

  // athlete books the first available session of that class
  await login(page, 'athlete@demo.io');
  await expect(page).toHaveURL(/\/athlete/);
  await page.goto('/athlete/book');
  const sessionRow = page.locator('.sess', { hasText: className }).first();
  await expect(sessionRow).toBeVisible();
  await sessionRow.getByTestId('book-btn').click();
  await expect(sessionRow.getByText('Booked')).toBeVisible();

  // shows in My bookings
  await page.goto('/athlete/my-bookings');
  await expect(page.locator('li', { hasText: className })).toBeVisible();

  // coach opens the roster and checks the athlete in
  await login(page, 'coach@demo.io');
  await page.goto('/coach/sessions');
  // the template makes several same-named sessions; open the one the athlete actually booked (1 / 1)
  const coachRow = page.locator('tr', { hasText: className }).filter({ hasText: /1 \/ \d/ }).first();
  await expect(coachRow).toBeVisible();
  await coachRow.getByText('Roster').click();
  await expect(page).toHaveURL(/\/roster/);
  await page.getByTestId('checkin-btn').first().click();
  await expect(page.getByText('Checked in')).toBeVisible();
});
