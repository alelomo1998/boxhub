import { test, expect } from '@playwright/test';
import { login } from './_support';

test('coach fills a class instance from the builder and publishes it', async ({ page }) => {
  const stamp = Date.now();
  const pieceTitle = 'E2E Metcon ' + stamp;

  await login(page, 'coach@demo.io');
  await page.goto('/app/coach/classes');
  // build "Burn It", not the first class: today's first class is the WOD Class that
  // tracking.spec scores against (Fran), and republishing it here would wipe that.
  const burnRow = page.locator('.row', { hasText: 'Burn It' }).first();
  await expect(burnRow).toBeVisible();
  await burnRow.getByTestId('build-link').click();
  await expect(page.getByTestId('piece-stack')).toBeVisible();

  // add a piece and publish (works whether the instance was seeded, programmed or empty)
  await page.getByTestId('add-piece').click();
  const titles = page.getByTestId('piece-title');
  await titles.last().fill(pieceTitle);
  await page.getByTestId('publish-btn').click();
  await expect(page.locator('.prog.pub')).toBeVisible();

  // the classes list shows the instance as Published
  await page.goto('/app/coach/classes');
  await expect(page.locator('.prog.pub').first()).toBeVisible();
});
