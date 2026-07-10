import { test, expect } from '@playwright/test';

test('athlete logs in and lands on athlete shell', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/auth\/login/);
  await page.fill('input[name="email"]', 'athlete@demo.io');
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/athlete/);
  // athlete shell defaults to the Home info-hub (M5)
  await expect(page.getByTestId('home-root')).toBeVisible();
});

test('admin lands on admin shell', async ({ page }) => {
  await page.goto('/auth/login');
  await page.fill('input[name="email"]', 'admin@demo.io');
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/admin/);
  // admin shell defaults to the SaaS dashboard (M5)
  await expect(page.getByTestId('kpi-members')).toBeVisible();
});

test('wrong password shows error', async ({ page }) => {
  await page.goto('/auth/login');
  await page.fill('input[name="email"]', 'athlete@demo.io');
  await page.fill('input[name="password"]', 'nope-nope-nope');
  await page.click('button[type="submit"]');
  await expect(page.getByTestId('login-error')).toBeVisible();
});
