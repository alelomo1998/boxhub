import { test, expect } from '@playwright/test';
import { login, runId } from './_support';

test('an announcement reaches the feed, and reading it there clears the home card too', async ({ page }) => {
  test.setTimeout(45000);
  const stamp = runId();
  const body = `E2E notification ping ${stamp}`;

  // EVERYONE is BOX_ADMIN-only server-side (AnnouncementController: COACH may send only
  // CLASS_ROSTER, for a session they coach — see its "no gym-wide EVERYONE broadcast" comment),
  // so this reaches the feed via admin@demo.io, not coach@demo.io.
  await login(page, 'admin@demo.io');
  await page.goto('/app/admin/announcements');
  await page.getByTestId('announcement-segment-everyone').click();
  await page.fill('[data-testid="announcement-body"]', body);
  await page.getByTestId('announcement-send').click();
  await expect(page.getByTestId('announcement-confirm-count')).toBeVisible({ timeout: 10000 });
  await page.getByTestId('announcement-confirm-send').click();
  await expect(page.locator('[data-testid^="announcement-row-"]', { hasText: body })).toBeVisible({ timeout: 10000 });

  await login(page, 'athlete@demo.io');
  const bell = page.getByTestId('athlete-notifications-link');
  await expect(bell).toBeVisible();
  await expect(bell.locator('.badge')).toBeVisible();
  await bell.click();
  await expect(page).toHaveURL(/\/athlete\/notifications/);
  const row = page.locator('[data-testid^="notification-row-"]', { hasText: body });
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.click();

  // Load-bearing assertion: reading the notification in the feed must clear the home card's
  // unread count too, because they read the same unread column rather than two states kept in
  // sync by hand. If a dev forgets to invalidate one side, this is what catches it.
  await page.goto('/app/athlete/home');
  await expect(page.getByTestId('home-announcements-unread')).toHaveCount(0);
});

test('the bell badge clears on mark-all-read and stays cleared across a reload', async ({ page }) => {
  test.setTimeout(45000);
  // runId() is one id per test PROCESS, so the previous test's announcement carries this exact
  // stamp too — filtering on the stamp alone matches both rows and trips Playwright strict mode.
  // Match on the whole body, which is unique to this test.
  const body = `E2E mark-all ping ${runId()}`;

  // mark-all-read needs something unread to act on. The previous test reads its own notification
  // individually (that's its whole point), so it can leave the athlete with nothing unread —
  // send a fresh one here rather than depend on cross-test leftovers.
  await login(page, 'admin@demo.io');
  await page.goto('/app/admin/announcements');
  await page.getByTestId('announcement-segment-everyone').click();
  await page.fill('[data-testid="announcement-body"]', body);
  await page.getByTestId('announcement-send').click();
  await expect(page.getByTestId('announcement-confirm-count')).toBeVisible({ timeout: 10000 });
  await page.getByTestId('announcement-confirm-send').click();
  await expect(page.locator('[data-testid^="announcement-row-"]', { hasText: body })).toBeVisible({ timeout: 10000 });

  await login(page, 'athlete@demo.io');
  await page.getByTestId('athlete-notifications-link').click();
  await expect(page).toHaveURL(/\/athlete\/notifications/);
  await page.getByTestId('notifications-mark-all').click();
  await expect(page.locator('[data-testid="athlete-notifications-link"] .badge')).toHaveCount(0);

  // A badge that comes back after reload means the write never happened server-side and only
  // the in-memory signal moved — this proves mark-all-read actually persisted.
  await page.reload();
  await expect(page.locator('[data-testid="athlete-notifications-link"] .badge')).toHaveCount(0);
});

test('preferences reached through the real entry point, and a change that persists', async ({ page }) => {
  test.setTimeout(30000);
  await login(page, 'athlete@demo.io');
  await page.goto('/app/athlete/home');
  await page.click('button[aria-label="Your profile"]');
  await page.getByTestId('profile-notifications-link').click();

  await expect(page).toHaveURL(/\/app\/athlete\/notifications\/settings/);
  await expect(page.getByTestId('notification-prefs-page')).toBeVisible();

  // Regression test for a reported bug: the settings route lives inside the same shell, so the
  // shell component is never destroyed on navigation and its profileOpen signal was left set,
  // leaving the profile sheet sitting on top of the settings page.
  await expect(page.locator('bh-profile-sheet')).toHaveCount(0);

  const locked = page.getByTestId('pref-locked-PAYMENT_FAILED');
  await expect(locked).toBeVisible();
  await expect(locked).toContainText('Always on');
  // A mandatory type must be locked, not a switch that silently does nothing.
  await expect(locked).not.toHaveAttribute('aria-checked');

  const toggle = page.getByTestId('pref-switch-CLASS_CANCELLED');
  await toggle.click();
  await page.reload();
  await expect(page.getByTestId('pref-switch-CLASS_CANCELLED')).toHaveAttribute('aria-checked', 'false');

  // Restore shared seeded state: this test mutates athlete@demo.io's real prefs row, which no
  // runId() can stamp, so it must leave things as it found them for the suite to be rerunnable.
  await page.getByTestId('pref-switch-CLASS_CANCELLED').click();
  await expect(page.getByTestId('pref-switch-CLASS_CANCELLED')).toHaveAttribute('aria-checked', 'true');
});

test('the feed is empty and says so for a member with nothing', async ({ page }) => {
  test.setTimeout(30000);
  // duo@demo.io holds two memberships: COACH at Demo Box (has a notification) and ATHLETE at
  // Northside Barbell (zero notifications) — a real seeded membership, not an invented account,
  // and nobody else's memberships were touched to get it.
  await login(page, 'duo@demo.io');
  await expect(page).toHaveURL(/\/app\/gyms/);
  await page.getByTestId('gym-northside').click();
  await expect(page.getByTestId('athlete-notifications-link')).toBeVisible();

  await page.getByTestId('athlete-notifications-link').click();
  await expect(page).toHaveURL(/\/athlete\/notifications/);
  await expect(page.getByTestId('notifications-empty')).toBeVisible();
});
