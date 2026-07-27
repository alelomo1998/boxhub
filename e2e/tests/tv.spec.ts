import { test, expect } from '@playwright/test';
import { login, runId } from './_support';

test('TV pairs via admin and shows the live board', async ({ browser }) => {
  const tvCtx = await browser.newContext();
  const tv = await tvCtx.newPage();
  await tv.goto('/tv');
  // the code arrives after the async POST /api/tv/pair resolves — wait for the 6 digits
  const codeEl = tv.getByTestId('pair-code');
  await expect(codeEl).toHaveText(/^\d{6}$/, { timeout: 10000 });
  const code = (await codeEl.textContent())!.trim();

  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await login(admin, 'admin@demo.io');
  await admin.goto('/admin/tvs');
  await admin.getByTestId('tv-code').fill(code);
  const tvName = `E2E TV ${runId()}`;
  await admin.getByTestId('tv-name').fill(tvName);
  await admin.getByRole('button', { name: 'Pair' }).click();
  await expect(admin.locator('.row', { hasText: tvName })).toBeVisible();

  // TV flips to live within a few polls and renders a board or the idle clock
  await expect(tv.locator('.board, .idle').first()).toBeVisible({ timeout: 15000 });

  await tvCtx.close();
  await adminCtx.close();
});
