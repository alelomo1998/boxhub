import { test, expect, Browser, Page } from '@playwright/test';

/**
 * account/security had NO e2e coverage at all. Written during M13d Task 18, and deliberately KEPT
 * when that task was deferred: the account area is being redesigned in its own milestone, and
 * everything asserted here is BEHAVIOUR that must survive that redesign, not markup that will not.
 * It pins no layout — only test ids, the forms actually submitting, and the delete flow's security
 * property.
 *
 * M13e split the old single page into sections (/account/password, /account/danger, ...) behind
 * a sessionGuard, not the old roleGuard — a membership-less or suspended-box account can now reach
 * its own password, sessions and deletion, which it could not before. /account/security is now a
 * redirect, kept because it is in users' history. Test ids carried over unchanged.
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

function linkFrom(html: string, path: string): string {
  const m = html.match(new RegExp(`href="([^"]*${path}[^"]*)"`));
  if (!m) throw new Error('no ' + path + ' link in mail');
  return m[1].replace(/&amp;/g, '&');
}

// Same polling strategy as e2e/tests/auth.spec.ts's helper of the same name: mail is @Async and
// fires after commit, so it can arrive after the request that triggered it already returned.
async function mailLinkTo(email: string, path: string, timeoutMs = 20000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastErr = 'no mail at all';
  while (Date.now() < deadline) {
    const res = await fetch('http://localhost:8025/api/v1/search?query=to:' + encodeURIComponent(email));
    const { messages } = await res.json();
    for (const m of messages ?? []) {
      const html = (await (await fetch(`http://localhost:8025/api/v1/message/${m.ID}`)).json()).HTML as string;
      try {
        return linkFrom(html, path);
      } catch {
        lastErr = `mail present but no ${path} link yet`;
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`${lastErr} for ${email} after ${timeoutMs}ms`);
}

const EMAIL = `sec-${Date.now()}@t.io`;
const NOBOX_EMAIL = `sec-nobox-${Date.now()}@t.io`;
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
    // This account needs a real box, not because the account area requires one (it doesn't,
    // see the no-box case below), but because the delete-flow test later in this file needs a
    // membership to delete. Registering through an invite creates the account, lands it VERIFIED
    // (M8 T11) and gives it the membership, all in one step.
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

  test('a user with no active box can still reach account/password', async () => {
    // The access change this milestone made: sessionGuard replaced roleGuard on the account
    // area, because a membership-less or suspended-box user could not previously reach their
    // own password, sessions or account deletion. Nothing here joins a box.
    const boxless = await (await browser.newContext()).newPage();

    await boxless.goto('/app/auth/signup');
    await boxless.fill('[data-testid="signup-name"]', 'No Box Tester');
    await boxless.fill('[data-testid="signup-email"]', NOBOX_EMAIL);
    await boxless.fill('[data-testid="signup-password"]', PASSWORD);
    await boxless.click(btn('signup-submit'));
    await expect(boxless).toHaveURL(/auth\/check-email/);

    const link = await mailLinkTo(NOBOX_EMAIL, '/auth/verify');
    await boxless.goto(link);
    await boxless.waitForURL(u => !u.pathname.startsWith('/app/auth/verify'));

    await boxless.goto('/app/account/password');
    // The point: the form renders, not a login bounce.
    await expect(boxless).not.toHaveURL(/auth\/login/);
    await expect(boxless.getByTestId('password-form')).toBeVisible();

    await boxless.context().close();
  });

  test('changing the password submits through the form, not through the URL', async () => {
    await page.goto('/app/account/password');
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

  test('a password-change notification mail arrives', async () => {
    // AccountController fires this strictly after the transactional service call returns, to
    // the account's own address — the point being it can act as an "this wasn't me" tripwire.
    // Its CTA links back to /auth/forgot, which is distinct from the /auth/reset link a forgot-
    // password request sends, so finding it proves the right mail arrived, not just any mail.
    await mailLinkTo(EMAIL, '/auth/forgot');
  });

  test('/app/account/security still redirects into the area', async () => {
    // Kept because the old URL is in users' history.
    await page.goto('/app/account/security');
    await page.waitForURL(u => u.pathname.startsWith('/app/account') && !u.pathname.includes('security'));
    expect(page.url()).not.toContain('/security');
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
    await page.goto('/app/account/danger');
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
