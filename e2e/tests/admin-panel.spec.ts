import { test, expect, Page } from '@playwright/test';

async function loginAdmin(page: Page) {
  await page.goto('/auth/login');
  await page.fill('input[name="email"]', 'admin@demo.io');
  await page.fill('input[name="password"]', 'boxhub-demo-2026');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/admin/);
}

test('admin creates a plan and edits settings', async ({ page }) => {
  await loginAdmin(page);

  await page.goto('/admin/plans');
  const planName = 'E2E Plan ' + Date.now();
  await page.fill('[data-testid="plan-name"]', planName);
  await page.click('[data-testid="plan-create"]');
  await expect(page.locator('li', { hasText: planName })).toBeVisible();

  await page.goto('/admin/settings');
  await page.click('[data-testid="settings-save"]');
  await expect(page.getByTestId('settings-saved')).toBeVisible();
});
