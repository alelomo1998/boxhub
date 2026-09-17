import { test, expect, Page } from '@playwright/test';
import { login } from './_support';

/**
 * A real touch swipe, through the browser's own gesture handling (CDP touch events), because the
 * failure this guards against is invisible to a mouse drag and to Karma: without touch-action:none
 * on the handle, the browser claims the swipe as a pan and fires pointercancel a few px in, so the
 * sheet never closes. Found by the user on a phone after a mouse-driven check had passed.
 */
test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

async function swipe(page: Page, px: number) {
  const title = (await page.locator('dialog[open] .sh-title').boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const x = title.x + 20, y0 = title.y + 5, steps = 12;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (px * i) / steps }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(500);
}

test('a sheet closes on a touch swipe down, and stays on a short one', async ({ page }) => {
  await login(page, 'coach@demo.io');
  await page.goto('/app/coach/wods');

  await page.getByTestId('lib-filter').click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await swipe(page, 40);
  await expect(page.locator('dialog[open]')).toHaveCount(1);

  await swipe(page, 180);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});
