import { test, expect, Page } from '@playwright/test';
import { login, runId } from './_support';

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

/**
 * bh-benchmark-board picks its workouts with Math.random() — deliberately, per its own doc
 * ("never the same workout twice"). That makes any screenshot containing it non-reproducible:
 * the content changes AND so does the element's height, so masking does not help either (the
 * mask box is recomputed per run and the height shift leaves an unmasked sliver).
 *
 * Stubbing Math.random before navigation is the fix, and it must be installed BEFORE goto for the
 * same reason FROZEN_TIME must be — see that comment. The GALLERY needs this too, not just the
 * screens: the gallery grew a bh-benchmark-board section, and its baseline failed on every run
 * until this was applied there as well.
 */
async function freezeRandomBenchmark(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Math.random = () => 0.5;
  });
}

for (const vp of VIEWPORTS) {
  test(`component gallery is visually unchanged at ${vp.name}`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await freezeRandomBenchmark(page);
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

// ---------------------------------------------------------------------------------------------
// M13d Task 20: visual baselines for the milestone's ten rebuilt auth/account screens.
// account/security was deferred out of this milestone (2026-08-14, user's decision) and is NOT
// included here.
//
// Full-page screenshots, not per-section like the gallery above — these are single-purpose
// screens (one form, one message), not a component catalogue with independent sections to
// isolate. Two widths for EVERY screen, phone and desktop, even the narrow single-column ones
// that a11y.spec.ts only audits once — a11y's "one width is enough" is about a11y-tree coverage,
// not about whether the rendered layout differs, and it does (auth-layout's brand panel only
// shows >=720px).
const PHONE = VIEWPORTS.find(v => v.name === 'phone')!;
const DESKTOP = VIEWPORTS.find(v => v.name === 'desktop')!;

// benchmark-board.component.ts draws its two-workout pair with Math.random() ("never the same
// workout twice" — deliberate, see the component's own doc comment). login/signup/start-box/join
// all embed it in their brand panel, so left as-is every one of those captures is non-reproducible
// by construction: even a threshold:0 re-run against a baseline generated moments earlier can (and
// did, empirically) differ, because a shorter/longer movement list changes the panel's rendered
// height along with its text. Masking the element's bounding box doesn't fix this either — mask
// recomputes that box fresh each run, so a height that moved between generation and verification
// leaves an unmasked sliver where the two boxes don't overlap. Stubbing Math.random() before the
// app boots (same addInitScript-before-goto shape as page.clock.setFixedTime for FROZEN_TIME,
// which must also run before navigation) makes the pair, and the panel's height, deterministic —
// the actual fix, not a workaround for one.

const SCREENS: Array<{
  name: string;
  path: string;
  ready: (page: Page) => Promise<unknown>;
}> = [
  {
    name: 'login', path: '/app/auth/login',
    ready: page => expect(page.locator('[data-testid="login-form"]')).toBeVisible(),
  },
  {
    name: 'signup', path: '/app/auth/signup',
    ready: page => expect(page.locator('[data-testid="signup-form"]')).toBeVisible(),
  },
  {
    name: 'start-box', path: '/app/auth/start',
    ready: page => expect(page.locator('[data-testid="start-form"]')).toBeVisible(),
  },
  {
    name: 'check-email', path: '/app/auth/check-email?email=someone@example.com',
    ready: page => expect(page.locator('[data-testid="check-email-copy"]')).toBeVisible(),
  },
  {
    // A bogus token still round-trips to the backend (ngOnInit calls verifyEmail unconditionally
    // when a token is present) and comes back non-410 -> the 'error' state.
    name: 'verify', path: '/app/auth/verify?token=nope',
    ready: page => expect(page.locator('[data-testid="verify-error"]')).toBeVisible(),
  },
  {
    name: 'forgot', path: '/app/auth/forgot',
    ready: page => expect(page.locator('[data-testid="forgot-form"]')).toBeVisible(),
  },
  {
    // ResetPage's ngOnInit only checks for a MISSING token ('nope' is truthy) — no network call
    // happens until submit, so the form renders immediately instead of the 'expired' state.
    name: 'reset', path: '/app/auth/reset?token=nope',
    ready: page => expect(page.locator('[data-testid="reset-form"]')).toBeVisible(),
  },
  {
    name: 'account-email', path: '/app/account/email?token=nope',
    ready: page => expect(page.locator('[data-testid="email-confirm-error"]')).toBeVisible(),
  },
];

for (const screen of SCREENS) {
  for (const vp of [PHONE, DESKTOP]) {
    test(`${screen.name} (${vp.name}) is visually unchanged`, async ({ page }) => {
      await page.clock.setFixedTime(FROZEN_TIME);
      await freezeRandomBenchmark(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(screen.path);
      await screen.ready(page);
      await page.evaluate(() => document.fonts.ready);

      await expect(page).toHaveScreenshot(`${screen.name}-${vp.name}.png`, {
        animations: 'disabled',
        threshold: 0,
        maxDiffPixels: 100,
      });
    });
  }
}

// box-picker needs a session, and admin@demo.io has exactly one membership — login() AUTO-SELECTS
// it and redirects straight past the picker. Logging in and then navigating to /app/auth/boxes
// directly is the only way to see the picker itself (same trick as a11y.spec.ts).
for (const vp of [PHONE, DESKTOP]) {
  test(`box-picker (${vp.name}) is visually unchanged`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await login(page, 'admin@demo.io');
    await page.goto('/app/auth/boxes');
    await expect(page.getByRole('heading', { name: 'Your boxes' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    await expect(page).toHaveScreenshot(`box-picker-${vp.name}.png`, {
      animations: 'disabled',
      threshold: 0,
      maxDiffPixels: 100,
    });
  });
}

// join needs a real invite token, created the same way a11y.spec.ts does. Stamped with runId()
// plus a per-width suffix so the two widths in the same run can't collide on the invitee email,
// and opened in a SEPARATE, logged-out context — or this captures the logged-in accept-existing
// branch instead of the registration form.
async function createInvite(page: Page, emailSuffix: string): Promise<string> {
  await login(page, 'admin@demo.io');
  await page.goto('/app/admin/invites');
  await page.fill('[data-testid="invite-email"]', `e2e-visual-join-${runId()}-${emailSuffix}@t.io`);
  await page.selectOption('[data-testid="invite-plan"]', { label: 'No plan (bill manually)' });
  await page.click('[data-testid="invite-create"]');
  const link = await page.getByTestId('invite-link').textContent();
  // The invite link is already a full URL (see invite-flow.spec.ts) — do not prefix with origin.
  return link!;
}

for (const vp of [PHONE, DESKTOP]) {
  test(`join (${vp.name}) is visually unchanged`, async ({ page, context }) => {
    const link = await createInvite(page, vp.name);

    const invitee = await context.browser()!.newContext();
    const joinPage = await invitee.newPage();
    await joinPage.clock.setFixedTime(FROZEN_TIME);
    await freezeRandomBenchmark(joinPage);
    await joinPage.setViewportSize({ width: vp.width, height: vp.height });
    await joinPage.goto(link);
    await expect(joinPage.locator('[data-testid="join-form"]')).toBeVisible();
    await joinPage.evaluate(() => document.fonts.ready);

    // The email field echoes the runId()-stamped address createInvite() generated, so its text
    // differs on every run — unlike the benchmark board, that's not something a fixed Math.random()
    // can neutralize, so it's masked instead.
    await expect(joinPage).toHaveScreenshot(`join-${vp.name}.png`, {
      animations: 'disabled',
      threshold: 0,
      maxDiffPixels: 100,
      mask: [joinPage.locator('[data-testid="join-email"]')],
    });
    await invitee.close();
  });
}
