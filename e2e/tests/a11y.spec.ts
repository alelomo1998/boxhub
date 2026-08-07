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

for (const shell of SHELLS) {
  test(`${shell.who} shell chrome has zero WCAG 2.2 AA violations`, async ({ page }) => {
    await login(page, shell.who);
    await page.goto(shell.at);

    const { violations } = await new AxeBuilder({ page })
      .withTags(TAGS)
      .include('bh-shell-header')
      .include('bh-dock')
      .analyze();

    expect(violations.map(v => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
  });
}
