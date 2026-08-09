import { test, expect } from '@playwright/test';

// Dark only. The BACKLOG entry that requested this said "both themes"; that entry predates M13b,
// which deleted the light theme outright.
const VIEWPORTS = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

// bh-day-pager renders `new Date()` via `{{ day() | date:'EEEE d MMMM' }}` — real "today" — so a
// baseline generated on one date mismatches on every other date, forever. Frozen to Wednesday 12
// August 2026: unambiguous weekday/month in the rendered format, and noon UTC keeps the calendar
// date stable regardless of the container's local timezone. Confirmed empirically (Playwright
// 1.62 page.clock): the freeze must be installed BEFORE page.goto() — installing it after the
// page has already rendered does not retroactively update the DOM (day() only re-runs on the next
// change-detection pass, and nothing here triggers one), so the same real-date bug reappears if
// this call moves below goto().
const FROZEN_TIME = new Date('2026-08-12T12:00:00Z');

for (const vp of VIEWPORTS) {
  test(`component gallery is visually unchanged at ${vp.name}`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/app/dev/components');

    // Fonts must be settled, or the first baseline captures fallback metrics and every later run
    // diffs against a screenshot of the wrong typeface.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForSelector('[data-gallery="button"]');

    // bh-dock is position: fixed to the viewport (mobile-only chrome, <719px). It used to stay
    // pinned to the bottom of the real viewport regardless of scroll, so per-section screenshots
    // below 719px captured whatever the dock happened to be floating over at scroll time (observed
    // bleeding into search-bar, pill and wordmark) — that's why this test used to strip bh-dock
    // from the DOM before every capture. The gallery's [data-gallery="dock"] section now gives its
    // .dockwrap `contain: paint`, which makes that box the containing block for the fixed dock: the
    // dock renders inside its own section at every width instead of the viewport, so there's
    // nothing left to strip and the section's own baseline shows the real pill.

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
