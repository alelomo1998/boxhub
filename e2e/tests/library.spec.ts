import { test, expect } from '@playwright/test';
import { login, runId } from './_support';

/**
 * The Library page (M14c-b R6/R6b-e), the piece editor's delete flow (Task 6), the class stack's
 * slot picker benchmark pick (Task 7), and the moved routes (Task 8). Supersedes Task 9.
 *
 * Every seeded row carries runId() so a rerun on the same stack can't collide with the last one.
 */

const id = runId();

type PWPage = import('@playwright/test').Page;

/** Spring's CSRF filter requires the XSRF-TOKEN cookie echoed back as a header on any
 *  state-changing request (Angular's HttpClient does this automatically; a raw page.request
 *  call does not). */
async function csrfHeaders(page: PWPage) {
  const xsrf = (await page.context().cookies()).find(c => c.name === 'XSRF-TOKEN')?.value ?? '';
  return { 'X-XSRF-TOKEN': xsrf };
}

/** One standalone library piece via the API -- cookie auth carries over from the logged-in page.
 *  scoreType is the DB's real enum (TIME/ROUNDS_REPS/LOAD/NONE) -- 'NOT_SCORED' is only the
 *  editor's client-side label for NONE. */
async function seedWod(page: PWPage, title: string, macro: string, blocks?: unknown) {
  const res = await page.request.post('/api/box/wods', {
    headers: await csrfHeaders(page),
    data: { title, macro, scoreType: 'NONE', blocks },
  });
  return res.json();
}

/** This is a long-lived demo stack: an earlier manual QA pass may have already added Fran to the
 *  library. A claimed Fran renders as a plain link (straight to the editor) instead of the global
 *  benchmark preview/pick path both Fran-using tests below depend on, and "never two Frans"
 *  (mergeLibrary dedupes by benchmarkTemplateId) means a stray copy also shadows the global row in
 *  the class stack's picker. Clearing it first makes both tests deterministic regardless of
 *  history -- a fresh stack simply has nothing to clear. */
async function resetFranToGlobal(page: PWPage) {
  const existing = (await (await page.request.get('/api/box/wods?search=Fran')).json())
    .filter((w: { title: string; benchmarkTemplateId: string | null }) => w.title === 'Fran' && w.benchmarkTemplateId);
  for (const w of existing) await page.request.delete(`/api/box/wods/${w.id}`, { headers: await csrfHeaders(page) });
}

/**
 * Must run first in this file: it asserts the exact first-page card count, which only holds while
 * these 55 rows are the most-recently-updated ones in the box (the library sorts newest first).
 * Any test before this one that creates a library row would race that ordering.
 */
test('library shows a page of cards, and scrolling loads more', async ({ page }) => {
  await login(page, 'coach@demo.io');
  const stamp = `E2E Scroll ${id}`;
  for (let i = 0; i < 55; i++) await seedWod(page, `${stamp} ${i}`, 'WORKOUT');

  await page.goto('/app/coach/wods');
  const ours = page.locator('[data-testid^="lib-card-"]', { hasText: stamp });
  await expect(page.locator('[data-testid^="lib-card-"]').first()).toBeVisible();
  await expect(ours).toHaveCount(50); // page one is entirely ours -- they're the newest 50

  await page.getByTestId('lib-sentinel').scrollIntoViewIfNeeded();
  await expect(ours).toHaveCount(55); // page two brings in the remaining 5
});

test('search ignores 1-2 characters and narrows on 3', async ({ page }) => {
  const title = `E2E Search Zqx${id} Only`;
  await login(page, 'coach@demo.io');
  await seedWod(page, title, 'WORKOUT');

  await page.goto('/app/coach/wods');
  await expect(page.locator('[data-testid^="lib-card-"]').first()).toBeVisible();
  const before = await page.locator('[data-testid^="lib-card-"]').count();

  await page.getByTestId('lib-search').fill('zq');
  await expect(page.getByText('Type at least 3 letters to search')).toBeVisible();
  await expect(page.locator('[data-testid^="lib-card-"]')).toHaveCount(before); // unchanged

  await page.getByTestId('lib-search').fill('zqx');
  // toHaveCount retries, which is what actually waits out the debounce + fetch -- a plain count()
  // right after fill() races the response and can read the still-unfiltered page. Narrowed, not
  // necessarily to exactly one: a rerun on the same stack leaves its own "Zqx..." row behind too
  // (nothing in this test deletes it), so this only asserts fewer than the unfiltered baseline.
  await expect(page.locator('[data-testid^="lib-card-"]')).not.toHaveCount(before);
  await expect(page.locator('[data-testid^="lib-card-"]', { hasText: title })).toBeVisible();
});

test('filter sheet narrows by category and movement; a chip removes; clear filters resets both', async ({ page }) => {
  await login(page, 'coach@demo.io');
  for (let i = 0; i < 3; i++) await seedWod(page, `E2E Strength ${id} ${i}`, 'STRENGTH');
  const movs = await (await page.request.get('/api/box/movements?search=Thruster')).json();
  const thruster = movs.find((m: { name: string }) => m.name === 'Thruster');
  const moveTitle = `E2E Movement ${id}`;
  await seedWod(page, moveTitle, 'WORKOUT', {
    blocks: [{ label: 'Block', lines: [{ text: 'Thruster', movementId: thruster.id, reps: '21', unit: 'REPS' }] }],
  });

  await page.goto('/app/coach/wods');
  await expect(page.locator('[data-testid^="lib-card-"]').first()).toBeVisible();

  // Category -> Strength -> Show N results -> only strength cards.
  await page.getByTestId('lib-filter').click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.getByTestId('filter-row-category').click();
  await page.getByTestId('filter-opt-category-STRENGTH').click(); // single-select auto-returns to menu
  await expect(page.getByTestId('filter-apply')).toContainText(/Show \d+ results?/);
  await page.getByTestId('filter-apply').click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.getByTestId('chip-remove-category-STRENGTH')).toBeVisible();
  const strengthCards = page.locator('[data-testid^="lib-card-"]');
  await expect(strengthCards.first()).toBeVisible();
  for (const t of await strengthCards.allTextContents()) expect(t).toMatch(/strength/i);

  // Removing the applied chip clears the facet (critique addition).
  await page.getByTestId('chip-remove-category-STRENGTH').click();
  await expect(page.getByTestId('chip-remove-category-STRENGTH')).toHaveCount(0);
  await expect(page.getByTestId('lib-filter').locator('.badge')).toHaveCount(0);

  // Movement: search "thrus" -> Thruster -> Back -> applied (custom facet stays on its step until Back).
  await page.getByTestId('lib-filter').click();
  await page.getByTestId('filter-row-movement').click();
  await page.getByTestId('filter-movement-search').fill('thrus');
  // Exact id, not a text match: the search also matches "Dumbbell Thruster".
  const thrusterRow = page.getByTestId(`filter-movement-${thruster.id}`);
  await expect(thrusterRow).toBeVisible();
  await thrusterRow.click();
  await expect(thrusterRow).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('filter-step-back').click();
  await expect(page.getByTestId('filter-row-movement')).toContainText('Thruster');
  await expect(page.getByTestId('filter-apply')).toContainText(/Show \d+ results?/);
  await page.getByTestId('filter-apply').click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="chip-remove-movement-"]')).toBeVisible();
  await expect(page.locator('[data-testid^="lib-card-"]', { hasText: moveTitle })).toBeVisible();

  // Clear filters: a search that matches nothing, combined with the active filter, hits the
  // no-match empty state whose one way out clears BOTH the search and the filters.
  await page.getByTestId('lib-search').fill(`zzzNoMatch${id}`);
  await expect(page.getByTestId('lib-clear-nomatch')).toBeVisible();
  await expect(page.getByTestId('lib-clear-nomatch')).toContainText(/clear filters/i);
  await page.getByTestId('lib-clear-nomatch').click();
  await expect(page.getByTestId('lib-search')).toHaveValue('');
  await expect(page.locator('[data-testid^="chip-remove-"]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="lib-card-"]').first()).toBeVisible();
});

test('Benchmarks chip: Fran opens, adds to the library with the Thruster line in kg, and deletes', async ({ page }) => {
  await login(page, 'coach@demo.io');
  await resetFranToGlobal(page);

  await page.goto('/app/coach/wods');
  await page.getByTestId('lib-benchmarks-chip').click();
  const franCard = page.locator('[data-testid^="lib-card-"]', { hasText: 'Fran' });
  await expect(franCard).toBeVisible();
  await franCard.click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await expect(page.locator('dialog[open]')).toContainText('Thruster');
  await expect(page.locator('dialog[open]')).toContainText('43'); // 95 lb -> 43 kg (demo box is kg)

  await page.getByTestId('bench-add').click();
  await page.waitForURL(/\/coach\/wods\/[^/]+$/);
  await expect(page.getByTestId('line-movement-0-0')).toContainText('Thruster');
  await expect(page.getByTestId('line-load-0-0')).toHaveValue('43');

  await page.getByTestId('piece-delete-open').click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await expect(page.getByTestId('piece-delete-benchmark')).toBeVisible(); // stays in Benchmarks note
  await page.getByTestId('piece-delete-confirm').click();
  await page.waitForURL(/\/coach\/wods$/);
  await expect(page.getByTestId('lib-deleted')).toContainText('Fran');
});

test('piece editor: Keep it keeps the piece, delete shows a notice, Back skips it, no trash on a new piece', async ({ page }) => {
  const title = `E2E Trash ${id}`;
  await login(page, 'coach@demo.io');

  await page.goto('/app/coach/wods/new');
  await expect(page.getByTestId('piece-title')).toBeVisible();
  await expect(page.getByTestId('piece-delete-open')).toHaveCount(0); // no trash on a brand-new piece

  await page.getByTestId('piece-title').fill(title);
  await page.getByTestId('piece-save').click();
  await page.waitForURL(/\/coach\/wods$/);

  await page.getByTestId('lib-search').fill(title);
  const card = page.locator('[data-testid^="lib-card-"]', { hasText: title });
  await expect(card).toBeVisible();
  await card.click();
  await page.waitForURL(/\/coach\/wods\/[^/]+$/);
  const editUrl = page.url();

  await page.getByTestId('piece-delete-open').click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.getByTestId('piece-delete-keep').click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.getByTestId('piece-title')).toHaveValue(title); // kept

  await page.getByTestId('piece-delete-open').click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.getByTestId('piece-delete-confirm').click();
  await page.waitForURL(/\/coach\/wods$/);
  await expect(page.getByTestId('lib-deleted')).toContainText(`${title} deleted.`);

  await page.goBack();
  expect(page.url()).not.toBe(editUrl); // the deleted piece's own history entry was replaced
});

test('History tab marks days and renders the selected day', async ({ page }) => {
  await login(page, 'coach@demo.io');
  await page.goto('/app/coach/wods');

  const daysReq = page.waitForResponse(r => r.url().includes('/wods/history/days'));
  await page.getByRole('radio', { name: 'History' }).click();
  const openDays: string[] = await (await daysReq).json();

  const marked = openDays.length
    ? page.getByTestId(`day-${openDays[0]}`)
    : page.locator('.day:not([disabled])').first();
  await expect(marked).toHaveAttribute('aria-label', openDays.length ? /pieces ran/ : /nothing ran/);
  await marked.click();
  await expect(page.locator('[data-testid^="hist-card-"], .empty').first()).toBeVisible();
});

test('coach: /coach/types and /coach/benchmarks redirect to their moved routes', async ({ page }) => {
  await login(page, 'coach@demo.io');

  await page.goto('/app/coach/types');
  await page.waitForURL(u => !u.pathname.endsWith('/types'));
  expect(page.url()).toContain('/coach/classes');

  await page.goto('/app/coach/benchmarks');
  await page.waitForURL(u => !u.pathname.endsWith('/benchmarks'));
  expect(page.url()).toContain('/coach/wods');
});

test('admin reaches the moved /admin/types page', async ({ page }) => {
  await login(page, 'admin@demo.io');
  await page.goto('/app/admin/types');
  await expect(page.getByRole('heading', { name: 'Types' })).toBeVisible();
  expect(page.url()).toContain('/admin/types');
});

test('class stack slot picker: a benchmark row carries the chip and fills with fromBenchmarkId', async ({ page }) => {
  await login(page, 'coach@demo.io');
  await resetFranToGlobal(page);
  await page.goto('/app/coach/classes');
  const burnRow = page.locator('.row', { hasText: 'Burn It' }).first();
  await expect(burnRow).toBeVisible();
  await burnRow.getByTestId('build-link').click();
  await expect(page.getByTestId('stack-form')).toBeVisible();

  const n = await page.locator('[data-testid^="slot-open-"], [data-testid^="piece-toggle-"]').count();
  await page.getByTestId('add-slot').click();
  await page.getByTestId('add-slot-WORKOUT').click();
  await page.getByTestId(`slot-open-${n}`).click();

  await page.getByTestId('pick-search').fill('Fran');
  const franRow = page.locator('[data-testid^="pick-row-"]', { hasText: 'Fran' });
  await expect(franRow).toBeVisible();
  await expect(franRow.locator('.chip')).toContainText('Benchmark');
  await franRow.click();

  await expect(page.getByTestId('slot-detail-step')).toBeVisible();
  await expect(page.getByTestId('slot-detail-step')).toContainText('Benchmark');
  await expect(page.getByTestId('slot-detail-step')).toContainText('43 kg'); // box unit, matches the library sheet
  await page.getByTestId('slot-detail-select').click();
  await expect(page.getByTestId(`piece-toggle-${n}`)).toContainText('Fran');

  const saved = page.waitForRequest(r => r.url().includes('/items') && r.method() === 'PUT');
  await page.getByTestId('save-draft').click();
  const body = (await saved).postDataJSON() as { items: { fromBenchmarkId: string | null }[] };
  // Loaded items always serialise fromBenchmarkId: null, so only the fresh pick may carry it.
  expect(body.items.filter(i => i.fromBenchmarkId)).toHaveLength(1);
});
