import { test, expect } from '@playwright/test';
import { login, runId, nextDay } from './_support';

/** Composer's submit button carries no data-testid (bh-button gets no [testId] there — see
 *  conversations.page.ts), so it's found by role/type within the form instead. */
const SEND_BTN = 'form.composer button[type="submit"]';

test('athlete and coach round-trip a message, reached by search, not the conversation list', async ({ page }) => {
  test.setTimeout(45000);
  const stamp = runId();
  const athleteMsg = `Hey coach, e2e ping ${stamp}`;
  const coachReply = `Got it, e2e pong ${stamp}`;

  // athlete reaches the coach via the header envelope + search ("Start a chat" — A1.9: the list
  // shows conversations, not every addressable person).
  await login(page, 'athlete@demo.io');
  await page.getByTestId('athlete-messages-link').click();
  await expect(page).toHaveURL(/\/athlete\/messages/);
  await page.fill('[data-testid="messages-search"]', 'Demo Coach');
  const athleteRow = page.locator('[data-testid^="conversation-row-"], [data-testid^="contact-row-"]',
    { hasText: 'Demo Coach' }).first();
  await expect(athleteRow).toBeVisible();
  await athleteRow.click();
  await expect(page.getByTestId('conversation-pane')).toBeVisible();
  await page.fill('[data-testid="message-composer"]', athleteMsg);
  await page.locator(SEND_BTN).click();
  await expect(page.locator('.bubble', { hasText: athleteMsg })).toBeVisible({ timeout: 10000 });

  // coach logs in, sees it in their inbox, opens it, replies
  await login(page, 'coach@demo.io');
  await page.getByTestId('coach-messages-link').click();
  await expect(page).toHaveURL(/\/coach\/inbox/);
  const coachRow = page.locator('[data-testid^="conversation-row-"]', { hasText: 'Demo Athlete' }).first();
  await expect(coachRow).toBeVisible();
  await coachRow.click();
  await expect(page.locator('.bubble', { hasText: athleteMsg })).toBeVisible({ timeout: 10000 });
  await page.fill('[data-testid="message-composer"]', coachReply);
  await page.locator(SEND_BTN).click();
  await expect(page.locator('.bubble', { hasText: coachReply })).toBeVisible({ timeout: 10000 });

  // athlete sees the reply
  await login(page, 'athlete@demo.io');
  await page.getByTestId('athlete-messages-link').click();
  const athleteRow2 = page.locator('[data-testid^="conversation-row-"]', { hasText: 'Demo Coach' }).first();
  await expect(athleteRow2).toBeVisible();
  await athleteRow2.click();
  await expect(page.locator('.bubble', { hasText: coachReply })).toBeVisible({ timeout: 10000 });
});

test('a conversation opens scrolled to its newest message, not its oldest', async ({ page }) => {
  test.setTimeout(60000);
  const stamp = runId();

  await login(page, 'athlete@demo.io');
  // Narrow the viewport's HEIGHT (width stays >=900px so the two-pane desktop layout, and its
  // internally-scrolling .thread, is what's under test) so a handful of messages is enough to
  // overflow the thread instead of needing dozens.
  await page.setViewportSize({ width: 1000, height: 500 });
  await page.getByTestId('athlete-messages-link').click();
  await page.fill('[data-testid="messages-search"]', 'Jordan Blake');
  const row = page.locator('[data-testid^="conversation-row-"], [data-testid^="contact-row-"]',
    { hasText: 'Jordan Blake' }).first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByTestId('conversation-pane')).toBeVisible();

  const messages: string[] = [];
  for (let i = 0; i < 15; i++) {
    const text = `overflow ${stamp} #${i}`;
    messages.push(text);
    await page.fill('[data-testid="message-composer"]', text);
    await page.locator(SEND_BTN).click();
    await expect(page.locator('.bubble', { hasText: text })).toBeVisible({ timeout: 10000 });
  }
  const newest = messages[messages.length - 1];

  // Open it FRESH: leave the screen entirely, come back, and reselect the conversation — this is
  // what the fix actually has to get right (afterNextRender scrolling AFTER the rows exist).
  await page.goto('/app/athlete/home');
  await page.getByTestId('athlete-messages-link').click();
  await page.fill('[data-testid="messages-search"]', 'Jordan Blake');
  const row2 = page.locator('[data-testid^="conversation-row-"]', { hasText: 'Jordan Blake' }).first();
  await expect(row2).toBeVisible();
  await row2.click();

  const newestBubble = page.locator('.bubble', { hasText: newest });
  await expect(newestBubble).toBeVisible({ timeout: 10000 });
  // toBeInViewport actually checks scroll position (unlike toBeVisible, which only checks the
  // element renders with non-zero size) — this is the assertion that catches a thread stuck at
  // scrollTop 0 with the newest message rendered far below the fold.
  await expect(newestBubble).toBeInViewport({ timeout: 10000 });

  const thread = page.locator('.thread');
  const metrics = await thread.evaluate(el => ({
    scrollTop: el.scrollTop, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight,
  }));
  console.log('conversation thread scroll metrics (real DOM, not a written value):', JSON.stringify(metrics));
  expect(metrics.scrollHeight, 'thread must actually overflow for this test to prove anything')
    .toBeGreaterThan(metrics.clientHeight);
  expect(metrics.scrollTop + metrics.clientHeight).toBeGreaterThanOrEqual(metrics.scrollHeight - 4);
});

test("the class picker's height and header chrome do not move when paging, whatever a day holds", async ({ page }) => {
  test.setTimeout(45000);
  await login(page, 'admin@demo.io');
  await page.goto('/app/admin/announcements');
  await page.getByTestId('announcement-segment-class').click();
  await page.getByTestId('announcement-session-picker').click();
  await expect(page.getByTestId('announcement-picker-sheet')).toBeVisible();
  await page.waitForTimeout(300); // let the sheet's open animation settle before measuring

  // bh-week-calendar has no persistent per-day paging control (each day is its own cell, and
  // selecting one moves which cell is "current"). The one always-present, fixed-position control
  // left in the header is the "Next week" chevron — used here only as a position anchor to prove
  // the header doesn't shift when the list's content height changes. The day itself is still
  // advanced one at a time via nextDay(), never by clicking this chevron (that pages a week and
  // would skip most of the days this loop is meant to sample).
  const chromeAnchor = page.locator('button[aria-label="Next week"]');
  const emptyMarker = page.getByTestId('announcement-day-empty');
  const cardsMarker = page.locator('.tcard');

  const pickerBody = page.locator('.picker-body');

  const seenEmptyAt: number[] = [];
  const seenPopulatedAt: number[] = [];
  const cardCounts: number[] = [];
  const bodyHeights: number[] = [];
  const measured: { day: number; before: { x: number; y: number }; after: { x: number; y: number } }[] = [];

  for (let day = 0; day < 13; day++) {
    if (await emptyMarker.isVisible().catch(() => false)) seenEmptyAt.push(day);
    else if (await cardsMarker.first().isVisible().catch(() => false)) seenPopulatedAt.push(day);
    cardCounts.push(await cardsMarker.count());

    // The invariant the fix installed: the list box is a FIXED height, so it is the same size on
    // every day no matter how many classes that day holds. Asserting this rather than "some day in
    // the window happens to be empty" is what makes the test deterministic — whether an empty day
    // exists depends on the seeder and the clock, but the height must never depend on content.
    const bodyBox = await pickerBody.boundingBox();
    expect(bodyBox, `picker body must be present at day offset ${day}`).not.toBeNull();
    bodyHeights.push(Math.round(bodyBox!.height));

    const before = await chromeAnchor.boundingBox();
    expect(before, `header chevron must be present at day offset ${day}`).not.toBeNull();
    await nextDay(page);
    await page.waitForTimeout(150);
    const after = await chromeAnchor.boundingBox();
    expect(after, `header chevron must be present after paging past day offset ${day}`).not.toBeNull();

    // The real regression: paging changed the sheet's height because an empty day's content is
    // shorter than a populated day's, sliding the header chrome (and every card under a
    // still-pressed finger) up or down. Asserted on the chevron's ACTUAL bounding box, not a value
    // the component wrote.
    expect(after!.x, `day ${day}->${day + 1}: header chrome x moved`).toBeCloseTo(before!.x, 0);
    expect(after!.y, `day ${day}->${day + 1}: header chrome y moved`).toBeCloseTo(before!.y, 0);
    measured.push({ day, before: { x: before!.x, y: before!.y }, after: { x: after!.x, y: after!.y } });
  }

  console.log('header chrome boxes per transition:', JSON.stringify(measured));
  console.log('picker body heights per day:', JSON.stringify(bodyHeights));
  console.log('card counts per day:', JSON.stringify(cardCounts));
  console.log('empty-day offsets seen:', seenEmptyAt, '— populated-day offsets seen:', seenPopulatedAt);

  // Every day rendered the list box at exactly the same height. Under the old content-sized list
  // these values differed day to day, which is what slid the cards under a finger still resting on
  // the arrow.
  expect(new Set(bodyHeights).size, `picker body height varied across days: ${bodyHeights}`).toBe(1);

  // Deliberately NOT asserted: that the window contains an empty day. It did locally and did not in
  // CI, because only TODAY's offset can ever be empty and only once its classes have started — the
  // seeder's documented time-of-day dependence. That made the first version of this test fail on CI
  // for a reason that had nothing to do with the pager, which is how a suite trains people to
  // ignore red. The height invariant above covers the empty day when one occurs and holds when one
  // does not.
  expect(seenPopulatedAt.length, 'expected at least one populated day in the pageable window').toBeGreaterThan(0);
});

test('a CLASS_ROSTER announcement reaches only its roster, and read counts become real once the recipient opens it', async ({ page }) => {
  test.setTimeout(90000);
  const stamp = runId();
  const className = 'E2E Announce ' + stamp;
  const body = `Roster-only ping ${stamp}`;

  // admin creates a fresh, capacity-1 class so its roster is exactly one known athlete
  await login(page, 'admin@demo.io');
  await page.goto('/app/admin/schedule');
  await page.fill('[data-testid="template-name"]', className);
  await page.fill('input[name="capacity"]', '1');
  await page.click('[data-testid="template-create"]');
  await expect(page.locator('li', { hasText: className })).toBeVisible();

  // athlete@demo.io books the only slot — the deterministic "on the roster" member
  await login(page, 'athlete@demo.io');
  await page.goto('/app/athlete/book');
  await page.locator('.cards, .empty').first().waitFor();
  const bookCard = page.locator('.card', { hasText: className }).first();
  for (let i = 0; i < 14 && !(await bookCard.isVisible().catch(() => false)); i++) {
    await nextDay(page);
    await page.waitForTimeout(100);
  }
  await expect(bookCard).toBeVisible();
  await bookCard.getByTestId('book-btn').dispatchEvent('click');
  await expect(bookCard.getByText('Booked')).toBeVisible({ timeout: 10000 });

  // admin sends a CLASS_ROSTER announcement to that exact session
  await login(page, 'admin@demo.io');
  await page.goto('/app/admin/announcements');
  await page.getByTestId('announcement-segment-class').click();
  await page.getByTestId('announcement-session-picker').click();
  const targetCard = page.locator('[data-testid^="announcement-target-"]', { hasText: className });
  for (let i = 0; i < 14 && !(await targetCard.isVisible().catch(() => false)); i++) {
    await nextDay(page);
    await page.waitForTimeout(100);
  }
  await expect(targetCard).toBeVisible();
  await targetCard.click();
  await expect(page.getByTestId('announcement-session-picker')).toContainText(className);

  await page.fill('[data-testid="announcement-body"]', body);
  await page.getByTestId('announcement-send').click();
  await expect(page.getByTestId('announcement-confirm-count')).toBeVisible({ timeout: 10000 });
  await page.getByTestId('announcement-confirm-send').click();
  await expect(page.locator('[data-testid^="announcement-row-"]', { hasText: body })).toBeVisible({ timeout: 10000 });

  // the booked athlete sees it on their home card's sheet — opening it marks it read
  await login(page, 'athlete@demo.io');
  await page.goto('/app/athlete/home');
  await page.getByTestId('home-announcements-card').click();
  await expect(page.getByTestId('announcements-sheet')).toBeVisible();
  await expect(page.locator('[data-testid^="announcement-row-"]', { hasText: body })).toBeVisible({ timeout: 10000 });

  // an athlete never booked on this session — never a recipient — must NOT see it. The negative
  // case: asserted explicitly, not inferred from the positive one.
  await login(page, 'athlete2@demo.io');
  await page.goto('/app/athlete/home');
  await page.getByTestId('home-announcements-card').click();
  await expect(page.getByTestId('announcements-sheet')).toBeVisible();
  await expect(page.locator('[data-testid^="announcement-row-"]', { hasText: body })).toHaveCount(0);

  // the sender opens the same announcement from their history and sees the read count reflect
  // the one recipient who actually opened it — this is the loop that was inert until the mark-read
  // endpoint started being called.
  await login(page, 'admin@demo.io');
  await page.goto('/app/admin/announcements');
  const senderRow = page.locator('[data-testid^="announcement-row-"]', { hasText: body });
  await expect(senderRow).toBeVisible({ timeout: 10000 });
  await senderRow.click();
  const detailSheet = page.getByTestId('announcement-detail-sheet');
  await expect(detailSheet).toBeVisible();
  const recipientRow = page.locator('[data-testid^="announcement-recipient-"]', { hasText: 'Demo Athlete' });
  await expect(recipientRow).toBeVisible({ timeout: 10000 });
  await expect(recipientRow.getByTestId('announcement-recipient-read')).toBeVisible();
  await expect(detailSheet.locator('.dmeta')).toContainText('1/1');
});
