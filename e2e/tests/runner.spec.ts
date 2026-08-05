import { test, expect } from '@playwright/test';
import { login, runId } from './_support';

test('coach runs a class: arms a timer, logs a score, TV shows the clock', async ({ browser }) => {
  // TV pairs first
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

  // coach opens the runner for today's class, arms an AMRAP, then starts it
  await coach.goto('/app/coach/classes');
  await coach.locator('.list, .empty').first().waitFor();
  await coach.locator('[data-testid="run-link"]').first().click();
  await expect(coach.getByTestId('runner')).toBeVisible();

  // arm: pick the first scoreable piece, AMRAP 10:00 (Start is disabled until a timer is armed)
  await coach.getByLabel('Piece', { exact: true }).selectOption({ index: 1 });
  await coach.getByLabel('Timer type').selectOption('AMRAP');
  await coach.getByLabel('Minutes').fill('10');
  await coach.getByLabel('Seconds').fill('0');
  await coach.getByRole('button', { name: 'Arm' }).click();
  await expect(coach.getByTestId('timer-start')).toBeEnabled();
  await coach.getByTestId('timer-start').click();

  // Two assertions, in order, so a failure says WHICH half broke: first that the SSE frame
  // carrying a running timer actually arrived, then that the clock rendered from it.
  await expect(tv.getByTestId('tv-stream')).toHaveAttribute('data-timer', 'RUNNING', { timeout: 15000 });
  await expect(tv.locator('.tvtimer')).toBeVisible({ timeout: 5000 });

  await tvCtx.close(); await coachCtx.close(); await adminCtx.close();
});
