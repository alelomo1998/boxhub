import { Page } from '@playwright/test';

/**
 * One id per test process. Every entity a spec CREATES must carry it, so a rerun against the
 * same stack cannot collide with the previous run's rows. Seeded read-only fixtures (the demo
 * box, admin@demo.io, the seeded weekly schedule) are shared on purpose and are NOT stamped —
 * the rule is about data a spec creates, not data it reads.
 *
 * Six of the eight data-writing specs already did this ad hoc with Date.now(); this is the same
 * idea in one place, so the next spec author inherits it instead of rediscovering it.
 */
const RUN_ID = String(Date.now());

export function runId(): string {
  return RUN_ID;
}

/** Was copy-pasted verbatim into 8 spec files. */
export async function login(page: Page, email: string, password = 'boxhub-demo-2026'): Promise<void> {
  await page.goto('/app/auth/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !u.pathname.includes('/auth/login'), { timeout: 20000 });
}

/**
 * Advance the week strip by ONE day, cumulatively.
 *
 * Reads the currently selected cell rather than computing from wall-clock "today". These call
 * sites loop up to 14 times hunting for a session whose weekday the fixture chose, so a helper
 * pinned to today+1 would click the same cell every iteration and never move — and the component
 * no-ops a click on the already-selected day, so that stall would be SILENT rather than a failure.
 *
 * Crosses a week boundary by paging the week first: the target cell is not in the strip until then.
 * Returns false when the horizon is exhausted, so a caller's loop can simply stop.
 */
export async function nextDay(page: Page): Promise<boolean> {
  const cur = await page.locator('.day[aria-current="date"]').first().getAttribute('data-testid');
  if (!cur) return false;
  const d = new Date(`${cur.replace('day-', '')}T12:00:00`); // noon: never lands on a DST edge
  d.setDate(d.getDate() + 1);
  const id = `day-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const cell = page.locator(`[data-testid="${id}"]`);
  if (await cell.count() === 0) {
    const week = page.locator('button[aria-label="Next week"]');
    if (await week.isDisabled()) return false;
    await week.click();
    // The strip re-renders asynchronously. Without waiting for the target cell to attach, the
    // count() below reads the PRE-CLICK DOM, finds nothing and reports the horizon exhausted
    // while most of it is still ahead — silently, since callers just stop looping. That is how
    // this stalled on day 1 of 14: today was a Saturday, so the first target in the next
    // calendar week was only two days out.
    await cell.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
  }
  if (await cell.count() === 0) return false; // past the booking horizon
  // Beyond max(), the cell is still rendered (the current week always shows all 7 days) but
  // carries [disabled] rather than being absent — a day past the booking horizon, not a missing
  // week page. Checking count() alone let this fall through into a doomed click().
  if (await cell.isDisabled()) return false;
  await cell.click();
  return true;
}
