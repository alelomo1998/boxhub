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
      //
      // threshold/maxDiffPixels are tuned, not default (0.2 threshold, no cap) — the defaults let a
      // --r-card 12px->20px change (a real, deliberate M13b-scale token) pass clean: dark-on-dark
      // (--surface #151a16 on --ground #0d110e) keeps a rounded corner's antialiasing gradient inside
      // pixelmatch's default 0.2 colour-distance band even though the geometry moved. Measured inside
      // the same pinned container this suite runs in (mcr.microsoft.com/playwright:v1.62.0-noble):
      //   - noise floor, clean build, threshold:0 (exact byte match), two consecutive runs with no
      //     baseline regen between them: 0 diff px on 17/18 sections at all 3 viewports; shell-header
      //     (has a rounded avatar badge) settled at 27-29 px both runs — not 0, but consistent.
      //   - radius signal, --r-card 12px->20px rebuilt, same threshold:0: panel 400 px at every
      //     viewport (rock stable), shell-header 298-320 px. Every other section: 0 (they don't render
      //     a --r-card/--r-lg-radiused edge, e.g. sheet's dialog never opens in the gallery).
      //   - threshold:0.1 was tried and rejected: it shrinks the radius signal to 36-55 px, landing
      //     within ~1.5x of where the threshold:0 noise floor sat — too close for comfort.
      // threshold:0 keeps the ~10x gap (noise <=29 vs signal >=298) and maxDiffPixels:100 sits in the
      // middle of it: >3x the observed noise ceiling, >3x under the weakest observed signal.
      await expect(section).toHaveScreenshot(`${name}-${vp.name}.png`, {
        animations: 'disabled',
        threshold: 0,
        maxDiffPixels: 100,
      });
    }
  });
}
