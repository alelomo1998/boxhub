import { test, expect, Page } from '@playwright/test';
import { login } from './_support';

/**
 * bh-button puts the data-testid on the custom-element HOST, which stretches wider than the
 * real <button> inside. Clicking the host can land in empty space and submit nothing. Always
 * click the inner native button — see onboarding.spec.ts / auth.spec.ts for the same note.
 */
// Matches BOTH testid placements. Pre-M13d screens put data-testid on the <bh-button> HOST
// with the real <button> inside; rebuilt screens pass bh-button's testId input, which lands
// it ON the button. Playwright accepts a descendant as the hit target, so the plain selector
// Both branches target the real <button>: the first matches a rebuilt screen, the second a
// legacy one. Exactly one matches per call, so Playwright strict mode stays happy.
const btn = (testId: string) => `button[data-testid="${testId}"], [data-testid="${testId}"] button`;

// The rp-member / rp-plan <select> options carry more than the bare name (email, price), so an
// exact-label selectOption is fragile — match by substring on the option text, then select by
// the value Angular actually bound (the membershipId / planId).
async function selectByOptionText(page: Page, testId: string, text: string) {
  const select = page.locator(`[data-testid="${testId}"]`);
  const value = await select.locator('option', { hasText: text }).first().getAttribute('value');
  if (!value) throw new Error(`no option matching "${text}" in [data-testid="${testId}"]`);
  await select.selectOption(value);
}

test('admin publishes a priced plan, records a discounted cash subscription, athlete books, receipt renders', async ({ page, context }) => {
  const stamp = Date.now();
  const planName = `E2E Membership ${stamp}`;
  const className = `E2E Rail WOD ${stamp}`;
  // A fresh invitee, not a static seeded account: a seeded athlete (or a rerun against the same
  // stack) can already carry a subscription from a prior pass, and recording a second one onto a
  // different plan without cancelling first is a real, separate conflict (SWITCH_REQUIRES_CANCEL)
  // — orthogonal to what this spec proves. A brand-new membership guarantees NO_ACTIVE_SUBSCRIPTION
  // going in, so the entitlement gate is genuinely exercised end to end, and the spec is safe to
  // rerun against the same shared backend (workers: 1, retries: 0 since M12a).
  const athleteEmail = `e2e-member-${stamp}@t.io`;

  // admin publishes a priced, unlimited-entitlement plan
  await login(page, 'admin@demo.io');
  await expect(page).toHaveURL(/\/admin/);
  await page.goto('/app/admin/plans');
  await page.fill('[data-testid="plan-name"]', planName);
  await page.fill('[data-testid="plan-price"]', '89');
  await page.click(btn('plan-create'));
  const planRow = page.locator('li', { hasText: planName });
  await expect(planRow).toBeVisible();
  await expect(planRow).toContainText('€89.00');

  // admin creates a class for the athlete to book once entitled (capacity 1 — same isolation
  // convention as booking-flow.spec.ts's "E2E WOD")
  await page.goto('/app/admin/schedule');
  await page.fill('[data-testid="template-name"]', className);
  await page.fill('input[name="capacity"]', '1');
  await page.click(btn('template-create'));
  await expect(page.locator('li', { hasText: className })).toBeVisible();

  // admin invites a fresh athlete (plan-less invite -> no subscription created on accept) — the
  // invite form now requires an EXPLICIT choice once plans exist (M10 review fix), so pick the
  // explicit "No plan (bill manually)" option rather than relying on a silent default.
  await page.goto('/app/admin/invites');
  await page.fill('[data-testid="invite-email"]', athleteEmail);
  await page.selectOption('[data-testid="invite-plan"]', { label: 'No plan (bill manually)' });
  await page.click(btn('invite-create'));
  const inviteLink = await page.getByTestId('invite-link').textContent();
  expect(inviteLink).toContain('/join/');

  // the invitee joins in a separate browser context (logged out of the admin session)
  const invitee = await context.browser()!.newContext();
  const joinPage = await invitee.newPage();
  await joinPage.goto(inviteLink!);
  await joinPage.fill('[data-testid="join-name"]', 'E2E Member');
  await joinPage.fill('[data-testid="join-password"]', 'boxhub-demo-2026');
  await joinPage.click(btn('join-register'));
  await expect(joinPage).toHaveURL(/\/athlete/);

  // admin records a CASH subscription for the athlete at a discounted agreed price
  await page.goto('/app/admin/subscriptions');
  await page.fill('[data-testid="rp-search"]', athleteEmail);
  await selectByOptionText(page, 'rp-member', athleteEmail);
  await selectByOptionText(page, 'rp-plan', planName);
  await expect(page.locator('[data-testid="rp-price"]')).toHaveValue('89'); // pre-filled from list price
  await page.fill('[data-testid="rp-price"]', '70'); // agreed price, discounted below list price
  await expect(page.getByTestId('rp-discount-preview')).toContainText('€19.00');
  await page.click(btn('rp-submit'));

  const confirm = page.getByTestId('rp-confirmed');
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('€70.00');
  await expect(confirm).toContainText('€19.00');

  // the receipt page renders the amount actually paid and the discount off list price
  await page.getByTestId('rp-receipt-link').click();
  await expect(page).toHaveURL(/\/receipts\//);
  await expect(page.getByTestId('receipt-total')).toContainText('€70.00');
  await expect(page.getByTestId('receipt-discount')).toContainText('€19.00');
  await expect(page.locator('.paper')).toContainText(planName);
  await expect(page.locator('.paper')).toContainText('CASH');

  // the athlete now has an active subscription — entitlement gate passes and the booking succeeds
  await joinPage.goto('/app/athlete/book');
  await joinPage.locator('.cards, .empty').first().waitFor();
  const card = joinPage.locator('.card', { hasText: className }).first();
  for (let i = 0; i < 14 && !(await card.isVisible().catch(() => false)); i++) {
    await joinPage.locator('button[aria-label="Next day"]').click();
    await joinPage.waitForTimeout(100);
  }
  await expect(card).toBeVisible();
  await card.getByTestId('book-btn').dispatchEvent('click');
  await expect(card.getByText('Booked')).toBeVisible({ timeout: 10000 });

  await invitee.close();
});
