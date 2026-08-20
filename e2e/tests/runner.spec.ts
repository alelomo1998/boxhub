import { test, expect } from '@playwright/test';
import { login, runId } from './_support';

/**
 * The coach half. This is the part that works, and it stays in the gate.
 *
 * Split out of the combined test below on 2026-08-06 so that a broken TV assertion stops taking
 * the coach runner's coverage down with it. Everything here is server-authoritative timer state
 * observed by the client that wrote it — no SSE involved.
 */
test('coach arms a timer from the runner and starts it', async ({ page }) => {
  await login(page, 'coach@demo.io');

  await page.goto('/app/coach/classes');
  await page.locator('.list, .empty').first().waitFor();
  await page.locator('[data-testid="run-link"]').first().click();
  await expect(page.getByTestId('runner')).toBeVisible();

  // Start is disabled until a timer is armed, so arming is proven by the button becoming enabled.
  await page.getByLabel('Piece', { exact: true }).selectOption({ index: 1 });
  await page.getByLabel('Timer type').selectOption('AMRAP');
  await page.getByLabel('Minutes').fill('10');
  await page.getByLabel('Seconds').fill('0');
  await page.getByRole('button', { name: 'Arm' }).click();
  await expect(page.getByTestId('timer-start')).toBeEnabled();

  await page.getByTestId('timer-start').click();
  // The coach's own clock renders from the state it just wrote. If this breaks, the timer itself
  // is broken — which is a different failure from the TV never being told about it.
  await expect(page.locator('.clock')).toBeVisible({ timeout: 5000 });
});

/**
 * The TV half. A coach starts a timer; the TV should learn about it over SSE.
 *
 * Quarantined `test.fixme` 2026-08-06 through 2026-08-19: frames arrived carrying no timer
 * (`compose()`'s `@TenantId` read on `ClassTimer` had no ambient tenant). Fixed as a side effect of
 * M21's `TvStreamService.push()` wrapping compose in `TenantContext.runAsBox(...)` (`9b4917e`,
 * 2026-08-19). Re-verified and re-enabled 2026-08-20 (M13f task 8) — three runs, including two
 * against one un-rebuilt stack, the condition that used to reproduce the failure. See
 * `docs/BACKLOG.md` for the full history.
 */
test('TV shows the clock when a coach starts a timer', async ({ browser }) => {
  const tvCtx = await browser.newContext();
  const tv = await tvCtx.newPage();
  await tv.goto('/app/tv');
  const codeEl = tv.getByTestId('pair-code');
  await expect(codeEl).toHaveText(/^\d{6}$/, { timeout: 10000 });
  const code = (await codeEl.textContent())!.trim();

  const coachCtx = await browser.newContext();
  const coach = await coachCtx.newPage();
  await login(coach, 'coach@demo.io');

  // pair through admin (coaches lack /admin/tvs):
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await login(admin, 'admin@demo.io');
  await admin.goto('/app/admin/tvs');
  await admin.getByTestId('tv-code').fill(code);
  const tvName = `Runner TV ${runId()}`;
  await admin.getByTestId('tv-name').fill(tvName);
  await admin.getByRole('button', { name: 'Pair' }).click();
  await expect(admin.locator('.row', { hasText: tvName })).toBeVisible();

  await coach.goto('/app/coach/classes');
  await coach.locator('.list, .empty').first().waitFor();
  await coach.locator('[data-testid="run-link"]').first().click();
  await expect(coach.getByTestId('runner')).toBeVisible();

  await coach.getByLabel('Piece', { exact: true }).selectOption({ index: 1 });
  await coach.getByLabel('Timer type').selectOption('AMRAP');
  await coach.getByLabel('Minutes').fill('10');
  await coach.getByLabel('Seconds').fill('0');
  await coach.getByRole('button', { name: 'Arm' }).click();
  await expect(coach.getByTestId('timer-start')).toBeEnabled();
  await coach.getByTestId('timer-start').click();

  // Two assertions, in order, so a failure says WHICH half broke: first that the SSE frame
  // carrying a running timer actually arrived, then that the clock rendered from it. It is the
  // first that fails, which is what rules out the renderer.
  await expect(tv.getByTestId('tv-stream')).toHaveAttribute('data-timer', 'RUNNING', { timeout: 15000 });
  await expect(tv.locator('.tvtimer')).toBeVisible({ timeout: 5000 });

  await tvCtx.close(); await coachCtx.close(); await adminCtx.close();
});
