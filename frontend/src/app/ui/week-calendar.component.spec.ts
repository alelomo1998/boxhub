import { TestBed } from '@angular/core/testing';
import { WeekCalendarComponent } from './week-calendar.component';

describe('WeekCalendarComponent', () => {
  function make(max = 13) {
    const fixture = TestBed.createComponent(WeekCalendarComponent);
    fixture.componentRef.setInput('max', max);
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

  it('shiftWeek moves seven days and clamps to [0, max]', () => {
    const fixture = make(13);
    const cmp = fixture.componentInstance;
    cmp.shiftWeek(-1);
    expect(cmp.offset()).toBe(0); // cannot go before today
    cmp.shiftWeek(1);
    expect(cmp.offset()).toBe(7);
    cmp.shiftWeek(1);
    expect(cmp.offset()).toBe(13); // clamped at max, not 14
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

  it('selects only a selectable day', () => {
    const fixture = make(13);
    const cmp = fixture.componentInstance;
    const past = cmp.week().find(d => !d.selectable);
    if (past) { cmp.select(past); expect(cmp.offset()).toBe(0); }
    const future = cmp.week().find(d => d.selectable && d.offset > 0)!;
    cmp.select(future);
    expect(cmp.offset()).toBe(future.offset);
  });

  it('ignores the click that ends a swipe', () => {
    const fixture = make(13);
    const cmp = fixture.componentInstance;
    const target = cmp.week().find(d => d.selectable && d.offset > 0)!;
    cmp.onPointerDown({ clientX: 200, clientY: 100 } as PointerEvent);
    cmp.onPointerUp({ clientX: 100, clientY: 105 } as PointerEvent); // swipe left = next day
    expect(cmp.offset()).toBe(1);
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
