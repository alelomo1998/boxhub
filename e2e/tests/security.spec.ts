import { test, expect } from '@playwright/test';

// M11 T11: security headers + strict CSP. Unit tests can't catch a CSP that blocks the live
// app (Angular's runtime component-style <style> tags need the nonce, not a unit-testable
// concern) — this walks real journeys in a real browser and fails on any CSP console violation.

test('security headers present and no CSP violations across the app', async ({ browser }) => {
  const violations: string[] = [];

  const athleteCtx = await browser.newContext();
  const athletePage = await athleteCtx.newPage();
  athletePage.on('console', m => {
    if (m.text().includes('Content Security Policy')) violations.push(m.text());
  });

  const res = await athletePage.goto('/');
  expect(res!.headers()['x-content-type-options']).toBe('nosniff');
  expect(res!.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(res!.headers()['permissions-policy']).toContain('geolocation=()');
  expect(res!.headers()['strict-transport-security']).toContain('max-age=31536000');
  expect(res!.headers()['content-security-policy']).toContain("frame-ancestors 'none'");

  // login → athlete home
  await expect(athletePage).toHaveURL(/auth\/login/);
  await athletePage.fill('input[name="email"]', 'athlete@demo.io');
  await athletePage.fill('input[name="password"]', 'boxhub-demo-2026');
  await athletePage.click('button[type="submit"]');
  await athletePage.waitForURL(u => !u.pathname.includes('/auth/login'), { timeout: 20000 });
  await expect(athletePage.getByTestId('home-root')).toBeVisible();

  // book — a second deep-linked SPA route, served through the same try_files fallback
  await athletePage.goto('/athlete/book');
  await expect(athletePage.locator('.card', { hasText: 'WOD Class' }).first()).toBeVisible();

  await athleteCtx.close();

  // admin screen — separate context so it doesn't collide with the athlete session
  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  adminPage.on('console', m => {
    if (m.text().includes('Content Security Policy')) violations.push(m.text());
  });

  await adminPage.goto('/auth/login');
  await adminPage.fill('input[name="email"]', 'admin@demo.io');
  await adminPage.fill('input[name="password"]', 'boxhub-demo-2026');
  await adminPage.click('button[type="submit"]');
  await expect(adminPage).toHaveURL(/\/admin/);
  await expect(adminPage.getByTestId('kpi-members')).toBeVisible();
  await adminPage.goto('/admin/settings');
  await expect(adminPage.getByTestId('settings-save')).toBeVisible();

  await adminCtx.close();

  expect(violations).toEqual([]);
});

// M12c: no /oauth2 location existed in docker/nginx.conf from M8 until now, so
// /oauth2/authorization/google — the href on the login and signup pages' Google button — was
// served index.html by the SPA catch-all and the button did nothing. Invisible in dev because
// the OAuth2 chain is conditional on BOXHUB_GOOGLE_CLIENT_ID, which the dev stack never set.
test('the Google SSO authorization endpoint is proxied to Spring, not swallowed by the SPA', async ({ request }) => {
  const res = await request.get('/oauth2/authorization/google', { maxRedirects: 0 });

  // Before the nginx location existed this was 200 text/html. That is what makes this discriminate.
  expect(res.status()).toBe(302);

  const location = new URL(res.headers()['location']);
  expect(location.host).toBe('accounts.google.com');
  expect(location.searchParams.get('redirect_uri')).toMatch(/\/login\/oauth2\/code\/google$/);
});
