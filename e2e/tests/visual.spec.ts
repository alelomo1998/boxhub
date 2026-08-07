import { test, expect } from '@playwright/test';

// Dark only. The BACKLOG entry that requested this said "both themes"; that entry predates M13b,
// which deleted the light theme outright.
const VIEWPORTS = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

for (const vp of VIEWPORTS) {
  test(`component gallery is visually unchanged at ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/app/dev/components');

    // Fonts must be settled, or the first baseline captures fallback metrics and every later run
    // diffs against a screenshot of the wrong typeface.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForSelector('[data-gallery="button"]');

    // bh-dock is position: fixed to the viewport (mobile-only chrome, <719px) — it stays pinned to
    // the bottom of the screen regardless of scroll, so per-section screenshots below 719px
    // capture whatever the dock happens to be floating over at scroll time (observed bleeding into
    // search-bar, pill and wordmark) rather than anything about those components. Its own
    // [data-gallery="dock"] section already can't show it live per the gallery's own note ("shrink
    // the viewport... to see the pill" is instructions for a human, not this per-section capture).
    // Removed via plain DOM API (not a style/script injection) because the app's real CSP has no
    // 'unsafe-inline' for style-src, so page.addStyleTag is blocked here. Runs after the gallery has
    // rendered (waitForSelector above) — bh-dock doesn't exist in the DOM until Angular renders it.
    await page.evaluate(() => document.querySelectorAll('bh-dock').forEach((el) => el.remove()));

    const sections = page.locator('[data-gallery]');
    const n = await sections.count();
    expect(n).toBeGreaterThan(0);

    for (let i = 0; i < n; i++) {
      const section = sections.nth(i);
      const name = await section.getAttribute('data-gallery');
      // Per-section, not per-page: a change to one component churns ONE baseline instead of one
      // 3000px-tall screenshot that tells you nothing about which component moved.
      await expect(section).toHaveScreenshot(`${name}-${vp.name}.png`, {
        animations: 'disabled',
      });
    }
  });
}
