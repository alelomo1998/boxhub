import { test, expect, Browser, Page } from '@playwright/test';

/**
 * account/security had NO e2e coverage at all. Written during M13d Task 18, and deliberately KEPT
 * when that task was deferred: the account area is being redesigned in its own milestone, and
 * everything asserted here is BEHAVIOUR that must survive that redesign, not markup that will not.
 * It pins no layout — only test ids, the forms actually submitting, and the delete flow's security
 * property.
 *
 * The URL assertions are the point. Karma cannot see a dead submit binding — it calls the handler
 * directly — and that is how login shipped a form doing a native GET with the password in the
 * query string. These two forms post a CURRENT and a NEW password.
 *
 * Every entity here belongs to a throwaway account stamped with Date.now(). NOTHING in this file
 * may touch a seeded fixture: changing admin@demo.io's password would break every other spec in
 * the suite.
 */

// Matches bh-button's testid on the inner <button> (rebuilt screens) or on the host (legacy).
const btn = (testId: string) => `button[data-testid="${testId}"], [data-testid="${testId}"] button`;

const EMAIL = `sec-${Date.now()}@t.io`;
const PASSWORD = 'correct-horse-battery';
const NEW_PASSWORD = 'battery-horse-correct-9';

test.describe.serial('account/security drives its real forms', () => {
  let browser: Browser;
  let page: Page;

  test.beforeAll(async ({ browser: b }) => {
    browser = b;
    page = await (await browser.newContext()).newPage();
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test('a throwaway account joins the demo box through a real invite', async () => {
    // Signup alone is not enough: /account/security requires an ACTIVE BOX, and a memberless
    // account bounces to login. Registering through an invite creates the account, lands it
    // VERIFIED (M8 T11) and gives it the membership, all in one step.
    const admin = await (await browser.newContext()).newPage();
    await admin.goto('/app/auth/login');
    await admin.fill('input[name="email"]', 'admin@demo.io');
    await admin.fill('input[name="password"]', 'boxhub-demo-2026');
    await admin.click('button[type="submit"]');
    await expect(admin).toHaveURL(/\/admin/);

    await admin.goto('/app/admin/invites');
    await admin.fill('[data-testid="invite-email"]', EMAIL);
    await admin.selectOption('[data-testid="invite-plan"]', { label: 'No plan (bill manually)' });
    await admin.click(btn('invite-create'));
    const link = await admin.getByTestId('invite-link').textContent();
    await admin.context().close();

    await page.goto(link!);
    await page.fill('[data-testid="join-name"]', 'Security Tester');
    await page.fill('[data-testid="join-password"]', PASSWORD);
    await page.click(btn('join-register'));
    await expect(page).toHaveURL(/\/athlete/);
  });

  test('changing the password submits through the form, not through the URL', async () => {
    await page.goto('/app/account/security');
    await expect(page.getByTestId('password-form')).toBeVisible();

    await page.fill('[data-testid="password-current"]', PASSWORD);
    await page.fill('[data-testid="password-new"]', NEW_PASSWORD);

    // Enter, deliberately — not a click. A dead submit binding still "works" under a click
    // handler; it is the Enter path that falls through to the browser's native GET.
    await page.press('[data-testid="password-new"]', 'Enter');

    await expect(page.getByTestId('password-success')).toBeVisible();

    // THE REGRESSION THIS SPEC EXISTS FOR: a native GET would put currentPassword and
    // newPassword in the query string.
    expect(page.url()).not.toContain('?');
    expect(page.url()).not.toContain(PASSWORD);
    expect(page.url()).not.toContain(NEW_PASSWORD);
  });

  test('the new password actually works, and the old one does not', async () => {
    const fresh = await (await browser.newContext()).newPage();

    await fresh.goto('/app/auth/login');
    await fresh.fill('input[name="email"]', EMAIL);
    await fresh.fill('input[name="password"]', PASSWORD);
    await fresh.click('button[type="submit"]');
    await expect(fresh.getByTestId('login-error')).toBeVisible();

    await fresh.fill('input[name="password"]', NEW_PASSWORD);
    await fresh.click('button[type="submit"]');
    await fresh.waitForURL(u => !u.pathname.includes('/auth/login'), { timeout: 20000 });

    await fresh.context().close();
  });

  test('the delete flow reveals the password field only after the server asks for it', async () => {
    await page.goto('/app/account/security');
    await page.click(btn('delete-open'));
    await expect(page.getByTestId('delete-explain')).toBeVisible();

    // The first attempt deliberately sends NO password. That is what makes a Google-only
    // account never see the field at all.
    await expect(page.locator('[data-testid="delete-password"]')).toHaveCount(0);

    await page.fill('[data-testid="delete-confirm-text"]', 'DELETE');
    await page.click(btn('delete-submit'));

    // A 422 WRONG_PASSWORD comes back for a password account, which is what reveals the field.
    await expect(page.locator('[data-testid="delete-password"]')).toBeVisible();
  });

});
