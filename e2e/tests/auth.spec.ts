import { test, expect, Browser, Page } from '@playwright/test';

/**
 * page.request shares the browser context's cookie jar but not Angular's XSRF interceptor, so a
 * raw write needs the X-XSRF-TOKEN header set by hand (see docs/HANDOFF.md: cookie-authenticated
 * writes need it; bearer-header requests are exempt). GET /api/auth/csrf mints the cookie, so
 * call it here rather than assuming a page load already did.
 */
async function xsrfHeaders(page: Page): Promise<Record<string, string>> {
  await page.request.get('/api/auth/csrf');
  const cookie = (await page.context().cookies()).find(c => c.name === 'XSRF-TOKEN');
  if (!cookie) throw new Error('GET /api/auth/csrf did not mint an XSRF-TOKEN cookie');
  return { 'X-XSRF-TOKEN': cookie.value };
}

/**
 * bh-button puts the data-testid on the custom-element HOST, which stretches to the form's
 * full width while the real <button> inside is only as wide as its label. Clicking the host
 * lands dead centre — i.e. in the empty space beside the button — and nothing submits. Always
 * click the inner native button.
 */
// Matches BOTH testid placements. Pre-M13d screens put data-testid on the <bh-button> HOST
// with the real <button> inside; rebuilt screens pass bh-button's testId input, which lands
// it ON the button. Playwright accepts a descendant as the hit target, so the plain selector
// Both branches target the real <button>: the first matches a rebuilt screen, the second a
// legacy one. Exactly one matches per call, so Playwright strict mode stays happy.
const btn = (testId: string) => `button[data-testid="${testId}"], [data-testid="${testId}"] button`;

function linkFrom(html: string, path: string): string {
  const m = html.match(new RegExp(`href="([^"]*${path}[^"]*)"`));
  if (!m) throw new Error('no ' + path + ' link in mail');
  return m[1].replace(/&amp;/g, '&');
}

/** Mail is @Async and fires strictly after commit, so it arrives late — and by the time the
 *  "forgot password" step looks, this journey's inbox already holds the earlier verify mail. The
 *  newest message is not necessarily the wanted one. Poll until a message actually containing the
 *  wanted link shows up, rather than grabbing messages[0] and hoping. */
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

// Serial: this suite runs with workers: 1 against one seeded backend. A fresh address per run
// means reruns never collide with a previous run's leftover user.
const EMAIL = `auth-${Date.now()}@t.io`;
const PASSWORD = 'correct-horse-battery';
const NEW_PASSWORD = 'battery-horse-correct';

test.describe.serial('end-to-end auth journey through a real inbox', () => {
  // One context for the whole journey — Playwright's default is a fresh context per test, which
  // would silently hand every step a clean cookie jar and make "sign out" prove nothing.
  let browser: Browser;
  let page: Page;

  test.beforeAll(async ({ browser: b }) => {
    browser = b;
    page = await (await browser.newContext()).newPage();
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test('sign up with a fresh address lands on check-email', async () => {
    await page.goto('/app/auth/signup');
    await page.fill('[data-testid="signup-name"]', 'E2E Tester');
    await page.fill('[data-testid="signup-email"]', EMAIL);
    await page.fill('[data-testid="signup-password"]', PASSWORD);
    await page.click(btn('signup-submit'));
    await expect(page).toHaveURL(/auth\/check-email/);
  });

  test('the verify link in the real inbox logs the account in', async () => {
    const link = await mailLinkTo(EMAIL, '/auth/verify');
    // Absolute link straight from the mail — a real user clicks exactly this, no rewriting.
    // Three of these links shipped dead earlier in M8; only following the real one catches that.
    await page.goto(link);
    // Verify logs the account straight in — wait for the app to leave the verify page, since the
    // POST that sets the session cookies is async.
    await page.waitForURL(url => !url.pathname.startsWith('/app/auth/verify'));
    const me = await page.request.get('/api/me');
    expect(me.ok()).toBeTruthy();
    expect((await me.json()).email).toBe(EMAIL);
  });

  test('sign out, then sign in with the password works', async () => {
    await page.request.post('/api/auth/logout', { headers: await xsrfHeaders(page) });
    expect((await page.request.get('/api/me')).status()).toBe(401);

    await page.goto('/app/auth/login');
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    // A fresh signup carries no box membership, so login lands on the box picker, not a shell.
    await expect(page).toHaveURL(/auth\/boxes/);
  });

  test('forgot password: the reset link in the inbox sets a new password and logs in', async () => {
    await page.goto('/app/auth/forgot');
    await page.fill('[data-testid="forgot-email"]', EMAIL);
    await page.click(btn('forgot-submit'));
    await expect(page.getByTestId('forgot-confirm')).toBeVisible();

    const link = await mailLinkTo(EMAIL, '/auth/reset');
    await page.goto(link);
    await page.fill('[data-testid="reset-password"]', NEW_PASSWORD);
    await page.click(btn('reset-submit'));
    await page.waitForURL(url => !url.pathname.startsWith('/app/auth/reset'));

    expect((await page.request.get('/api/me')).ok()).toBeTruthy();
  });

  test('the old password no longer works', async () => {
    await page.request.post('/api/auth/logout', { headers: await xsrfHeaders(page) });
    await page.goto('/app/auth/login');
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page.getByTestId('login-error')).toBeVisible();
    await expect(page).toHaveURL(/auth\/login/);
  });

  test('sign out everywhere, then a protected route bounces to login', async () => {
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', NEW_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/auth\/boxes/);

    await page.request.post('/api/auth/logout-all', { headers: await xsrfHeaders(page) });
    // The session is dead server-side, not merely dropped by this tab — /api/me proves it
    // directly, independent of the boxless account also failing the route guard's box check.
    expect((await page.request.get('/api/me')).status()).toBe(401);

    await page.goto('/app/athlete');
    await expect(page).toHaveURL(/auth\/login/);
  });
});
