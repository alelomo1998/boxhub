import { test, expect } from '@playwright/test';
import { login } from './_support';

// The milestone's premise. Before M23 this person had no shell at all: roleGuard sent a session
// with no active box to /auth/login, so a brand-new account — the state EVERY account starts in,
// since register() creates a User and never a Membership — was shown a login form.
test('a boxless account lands on the hub instead of a login form', async ({ page }) => {
  await login(page, 'nobox@demo.io');
  await expect(page).toHaveURL(/\/app\/gyms$/);
  await expect(page.getByTestId('gyms-empty')).toBeVisible();
  await expect(page.getByTestId('gyms-empty-cta')).toBeVisible();
});

test('the hub offers a real way in, and it is not a placeholder', async ({ page }) => {
  await login(page, 'nobox@demo.io');
  await page.getByTestId('gyms-empty-cta').click();
  await expect(page).toHaveURL(/\/app\/gyms\/join$/);
  await expect(page.getByTestId('join-explainer')).toBeVisible();
});

// /auth/boxes is in users' browser history, so the redirect has to work.
test('the old picker address still resolves', async ({ page }) => {
  await login(page, 'nobox@demo.io');
  await page.goto('/app/auth/boxes');
  await expect(page).toHaveURL(/\/app\/gyms$/);
});

// Two gyms with DIFFERENT roles: the case M21 made real, and the one a switcher must get right.
// multi@demo.io is ATHLETE at the demo box and BOX_ADMIN at Northside.
test('switching gym lands in the target gym, by the role held there', async ({ page }) => {
  await login(page, 'multi@demo.io');
  // Two memberships, so login does not auto-select and the hub is where they land.
  await expect(page).toHaveURL(/\/app\/gyms$/);

  await page.getByTestId('gym-demo').click();
  await expect(page).toHaveURL(/\/app\/athlete/);

  await page.getByTestId('box-switcher').click();
  await page.getByTestId('switch-to-northside').click();
  // BOX_ADMIN at Northside — the admin shell, not the athlete one they came from.
  await expect(page).toHaveURL(/\/app\/admin/);
});

test('the switcher reaches the hub from inside a gym', async ({ page }) => {
  await login(page, 'athlete@demo.io');
  await expect(page).toHaveURL(/\/app\/athlete/);
  await page.getByTestId('box-switcher').click();
  await page.getByTestId('switcher-all-gyms').click();
  await expect(page).toHaveURL(/\/app\/gyms$/);
});

// The third dead end, and the one most easily left behind: the account area's Done control
// navigated a boxless session to /auth/login.
test('Done in the account area returns a boxless session to the hub', async ({ page }) => {
  await login(page, 'nobox@demo.io');
  await page.goto('/app/account/password');
  await page.getByTestId('account-done').click();
  await expect(page).toHaveURL(/\/app\/gyms$/);
});

// The wordmark is the way out of a child screen. Karma proves the href; only a browser proves
// that clicking it actually lands you on the hub with the hub rendered.
test('the rxed wordmark returns you to the hub from the join screen', async ({ page }) => {
  await login(page, 'nobox@demo.io');
  await page.goto('/app/gyms/join');
  await page.locator('.brandlink').click();
  await expect(page).toHaveURL(/\/app\/gyms$/);
  await expect(page.getByTestId('gyms-empty')).toBeVisible();
});
