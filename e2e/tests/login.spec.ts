import { test, expect } from '@playwright/test';

test('athlete logs in and lands on athlete shell', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/auth\/login/);
  await page.fill('input[name="email"]', 'athlete@demo.io');
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/athlete/);
  // athlete shell now defaults to the WOD board hero screen (rail + outlet)
  await expect(page.getByRole('heading', { name: 'WOD Board' })).toBeVisible();
});

test('admin lands on admin shell', async ({ page }) => {
  await page.goto('/auth/login');
  await page.fill('input[name="email"]', 'admin@demo.io');
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/admin/);
  // admin shell is now a rail + router-outlet; default child is the members board
  await expect(page.getByTestId('member-search')).toBeVisible();
});

test('wrong password shows error', async ({ page }) => {
  await page.goto('/auth/login');
  await page.fill('input[name="email"]', 'athlete@demo.io');
  await page.fill('input[name="password"]', 'nope-nope-nope');
  await page.click('button[type="submit"]');
  await expect(page.getByTestId('login-error')).toBeVisible();
});
