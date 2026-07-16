import { test, expect, Page } from '@playwright/test';

async function loginAdmin(page: Page) {
  await page.goto('/auth/login');
  await page.fill('input[name="email"]', 'admin@demo.io');
  await page.fill('input[name="password"]', 'boxhub-demo-2026');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/admin/);
}

test('full invite flow: create -> join -> visible in members', async ({ page, context }) => {
  const stamp = Date.now();
  const inviteeEmail = `e2e-joiner-${stamp}@t.io`;

  await loginAdmin(page);
  await page.goto('/admin/invites');
  await page.fill('[data-testid="invite-email"]', inviteeEmail);
  await page.click('[data-testid="invite-create"]');
  const link = await page.getByTestId('invite-link').textContent();
  expect(link).toContain('/join/');

  // new browser context = the invitee, logged out
  const invitee = await context.browser()!.newContext();
  const joinPage = await invitee.newPage();
  await joinPage.goto(link!);
  await expect(joinPage.locator('h1')).toContainText('Join');
  await joinPage.fill('[data-testid="join-name"]', 'E2E Joiner');
  await joinPage.fill('[data-testid="join-password"]', 'boxhub-demo-2026');
  await joinPage.click('[data-testid="join-register"]');
  await expect(joinPage).toHaveURL(/\/athlete/);
  await invitee.close();

  // admin sees the new member
  await page.goto('/admin/members');
  await page.fill('[data-testid="member-search"]', inviteeEmail);
  await expect(page.locator(`[data-testid="member-${inviteeEmail}"]`)).toBeVisible();
});
