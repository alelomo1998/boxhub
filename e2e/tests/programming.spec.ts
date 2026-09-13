import { test, expect } from '@playwright/test';
import { login, runId } from './_support';

/**
 * Karma cannot see this wiring: the class stack's (submit) binding, the library fill sheet
 * feeding ClassDraftStore, and the piece editor's own draft-store write carrying a freshly
 * authored piece back to the sibling /build route. Both tests reload the page after saving, so
 * a persistence bug (not just an in-memory signal) fails them too.
 */

test('a library piece fills a slot and survives a reload', async ({ page }) => {
  const title = `E2E Library ${runId()}`;

  // standalone wods ARE library rows -- write one there so the library fetch is deterministic.
  await login(page, 'coach@demo.io');
  await page.goto('/app/coach/wods/new');
  await page.getByTestId('piece-title').fill(title);
  await page.getByTestId('piece-save').click();
  await page.waitForURL(/\/coach\/wods$/);

  await page.goto('/app/coach/classes');
  const burnRow = page.locator('.row', { hasText: 'Burn It' }).first();
  await expect(burnRow).toBeVisible();
  await burnRow.getByTestId('build-link').click();
  await expect(page.getByTestId('stack-form')).toBeVisible();

  const n = await page.locator('[data-testid^="slot-open-"], [data-testid^="piece-toggle-"]').count();

  await page.getByTestId('add-slot').click();
  await page.getByTestId('add-slot-WORKOUT').click();
  const slot = page.getByTestId(`slot-open-${n}`);
  await expect(slot).toBeVisible();
  await slot.click();

  await page.getByTestId('pick-search').fill(title);
  await page.locator('[data-testid^="pick-row-"]', { hasText: title }).click();
  await expect(page.getByTestId('slot-detail-step')).toBeVisible();
  await page.getByTestId('slot-detail-select').click();

  const toggle = page.getByTestId(`piece-toggle-${n}`);
  await expect(toggle).toContainText(title);

  const saved = page.waitForResponse(
    r => r.url().includes('/items') && r.request().method() === 'PUT',
  );
  await page.getByTestId('save-draft').click();
  await saved;

  await page.reload();
  await expect(page.getByTestId('stack-form')).toBeVisible();
  await expect(page.getByTestId(`piece-toggle-${n}`)).toContainText(title);
});

test('a piece written in the editor comes back attached, and publishes', async ({ page }) => {
  const title = `E2E Piece ${runId()}`;

  await login(page, 'coach@demo.io');
  await page.goto('/app/coach/classes');
  const burnRow = page.locator('.row', { hasText: 'Burn It' }).first();
  await expect(burnRow).toBeVisible();
  await burnRow.getByTestId('build-link').click();
  await expect(page.getByTestId('stack-form')).toBeVisible();

  const n = await page.locator('[data-testid^="slot-open-"], [data-testid^="piece-toggle-"]').count();

  await page.getByTestId('add-slot').click();
  await page.getByTestId('add-slot-WORKOUT').click();
  await page.getByTestId(`slot-open-${n}`).click();
  await page.getByTestId('slot-write-new').click();

  await page.waitForURL(new RegExp(`/build/piece/${n}$`));
  await page.getByTestId('piece-title').fill(title);
  await page.getByTestId('piece-save').click();

  // back on the class build route (not still on /piece/<n>) -- ClassDraftStore is what carries
  // the just-saved piece back here; if it stopped doing that, the next assertion is the one that
  // would fail, since piece-toggle-<n> would keep whatever placeholder text the empty slot had.
  await page.waitForURL(u => /\/build$/.test(u.pathname));
  await expect(page.getByTestId(`piece-toggle-${n}`)).toContainText(title);

  await page.getByTestId('save-publish').click();
  // the seeded Burn It is already PUBLISHED, so status-live alone would pass before the click;
  // the banner only appears once the whole save+publish chain has succeeded.
  await expect(page.getByText('Class published')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('stack-form')).toBeVisible();
  await expect(page.getByTestId(`piece-toggle-${n}`)).toContainText(title);
  await expect(page.getByTestId('status-live')).toBeVisible();
});
