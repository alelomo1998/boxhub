import { test, expect, Page } from '@playwright/test';
import { login, runId } from './_support';

/**
 * Northside Barbell is used throughout this file instead of the demo box: DevDataSeeder only
 * calls seedClassesAndProgramming(demo, ...) — Northside carries ZERO schedule slots out of the
 * box. Every weekday there is genuinely empty until a test creates something on it, which is what
 * makes the 'full'/'none' tone assertions possible at all: on the demo box every weekday already
 * carries a WOD Class (cap 14) + Burn It (cap 12), both perpetually open, so no day there can ever
 * render 'full' or 'none' without draining or mutating shared seed data.
 *
 * multi@demo.io / triple@demo.io / duo@demo.io each hold a SECOND membership at Northside (admin /
 * coach / athlete respectively) alongside their demo-box membership, so login() lands them on the
 * gyms hub and one click on `gym-northside` reaches the role-appropriate shell there.
 *
 * Known limitation, same shape as booking-flow.spec.ts's ever-growing "E2E WOD" classes on the demo
 * box: a weekly template recurs for the life of the box, so a rerun within the same ~2-week horizon
 * can collide with a PRIOR run's own fixtures on the same weekday. Not solved here for the same
 * reason it isn't solved there — accepted, pre-existing convention, not a new problem.
 */
async function gotoNorthside(page: Page, email: string): Promise<void> {
  await login(page, email);
  await expect(page).toHaveURL(/\/app\/gyms$/);
  await page.getByTestId('gym-northside').click();
}

/**
 * plans.page.ts and subscriptions.page.ts predate M13c's testId-on-inner-element convention: their
 * bh-button carries a bare `data-testid` HOST attribute, which stretches wider than the real
 * <button> inside, so a click can land in empty space. Same note as memberships.spec.ts.
 */
const btn = (testId: string) => `button[data-testid="${testId}"], [data-testid="${testId}"] button`;

async function selectByOptionText(page: Page, testId: string, text: string) {
  const select = page.locator(`[data-testid="${testId}"]`);
  const value = await select.locator('option', { hasText: text }).first().getAttribute('value');
  if (!value) throw new Error(`no option matching "${text}" in [data-testid="${testId}"]`);
  await select.selectOption(value);
}

/**
 * Northside carries no plans either (seedPlansAndSubscriptions is demo-box-only), so booking
 * ANY session there fails the NO_ACTIVE_SUBSCRIPTION entitlement gate until one exists. Idempotent
 * by consequence rather than by check: a second call hits SWITCH_REQUIRES_CANCEL (rp-error) because
 * the athlete is already actively subscribed from the first call — either outcome leaves a valid
 * active subscription in place, so both are treated as success here.
 */
async function ensureNorthsideSubscription(page: Page, athleteEmail: string): Promise<void> {
  const planName = `Northside Plan ${runId()}`;
  await page.goto('/app/admin/plans');
  await page.fill('[data-testid="plan-name"]', planName);
  await page.fill('[data-testid="plan-price"]', '49');
  await page.click(btn('plan-create'));
  await expect(page.locator('li', { hasText: planName })).toBeVisible();

  await page.goto('/app/admin/subscriptions');
  await page.fill('[data-testid="rp-search"]', athleteEmail);
  await selectByOptionText(page, 'rp-member', athleteEmail);
  await selectByOptionText(page, 'rp-plan', planName);
  await page.click(btn('rp-submit'));
  await Promise.race([
    page.getByTestId('rp-confirmed').waitFor({ state: 'visible', timeout: 8000 }),
    page.getByTestId('rp-error').waitFor({ state: 'visible', timeout: 8000 }),
  ]).catch(() => {});
}

function addDays(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

/** Matches week-calendar's own isoOf(): LOCAL calendar date, not toISOString(). */
function isoOfLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Monday-first weekday index (0=Mon..6=Sun), matching the admin form's <option value>. */
function mondayFirstWeekday(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/**
 * Clicks `btn` only if it looks enabled right now, with a SHORT per-click timeout — [disabled]
 * can flip between the precheck and the actual click (an OnPush re-render from the previous press
 * landing a tick late), and without a tight timeout here that race turns into the full 30s default
 * test timeout instead of just moving on. Returns whether the click actually happened.
 */
async function clickIfEnabled(btn: ReturnType<Page['locator']>): Promise<boolean> {
  if (await btn.isDisabled()) return false;
  try {
    await btn.click({ timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Brings the week containing `targetIso` into view via the STRIP-LEVEL "Previous/Next week"
 * controls (never by repeated day-stepping — that is the pager this milestone replaced).
 *
 * Always retraces the SAME forward-only path a fresh page load would take, by first paging back
 * to the earliest reachable week. Weeks move by a fixed +/-7, so two visits to the same strip do
 * not compose into arbitrary offsets: a second call in the same test that tries to resume from
 * wherever the FIRST call's "Next week" presses landed can find its own target sitting in the gap
 * between two week-jump "attractors" and oscillate forever between them. Resetting first avoids
 * that entirely. Bounded to a few presses each way. Does not click the day cell itself — callers
 * decide whether to select it or just read its tone.
 */
async function revealDay(page: Page, targetIso: string) {
  const cell = page.locator(`[data-testid="day-${targetIso}"]`);
  if ((await cell.count()) > 0) return cell;

  const prevBtn = page.locator('button[aria-label="Previous week"]');
  for (let i = 0; i < 4 && (await clickIfEnabled(prevBtn)); i++) { /* walk back to the earliest week */ }

  const nextBtn = page.locator('button[aria-label="Next week"]');
  for (let i = 0; i < 4 && (await cell.count()) === 0; i++) {
    if (!(await clickIfEnabled(nextBtn))) break;
    await cell.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
  }
  return cell;
}

test('a class on a later day is reachable in one tap on its day cell', async ({ page }) => {
  const stamp = runId();
  const className = `Northside OneTap ${stamp}`;
  const target = addDays(4);
  const iso = isoOfLocal(target);
  const weekday = mondayFirstWeekday(target);

  // admin creates a weekly slot on that one weekday only
  await gotoNorthside(page, 'multi@demo.io');
  await expect(page).toHaveURL(/\/app\/admin/);
  await page.goto('/app/admin/schedule');
  await page.getByTestId('schedule-add-slot').click();
  await page.getByTestId('schedule-name').fill(className);
  await page.getByTestId('schedule-weekday').selectOption(String(weekday));
  await page.getByTestId('schedule-slot-save').click();
  await expect(page.locator('.trow', { hasText: className })).toBeVisible();

  // coach lands on TODAY by default — the class is on a different weekday, so it must not
  // already be showing before we navigate to it.
  await gotoNorthside(page, 'triple@demo.io');
  await expect(page).toHaveURL(/\/app\/coach/);
  await page.goto('/app/coach/classes');
  await expect(page.locator('.row', { hasText: className })).not.toBeVisible();

  // paging to the right WEEK is the strip's separate chevron affordance, not the "step to the
  // next day" pager this milestone deleted — the tap under test is the single click below.
  const cell = await revealDay(page, iso);
  await expect(cell).toBeVisible();
  await expect(cell).toBeEnabled();

  await cell.click(); // <-- the one tap the filed complaint is about
  await expect(page.locator('.row', { hasText: className })).toBeVisible();
});

test('the dots tell the truth: open, full and none render as words in the aria-label', async ({ page }) => {
  const stamp = runId();
  const openName = `Northside Open ${stamp}`;
  const fullName = `Northside Full ${stamp}`;

  const openDay = addDays(8);
  const fullDay = addDays(7);
  const noneDay = addDays(10); // no template ever targets this weekday

  const openIso = isoOfLocal(openDay);
  const fullIso = isoOfLocal(fullDay);
  const noneIso = isoOfLocal(noneDay);

  // admin creates an open (capacity 5, unbooked) slot and a capacity-1 slot on two other weekdays
  await gotoNorthside(page, 'multi@demo.io');
  await expect(page).toHaveURL(/\/app\/admin/);
  await page.goto('/app/admin/schedule');

  await page.getByTestId('schedule-add-slot').click();
  await page.getByTestId('schedule-name').fill(openName);
  await page.getByTestId('schedule-weekday').selectOption(String(mondayFirstWeekday(openDay)));
  await page.getByTestId('schedule-capacity').fill('5');
  await page.getByTestId('schedule-slot-save').click();
  await expect(page.locator('.trow', { hasText: openName })).toBeVisible();

  await page.getByTestId('schedule-add-slot').click();
  await page.getByTestId('schedule-name').fill(fullName);
  await page.getByTestId('schedule-weekday').selectOption(String(mondayFirstWeekday(fullDay)));
  await page.getByTestId('schedule-capacity').fill('1');
  await page.getByTestId('schedule-slot-save').click();
  await expect(page.locator('.trow', { hasText: fullName })).toBeVisible();

  // Northside has no plans either, so duo@demo.io needs an active subscription there before it
  // can book at all — same entitlement gate memberships.spec.ts exercises on the demo box.
  await ensureNorthsideSubscription(page, 'duo@demo.io');

  // athlete books the ONLY spot on the capacity-1 day, so that day's only session is now at capacity
  await gotoNorthside(page, 'duo@demo.io');
  await expect(page).toHaveURL(/\/app\/athlete/);
  await page.goto('/app/athlete/book');
  const fullDayCell = await revealDay(page, fullIso);
  await fullDayCell.click();
  const fullCard = page.locator('.card', { hasText: fullName });
  await expect(fullCard).toBeVisible();
  await fullCard.getByTestId('book-btn').dispatchEvent('click');
  await expect(fullCard.getByText('Booked')).toBeVisible({ timeout: 10000 });

  // back to admin's own week strip to read the three day cells' accessible names
  await gotoNorthside(page, 'multi@demo.io');
  await expect(page).toHaveURL(/\/app\/admin/);
  await page.goto('/app/admin/schedule');

  const openCell = await revealDay(page, openIso);
  await expect(openCell).toHaveAttribute('aria-label', /classes available/);

  const fullCell = await revealDay(page, fullIso);
  await expect(fullCell).toHaveAttribute('aria-label', /classes full/);

  const noneCell = await revealDay(page, noneIso);
  await expect(noneCell).toHaveAttribute('aria-label', /no classes/);
});

test('the rebuilt admin form submits on Enter, not only on a button click', async ({ page }) => {
  const stamp = runId();
  const className = `Northside Enter ${stamp}`;
  const weekday = mondayFirstWeekday(addDays(5));

  await gotoNorthside(page, 'multi@demo.io');
  await expect(page).toHaveURL(/\/app\/admin/);
  await page.goto('/app/admin/schedule');

  await page.getByTestId('schedule-add-slot').click();
  await page.getByTestId('schedule-name').fill(className);
  await page.getByTestId('schedule-weekday').selectOption(String(weekday));

  // Enter submits regardless of any button's [disabled] — this screen moved off the old
  // (ngSubmit)-on-a-template-form binding, exactly the class of failure that once shipped a
  // password into the URL on login. No click on schedule-slot-save anywhere in this test.
  await page.getByTestId('schedule-capacity').press('Enter');

  await expect(page.locator('.trow', { hasText: className })).toBeVisible();
  // the sheet closes itself on save success
  await expect(page.getByTestId('schedule-slot-sheet')).toBeHidden();
});

test('editing a slot with a live booking is refused, and the retry applies from the next free day', async ({ page }) => {
  const stamp = runId();
  const className = `Northside Refusal ${stamp}`;
  const target = addDays(6);
  const iso = isoOfLocal(target);
  const weekday = mondayFirstWeekday(target);

  // admin creates the slot
  await gotoNorthside(page, 'multi@demo.io');
  await expect(page).toHaveURL(/\/app\/admin/);
  await page.goto('/app/admin/schedule');
  await page.getByTestId('schedule-add-slot').click();
  await page.getByTestId('schedule-name').fill(className);
  await page.getByTestId('schedule-weekday').selectOption(String(weekday));
  await page.getByTestId('schedule-slot-save').click();
  await expect(page.locator('.trow', { hasText: className })).toBeVisible();

  await ensureNorthsideSubscription(page, 'duo@demo.io');

  // athlete books the one generated session — a live BOOKED claim on that date
  await gotoNorthside(page, 'duo@demo.io');
  await expect(page).toHaveURL(/\/app\/athlete/);
  await page.goto('/app/athlete/book');
  const dayCell = await revealDay(page, iso);
  await dayCell.click();
  const card = page.locator('.card', { hasText: className });
  await expect(card).toBeVisible();
  await card.getByTestId('book-btn').dispatchEvent('click');
  await expect(card.getByText('Booked')).toBeVisible({ timeout: 10000 });

  // admin edits the slot's start time — regenerateFrom(today) would delete-and-recreate every
  // future occurrence, INCLUDING the one just booked, so it must refuse rather than cancel it
  await gotoNorthside(page, 'multi@demo.io');
  await expect(page).toHaveURL(/\/app\/admin/);
  await page.goto('/app/admin/schedule');
  await page.locator('.trow', { hasText: className }).click();
  await page.getByTestId('schedule-starttime').fill('07:00');
  await page.getByTestId('schedule-slot-save').click();

  const alert = page.getByTestId('schedule-blocked-alert');
  await expect(alert).toBeVisible();

  // the retry applies the same change from the next free day instead
  await page.getByTestId('apply-from-retry').click();
  await expect(alert).not.toBeVisible();
  await expect(page.getByTestId('schedule-slot-sheet')).toBeHidden();
  await expect(page.locator('.trow', { hasText: className })).toContainText('07:00');
});
