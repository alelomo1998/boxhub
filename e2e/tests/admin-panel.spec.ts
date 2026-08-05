import { test, expect } from '@playwright/test';
import { login } from './_support';

test('admin creates a plan and edits settings', async ({ page }) => {
  await login(page, 'admin@demo.io');
  await expect(page).toHaveURL(/\/admin/);

  await page.goto('/app/admin/plans');
  const planName = 'E2E Plan ' + Date.now();
  await page.fill('[data-testid="plan-name"]', planName);
  await page.click('[data-testid="plan-create"]');
  await expect(page.locator('li', { hasText: planName })).toBeVisible();

  await page.goto('/app/admin/settings');
  await page.click('[data-testid="settings-save"]');
  await expect(page.getByTestId('settings-saved')).toBeVisible();
});
