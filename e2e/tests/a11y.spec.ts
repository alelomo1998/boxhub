import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { login } from './_support';

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
