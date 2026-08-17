import { test, expect } from '@playwright/test';
import { login } from './_support';

// bh-button puts the data-testid on the custom-element HOST for a legacy screen, or on the inner
// <button> for a rebuilt one (Task 8 moved join's own testid onto the inner button). Match both so
// this keeps working regardless of which shape the target screen currently has — same helper as
// memberships.spec.ts.
const btn = (testId: string) => `button[data-testid="${testId}"], [data-testid="${testId}"] button`;

test('full invite flow: create -> join -> visible in members', async ({ page, context }) => {
  const stamp = Date.now();
  const inviteeEmail = `e2e-joiner-${stamp}@t.io`;

  await login(page, 'admin@demo.io');
  await expect(page).toHaveURL(/\/admin/);
  await page.goto('/app/admin/invites');
  await page.fill('[data-testid="invite-email"]', inviteeEmail);
  // the demo box has priced plans, so the invite form now requires an explicit plan choice (M10
  // review fix) — pick "No plan (bill manually)" since this spec isn't exercising billing.
  await page.selectOption('[data-testid="invite-plan"]', { label: 'No plan (bill manually)' });
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
  await joinPage.click(btn('join-register'));
  await expect(joinPage).toHaveURL(/\/athlete/);
  await invitee.close();

  // admin sees the new member
  await page.goto('/app/admin/members');
  await page.fill('[data-testid="member-search"]', inviteeEmail);
  await expect(page.locator(`[data-testid="member-${inviteeEmail}"]`)).toBeVisible();
});
