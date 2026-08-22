import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { login, runId } from './_support';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('the component gallery has zero WCAG 2.2 AA violations', async ({ page }) => {
  await page.goto('/app/dev/components');
  await page.waitForSelector('[data-gallery="button"]');

  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map(v => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
});

// The shells are scoped to their CHROME. bh-shell-header and bh-dock are the only components that
// cannot be proven in the gallery, because their failure modes are compositional — focus order
// through a nav, landmark structure, ids duplicated across a header rendered three times.
//
// The scoping is the design, not a convenience: anything axe would report inside a screen BODY is
// out of scope by construction rather than by triage, which is what keeps M13c a component
// milestone instead of a screen-fixing one. Screen bodies belong to M14-M18.
const SHELLS = [
  { who: 'athlete@demo.io', at: '/app/athlete/home' },
  { who: 'coach@demo.io', at: '/app/coach/classes' },
  { who: 'admin@demo.io', at: '/app/admin/dashboard' },
];

// bh-dock is `display: none` above 719px — it's mobile-only chrome by design. Auditing it at the
// default 1280x720 viewport includes zero nodes and can never fail, so each target is paired with
// the width it actually renders at: the header at desktop, the dock at mobile. Playwright's
// default viewport (1280x720) already satisfies "desktop"; MOBILE is set explicitly per test.
const DESKTOP = { width: 1280, height: 720 };
const MOBILE = { width: 375, height: 812 };

const TARGETS = [
  { component: 'bh-shell-header', viewportName: 'desktop', viewport: DESKTOP },
  { component: 'bh-dock', viewportName: 'mobile', viewport: MOBILE },
] as const;

for (const shell of SHELLS) {
  for (const target of TARGETS) {
    test(`${shell.who} ${target.component} (${target.viewportName}) has zero WCAG 2.2 AA violations`, async ({ page }) => {
      // Width-dependent chrome (the dock) is CSS-only (@media, no JS gate), so setting the
      // viewport before navigating is enough to have it in the DOM and actually displayed.
      await page.setViewportSize(target.viewport);
      await login(page, shell.who);
      await page.goto(shell.at);

      // Non-vacuity: prove the target is actually present and visible before auditing it, so a
      // future empty `.include()` scope fails loudly here instead of silently passing zero nodes.
      if (target.component === 'bh-dock') {
        const nav = page.locator('bh-dock nav');
        await expect(nav).toBeVisible();
        expect(await page.locator('bh-dock nav a.item').count()).toBeGreaterThan(0);
      } else {
        await expect(page.locator('bh-shell-header header')).toBeVisible();
      }

      const { violations } = await new AxeBuilder({ page })
        .withTags(TAGS)
        .include(target.component)
        .analyze();

      expect(violations.map(v => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
    });
  }
}

// ---------------------------------------------------------------------------------------------
// M13d Task 19: axe coverage over the milestone's ten rebuilt auth/account screens.
// The old single account/security page was deferred out of this milestone (2026-08-14); its
// replacement, the four account sections, is covered by Task 12 below instead.
//
// Unlike SHELLS/TARGETS above, these are whole-page audits (no `.include()` scope) — the
// plumbing-vs-hero split that justifies scoping the shells doesn't apply inside a screen body,
// so there's nothing to narrow to.
//
// Same MOBILE as above (375x812). Desktop here is 1440x900, not the 1280x720 DESKTOP above —
// matching visual.spec.ts's own desktop breakpoint. Either width clears bh-auth-layout's 720px
// split media query (auth-layout.component.ts); 1440 is simply this suite's chosen "desktop".
const SCREEN_DESKTOP = { width: 1440, height: 900 };

/**
 * Every entry names a `ready` locator that must be visible BEFORE axe runs — the lesson recorded
 * above (bh-dock audited at 1280x720 inspected zero nodes, a test that could never fail)
 * generalizes to "prove you actually landed on the screen state you meant, not a redirect or a
 * bounce". A locator only that screen's target state renders (a form, an alert) is the proof.
 */
const SCREENS: Array<{
  name: string;
  path: string;
  widths: Array<{ width: number; height: number }>;
  ready: (page: Page) => Promise<unknown>;
  /** Task 12: the four account sections need a session; every other screen here is logged-out. */
  needsLogin?: boolean;
}> = [
  // Split screens (brand panel + form, >=720px only) — audited at BOTH widths, or a single-width
  // audit would never exercise one of the two layouts bh-auth-layout renders.
  {
    name: 'login', path: '/app/auth/login', widths: [MOBILE, SCREEN_DESKTOP],
    ready: page => expect(page.locator('[data-testid="login-form"]')).toBeVisible(),
  },
  {
    name: 'signup', path: '/app/auth/signup', widths: [MOBILE, SCREEN_DESKTOP],
    ready: page => expect(page.locator('[data-testid="signup-form"]')).toBeVisible(),
  },
  {
    // Demo platform seeds signup_mode=APPROVAL (V13__onboarding.sql) with well under max_boxes
    // boxes, so BoxSignupService.acceptingSignups() is true and the open form renders — not the
    // waitlist branch, which needs the platform at/over capacity.
    name: 'start-box', path: '/app/auth/start', widths: [MOBILE, SCREEN_DESKTOP],
    ready: page => expect(page.locator('[data-testid="start-form"]')).toBeVisible(),
  },

  // Narrow screens (one centred column at every width) — one audit each is enough.
  {
    name: 'check-email', path: '/app/auth/check-email?email=someone@example.com', widths: [MOBILE],
    ready: page => expect(page.locator('[data-testid="check-email-copy"]')).toBeVisible(),
  },
  {
    // A bogus token still round-trips to the backend (ngOnInit calls verifyEmail unconditionally
    // when a token is present) and comes back non-410 -> the 'error' state, per the brief.
    name: 'verify', path: '/app/auth/verify?token=nope', widths: [MOBILE],
    ready: page => expect(page.locator('[data-testid="verify-error"]')).toBeVisible(),
  },
  {
    name: 'forgot', path: '/app/auth/forgot', widths: [MOBILE],
    ready: page => expect(page.locator('[data-testid="forgot-form"]')).toBeVisible(),
  },
  {
    // Unlike verify, ResetPage's ngOnInit only checks for a MISSING token ('nope' is truthy) — no
    // network call happens until submit, so the form renders immediately. A missing token would
    // give 'expired' instead; this is deliberately the form state, not that one.
    name: 'reset', path: '/app/auth/reset?token=nope', widths: [MOBILE],
    ready: page => expect(page.locator('[data-testid="reset-form"]')).toBeVisible(),
  },
  {
    name: 'account-email', path: '/app/account/email?token=nope', widths: [MOBILE],
    ready: page => expect(page.locator('[data-testid="email-confirm-error"]')).toBeVisible(),
  },

  // Task 12: the four account sections. Unlike the screens above these need a session (login()
  // below, before goto) — the account area deliberately doesn't require an active box, so the
  // seeded admin@demo.io is fine. Audited at BOTH widths (no split layout here, but the brief
  // calls for both explicitly).
  {
    // passwordGoogleOnly is only known after a failed 409 — the form always renders first, and
    // admin@demo.io is a local-auth (non-Google) seeded account, so the form is the state reached.
    name: 'account-password', path: '/app/account/password', widths: [MOBILE, SCREEN_DESKTOP],
    ready: page => expect(page.locator('[data-testid="password-form"]')).toBeVisible(),
    needsLogin: true,
  },
  {
    name: 'account-change-email', path: '/app/account/change-email', widths: [MOBILE, SCREEN_DESKTOP],
    ready: page => expect(page.locator('[data-testid="email-form"]')).toBeVisible(),
    needsLogin: true,
  },
  {
    // sessions.page.ts starts in a 'loading' skeleton state; sessions-list only renders once state
    // flips to 'ready' AND at least one session came back. login() just created the current
    // session via a real request, so the list is non-empty — same proof-of-non-vacuity as
    // box-picker's "at least one membership row" below.
    name: 'account-sessions', path: '/app/account/sessions', widths: [MOBILE, SCREEN_DESKTOP],
    ready: page => expect(page.locator('[data-testid="sessions-list"]')).toBeVisible(),
    needsLogin: true,
  },
  {
    // Both sections (export, delete) render unconditionally — the delete-confirm sheet is closed
    // by default here, so its contents (delete-explain, delete-confirm-text, etc.) don't exist in
    // the DOM until openDelete() runs. This entry scans the closed state; the entry below opens
    // the sheet and scans that. Neither substitutes for the other.
    name: 'account-danger', path: '/app/account/danger', widths: [MOBILE, SCREEN_DESKTOP],
    ready: page => expect(page.locator('[data-testid="delete-open"]')).toBeVisible(),
    needsLogin: true,
  },
  {
    // The closed-state entry above stays: both states are real and neither substitutes for the
    // other. This one opens the sheet, which is where the product's only destructive flow lives —
    // an explanation, an export button with its own pending state, a conditional password field,
    // the type-DELETE confirm field, two conditional alerts and a filled danger submit. All of it
    // was unscanned because it does not exist in the DOM until openDelete() runs.
    name: 'account-danger-delete-sheet', path: '/app/account/danger',
    widths: [MOBILE, SCREEN_DESKTOP],
    ready: async page => {
      await page.locator('[data-testid="delete-open"]').click();
      await expect(page.locator('[data-testid="delete-confirm-text"]')).toBeVisible();
    },
    needsLogin: true,
  },
];

for (const screen of SCREENS) {
  for (const vp of screen.widths) {
    const widthName = vp.width === MOBILE.width ? 'mobile' : 'desktop';
    test(`${screen.name} (${widthName}) has zero WCAG 2.2 AA violations`, async ({ page }) => {
      await page.setViewportSize(vp);
      // bh-sheet's rise animation (200ms opacity 0->1, tokens.scss --dur) genuinely lowers
      // rendered contrast mid-transition, and axe can sample while it's still running — the
      // delete sheet's opened-state scan flaked red on a color-contrast violation that a
      // fixed-delay retry made disappear. bh-sheet already honors prefers-reduced-motion
      // (animation: none), so emulating it here removes the transition instead of racing it.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      if (screen.needsLogin) await login(page, 'admin@demo.io');
      await page.goto(screen.path);
      await screen.ready(page);

      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(violations.map(v => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
    });
  }
}

// box-picker needs a session, and admin@demo.io has exactly one membership — login() AUTO-SELECTS
// it and redirects straight past the picker. Logging in and then navigating to /app/auth/boxes
// directly is the only way to see the picker itself, not a URL that lands on it.
test('box-picker (mobile) has zero WCAG 2.2 AA violations', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await login(page, 'admin@demo.io');
  await page.goto('/app/auth/boxes');

  await expect(page.getByRole('heading', { name: 'Your boxes' })).toBeVisible();
  // At least one membership row rendered — the slug-keyed testid isn't known up front, so this
  // proves the list itself, the same shape as the bh-dock nav-count check above.
  expect(await page.locator('.list button.box').count()).toBeGreaterThan(0);

  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map(v => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
});

// join needs a real invite token, created the same way invite-flow.spec.ts does. Each test makes
// its own invite — stamped with runId() plus a per-width suffix so a rerun (or the two widths in
// the same run) can't collide on the invitee email — and opens it in a SEPARATE, logged-out
// context, or this would audit the logged-in accept-existing branch instead of the registration
// form the plan actually wants.
async function createInvite(page: Page, emailSuffix: string): Promise<string> {
  await login(page, 'admin@demo.io');
  await page.goto('/app/admin/invites');
  await page.fill('[data-testid="invite-email"]', `e2e-a11y-join-${runId()}-${emailSuffix}@t.io`);
  await page.selectOption('[data-testid="invite-plan"]', { label: 'No plan (bill manually)' });
  await page.click('[data-testid="invite-create"]');
  const link = await page.getByTestId('invite-link').textContent();
  // The invite link is already a full URL (see invite-flow.spec.ts) — do not prefix with origin.
  return link!;
}

for (const [widthName, vp] of [['mobile', MOBILE], ['desktop', SCREEN_DESKTOP]] as const) {
  test(`join (${widthName}) has zero WCAG 2.2 AA violations`, async ({ page, context }) => {
    const link = await createInvite(page, widthName);

    const invitee = await context.browser()!.newContext();
    const joinPage = await invitee.newPage();
    await joinPage.setViewportSize(vp);
    await joinPage.goto(link);
    await expect(joinPage.locator('[data-testid="join-form"]')).toBeVisible();

    const { violations } = await new AxeBuilder({ page: joinPage }).withTags(TAGS).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
    await invitee.close();
  });
}
