import { test, expect, Browser, Page } from '@playwright/test';

// Copied from auth.spec.ts — spec-local by design (see that file's comment on why).
async function latestMailTo(email: string): Promise<string> {
  const res = await fetch('http://localhost:8025/api/v1/search?query=to:' + encodeURIComponent(email));
  const { messages } = await res.json();
  if (!messages?.length) throw new Error('no mail for ' + email);
  const full = await fetch(`http://localhost:8025/api/v1/message/${messages[0].ID}`);
  return (await full.json()).HTML as string;
}

function linkFrom(html: string, path: string): string {
  const m = html.match(new RegExp(`href="([^"]*${path}[^"]*)"`));
  if (!m) throw new Error('no ' + path + ' link in mail');
  return m[1].replace(/&amp;/g, '&');
}

/**
 * bh-button puts the data-testid on the custom-element HOST, which stretches wider than the
 * real <button> inside. Clicking the host can land in empty space and submit nothing. Always
 * click the inner native button — see auth.spec.ts for the same note.
 */
const btn = (testId: string) => `[data-testid="${testId}"] button`;

// Serial: shares the one seeded backend stack with every other spec (workers: 1). Fresh
// addresses per run so a rerun never collides with a previous run's leftovers.
const STAMP = Date.now();
const BOX_NAME = `E2E Gym ${STAMP}`;
const OWNER_NAME = 'E2E Owner';
const OWNER_EMAIL = `owner-${STAMP}@t.io`;
const OWNER_PASSWORD = 'correct-horse-battery';
const SUPERADMIN_EMAIL = 'super@demo.io';
const SUPERADMIN_PASSWORD = 'boxhub-demo-2026';
const ATHLETE_EMAIL = `athlete-${STAMP}@t.io`;

test.describe.serial('self-serve box signup through superadmin approval', () => {
  // One context for the whole journey — a fresh context per test would silently hand every
  // step a clean cookie jar and make "sign out" prove nothing.
  let browser: Browser;
  let page: Page;

  test.beforeAll(async ({ browser: b }) => {
    browser = b;
    page = await (await browser.newContext()).newPage();
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test('signing up opens a box and lands on check-email', async () => {
    await page.goto('/auth/start');
    // signupMode() resolves async — wait for the open-mode form rather than the loading state.
    await expect(page.getByTestId('start-form')).toBeVisible();
    await page.fill('[data-testid="start-box-name"]', BOX_NAME);
    await page.fill('[data-testid="start-name"]', OWNER_NAME);
    await page.fill('[data-testid="start-email"]', OWNER_EMAIL);
    await page.fill('[data-testid="start-password"]', OWNER_PASSWORD);
    await page.click(btn('start-submit'));
    await expect(page).toHaveURL(/auth\/check-email/);
  });

  test('the verify link logs the owner in; the box shows PENDING everywhere it should', async () => {
    const html = await latestMailTo(OWNER_EMAIL);
    const link = linkFrom(html, '/auth/verify');
    // Absolute link straight from the mail — a real user clicks exactly this, no rewriting.
    await page.goto(link);
    await page.waitForURL(url => !url.pathname.startsWith('/auth/verify'));

    // Verify doesn't select a box (see box-picker.page.ts / login.page.ts — that's a UI-flow
    // step, not something bootstrap does automatically), so pick it explicitly like a real
    // user would from the box picker.
    await page.goto('/auth/boxes');
    await page.locator('.box', { hasText: BOX_NAME }).click();
    await expect(page).toHaveURL(/\/admin/);

    await expect(page.getByTestId('pending-banner')).toBeVisible();

    await page.goto('/admin/invites');
    await expect(page.getByTestId('invites-pending')).toContainText('Available once your box is approved.');
  });

  test('superadmin approves the box from the pending queue', async () => {
    await page.click('button[aria-label="Log out"]');
    await expect(page).toHaveURL(/auth\/login/);

    await page.goto('/auth/login');
    await page.fill('input[name="email"]', SUPERADMIN_EMAIL);
    await page.fill('input[name="password"]', SUPERADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    // Superadmin carries no box membership — login lands on the box picker, not a shell.
    await expect(page).toHaveURL(/auth\/boxes/);

    await page.goto('/superadmin');
    const row = page.locator('[data-testid^="queue-row-"]', { hasText: BOX_NAME });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Approve' }).click();
    await expect(row).toHaveCount(0);
  });

  test('the owner\'s inbox gets the box-approved mail', async () => {
    const html = await latestMailTo(OWNER_EMAIL);
    expect(html).toContain('is live');
    expect(linkFrom(html, '/auth/login')).toBeTruthy();
  });

  test('the owner signs back in: banner gone, invites unlocked, invite mail sent', async () => {
    await page.click(btn('console-logout'));
    await expect(page).toHaveURL(/auth\/login/);

    await page.goto('/auth/login');
    await page.fill('input[name="email"]', OWNER_EMAIL);
    await page.fill('input[name="password"]', OWNER_PASSWORD);
    await page.click('button[type="submit"]');
    // One membership now selects itself and lands straight in the admin shell.
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByTestId('pending-banner')).toHaveCount(0);

    await page.goto('/admin/invites');
    await expect(page.getByTestId('invites-pending')).toHaveCount(0);
    await page.fill('[data-testid="invite-email"]', ATHLETE_EMAIL);
    await page.click(btn('invite-create'));
    await expect(page.getByTestId('invite-link')).toContainText('/join/');

    const html = await latestMailTo(ATHLETE_EMAIL);
    expect(linkFrom(html, '/join/')).toBeTruthy();
  });
});
