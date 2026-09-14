import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { WeekCalendarComponent } from './week-calendar.component';

describe('WeekCalendarComponent', () => {
  function make(max = 13, min?: number) {
    const fixture = TestBed.createComponent(WeekCalendarComponent);
    fixture.componentRef.setInput('max', max);
    if (min !== undefined) fixture.componentRef.setInput('min', min);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the calendar week containing the selected day, Monday first', () => {
    const fixture = make();
    const cmp = fixture.componentInstance;
    const week = cmp.week();
    expect(week.length).toBe(7);
    expect(week[0].date.getDay()).toBe(1); // Monday
    expect(week.some(d => d.offset === 0)).toBeTrue(); // today is in this week
  });

  it('marks days outside [0, max] unselectable', () => {
    const fixture = make(2);
    const week = fixture.componentInstance.week();
    expect(week.filter(d => d.selectable).every(d => d.offset >= 0 && d.offset <= 2)).toBeTrue();
    expect(week.some(d => !d.selectable)).toBeTrue();
  });

  it('defaults min to 0, so yesterday stays unselectable and every current consumer is unchanged', () => {
    const fixture = make();
    const cmp = fixture.componentInstance;
    const yesterday = cmp.week().find(d => d.offset === -1);
    // -1 is only in the visible week when today is not Monday; the assertion that matters either
    // way is canPrev, which is false on the current week regardless of which weekday today is.
    if (yesterday) expect(yesterday.selectable).toBeFalse();
    expect(cmp.canPrev()).toBeFalse();
  });

  it('a negative min opens past days: -30 makes yesterday selectable and canPrev true', () => {
    const fixture = make(13, -30);
    const cmp = fixture.componentInstance;
    const yesterday = cmp.week().find(d => d.offset === -1);
    if (yesterday) expect(yesterday.selectable).toBeTrue();
    expect(cmp.canPrev()).toBeTrue();
  });

  it("shiftWeek lands on the target week's Monday and clamps to [0, max]", () => {
    const fixture = make(13);
    const cmp = fixture.componentInstance;

    // Derived from the component's own week(), never hardcoded: today's weekday decides every
    // number here, so a literal would pass six days in seven and fail on the seventh. This spec
    // asserted `toBe(7)` when paging kept the weekday, which is exactly that trap.
    const thisMonday = cmp.week()[0].offset; // <= 0; 0 only when today IS Monday

    cmp.shiftWeek(1);
    expect(cmp.offset()).toBe(thisMonday + 7); // next week's MONDAY, not today + 7

    cmp.shiftWeek(-1);
    expect(cmp.offset()).toBe(0); // that Monday is at or before today, so it clamps onto today
  });

  it('shiftWeek never leaves the selectable range, whatever weekday today is', () => {
    const fixture = make(13);
    const cmp = fixture.componentInstance;
    for (let i = 0; i < 5; i++) cmp.shiftWeek(1); // walk past max deliberately
    expect(cmp.offset()).toBeLessThanOrEqual(13);
    expect(cmp.offset()).toBeGreaterThanOrEqual(0);
    expect(cmp.selectedDay().selectable).toBeTrue();
  });

  it('shiftDay moves one day and clamps', () => {
    const fixture = make(1);
    const cmp = fixture.componentInstance;
    cmp.shiftDay(-1);
    expect(cmp.offset()).toBe(0);
    cmp.shiftDay(1);
    expect(cmp.offset()).toBe(1);
    cmp.shiftDay(1);
    expect(cmp.offset()).toBe(1);
  });

  it('reads a tone by local ISO date and defaults absent days to none', () => {
    const fixture = make();
    const cmp = fixture.componentInstance;
    const todayIso = cmp.week().find(d => d.offset === 0)!.iso;
    fixture.componentRef.setInput('tones', { [todayIso]: 'full' });
    fixture.detectChanges();
    expect(cmp.week().find(d => d.offset === 0)!.tone).toBe('full');
    expect(cmp.week().filter(d => d.iso !== todayIso).every(d => d.tone === 'none')).toBeTrue();
  });

  // The two halves below are deliberately set up differently, because "is there a day of this
  // kind in the visible week" depends on TODAY'S WEEKDAY unless you force it.
  //
  // The first version of this looked for `selectable && offset > 0` in the default week. That is
  // absent exactly one day in seven: on a SUNDAY today is the last cell of a Monday-first week, so
  // no selectable day with a greater offset exists, `find()` returned undefined, and the
  // non-null assertion sailed past it into a TypeError. It passed every day until it did not.
  it('refuses a day outside [0, max]', () => {
    // max=2 guarantees an unselectable day whatever today is: either days past the horizon (early
    // in the week) or days already gone (late in it).
    const fixture = make(2);
    const cmp = fixture.componentInstance;
    const blocked = cmp.week().find(d => !d.selectable)!;
    expect(blocked).toBeDefined();
    cmp.select(blocked);
    expect(cmp.offset()).toBe(0); // the guard lives in select(), not only on [disabled]
  });

  it('selects a selectable day', () => {
    const fixture = make(13);
    const cmp = fixture.componentInstance;
    // Move a week out first: the week containing offset 7 has every day inside [1, 13] for ANY
    // starting weekday, so a fully-selectable week is guaranteed rather than hoped for.
    cmp.offset.set(7);
    fixture.detectChanges();
    expect(cmp.week().filter(d => d.selectable).length).toBe(7);

    const target = cmp.week().find(d => d.offset !== cmp.offset())!;
    cmp.select(target);
    expect(cmp.offset()).toBe(target.offset);
  });

  it('ignores the click that ends a swipe', () => {
    const fixture = make(13);
    const cmp = fixture.componentInstance;
    cmp.onPointerDown({ clientX: 200, clientY: 100 } as PointerEvent);
    cmp.onPointerUp({ clientX: 100, clientY: 105 } as PointerEvent); // swipe left = next day
    expect(cmp.offset()).toBe(1);
    fixture.detectChanges();

    // Picked AFTER the swipe, from the week now on screen — and asserted to exist rather than
    // non-null-asserted. Picking it from the pre-swipe week only ever worked because select()
    // short-circuits on `swiped` before it dereferences the day, so on a Sunday this test was
    // passing an undefined straight past a bug it could not have caught.
    const target = cmp.week().find(d => d.selectable && d.offset !== cmp.offset())!;
    expect(target).toBeDefined();
    cmp.select(target); // the click the browser fires after that swipe
    expect(cmp.offset()).toBe(1); // suppressed, not jumped
  });

  it('does not page on a vertical drag', () => {
    const fixture = make(13);
    const cmp = fixture.componentInstance;
    cmp.onPointerDown({ clientX: 200, clientY: 100 } as PointerEvent);
    cmp.onPointerUp({ clientX: 190, clientY: 400 } as PointerEvent);
    expect(cmp.offset()).toBe(0);
  });

  it('announces the SELECTED DAY, not the month, when the day changes', () => {
    // The month label only changes at a month boundary, so a live region on it says nothing for
    // six days out of seven. The superseded pager announced the full date on every change; this owes
    // the same. Regression guard for exactly that mistake.
    const fixture = make(13);
    const cmp = fixture.componentInstance;
    const live = () => fixture.nativeElement.querySelector('[aria-live="polite"]').textContent.trim();

    const before = live();
    cmp.shiftDay(1);
    fixture.detectChanges();
    expect(live()).not.toBe(before);
    expect(live()).toBe(cmp.dayLabel(cmp.selectedDay()));
  });

  // ---- jump sheet (R6b finding 4) --------------------------------------------------------------

  it('the month label is a plain span, not a button, when jump is false (default, every existing consumer)', () => {
    const fixture = make();
    const el = fixture.nativeElement;
    expect(el.querySelector('.mon').tagName).toBe('SPAN');
    expect(el.querySelector('[data-testid="wc-jump-open"]')).toBeFalsy();
  });

  it('jump: open, step the year back, pick October then day 10, lands on that day\'s offset', () => {
    const fixture = make(0, -400);
    fixture.componentRef.setInput('jump', true);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    const el = fixture.nativeElement;

    (el.querySelector('[data-testid="wc-jump-open"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(cmp.jumpYear()).toBe(cmp.selected().getFullYear());

    (el.querySelector('[data-testid="wc-jump-year-prev"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const targetYear = cmp.jumpYear();
    expect(targetYear).toBe(cmp.selected().getFullYear() - 1);

    (el.querySelector('[data-testid="wc-jump-month-9"]') as HTMLButtonElement).click(); // October
    fixture.detectChanges();
    expect(cmp.jumpStep()).toBe('days');

    const targetDate = new Date(targetYear, 9, 10);
    const iso = `${targetDate.getFullYear()}-10-10`;
    (el.querySelector(`[data-testid="wc-jump-day-${iso}"]`) as HTMLButtonElement).click();
    fixture.detectChanges();

    const expectedOffset = Math.round((targetDate.getTime() - cmp.today().getTime()) / 864e5);
    expect(cmp.offset()).toBe(expectedOffset);
    expect(cmp.jumpOpen()).toBeFalse(); // picking a day closes the sheet
  });

  it('jump: the month label button keeps the plain label\'s type, like every other calendar', () => {
    const fixture = make();
    fixture.detectChanges();
    document.body.appendChild(fixture.nativeElement);
    const type = (e: Element) => { const c = getComputedStyle(e); return [c.fontSize, c.fontWeight, c.textTransform, c.fontFamily]; };
    const plain = type(fixture.nativeElement.querySelector('.mon'));
    expect(plain[0]).not.toBe('');

    fixture.componentRef.setInput('jump', true);
    fixture.detectChanges();
    expect(type(fixture.nativeElement.querySelector('[data-testid="wc-jump-open"]'))).toEqual(plain);
    fixture.nativeElement.remove();
  });

  it('jump: a day outside [min, max] is disabled and clicking it does nothing', () => {
    const fixture = make(2, 0); // a narrow horizon guarantees the current month has an out-of-range day
    fixture.componentRef.setInput('jump', true);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    const el = fixture.nativeElement;
    const startOffset = cmp.offset();

    (el.querySelector('[data-testid="wc-jump-open"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el.querySelector(`[data-testid="wc-jump-month-${cmp.selected().getMonth()}"]`) as HTMLButtonElement).click();
    fixture.detectChanges();

    const blocked = cmp.jumpDays().find(d => d && !d.selectable)!;
    expect(blocked).toBeDefined();
    const btn = el.querySelector(`[data-testid="wc-jump-day-${blocked.iso}"]`) as HTMLButtonElement;
    expect(btn.disabled).toBeTrue();
    btn.click();
    fixture.detectChanges();

    expect(cmp.offset()).toBe(startOffset);
    expect(cmp.jumpOpen()).toBeTrue(); // nothing happened, sheet stays open
  });

  it('jump: Back returns from the day grid to the month grid', () => {
    const fixture = make();
    fixture.componentRef.setInput('jump', true);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    const el = fixture.nativeElement;

    (el.querySelector('[data-testid="wc-jump-open"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el.querySelector(`[data-testid="wc-jump-month-${cmp.selected().getMonth()}"]`) as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(cmp.jumpStep()).toBe('days');

    (el.querySelector('[data-testid="wc-jump-back"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(cmp.jumpStep()).toBe('months');
  });

  it('jump: focus follows the step swap instead of falling to the body', fakeAsync(() => {
    const fixture = make();
    fixture.componentRef.setInput('jump', true);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    const el = fixture.nativeElement;
    document.body.appendChild(el);

    (el.querySelector('[data-testid="wc-jump-open"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const month = cmp.selected().getMonth();
    (el.querySelector(`[data-testid="wc-jump-month-${month}"]`) as HTMLButtonElement).click();
    fixture.detectChanges();
    tick();
    expect(document.activeElement?.getAttribute('data-testid')).toBe('wc-jump-back');

    (el.querySelector('[data-testid="wc-jump-back"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    tick();
    expect(document.activeElement?.getAttribute('data-testid')).toBe(`wc-jump-month-${month}`);
    el.remove();
  }));

  it('gives every day an accessible name that states availability in words', () => {
    const fixture = make();
    const cmp = fixture.componentInstance;
    const todayIso = cmp.week().find(d => d.offset === 0)!.iso;
    fixture.componentRef.setInput('tones', { [todayIso]: 'full' });
    fixture.detectChanges();
    const labels = Array.from(fixture.nativeElement.querySelectorAll('.day'))
      .map((b: any) => b.getAttribute('aria-label'));
    expect(labels.some((l: string) => l?.includes('classes full'))).toBeTrue();
    expect(labels.some((l: string) => l?.includes('no classes'))).toBeTrue();
  });
});
