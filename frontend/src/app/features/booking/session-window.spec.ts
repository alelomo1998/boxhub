import { sessionWindow, covers } from './session-window';

function startOfDay(d: Date): Date { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; }
function addDays(d: Date, n: number): Date { const c = new Date(d); c.setDate(c.getDate() + n); return c; }

describe('sessionWindow', () => {
  it('spans 14 days before and 15 days after the selected day, for offset 0', () => {
    const today = startOfDay(new Date());
    const { from, to } = sessionWindow(0);
    expect(from.getTime()).toBe(addDays(today, -14).getTime());
    // to is clamped by now+14d, which is always <= today+15d — see the clamp test below.
    expect(to.getTime()).toBeLessThanOrEqual(addDays(today, 15).getTime());
  });

  it('clamps the upper bound at now + 14 days, never further out', () => {
    const { to } = sessionWindow(0);
    const maxTo = new Date(Date.now() + 14 * 864e5);
    expect(Math.abs(to.getTime() - maxTo.getTime())).toBeLessThan(1000);
  });

  it('shifts both bounds with a positive offset (paging into the future)', () => {
    const today = startOfDay(new Date());
    const { from } = sessionWindow(20);
    expect(from.getTime()).toBe(addDays(today, 6).getTime());
  });

  it('shifts both bounds with a negative offset (paging into the past)', () => {
    const today = startOfDay(new Date());
    const { from, to } = sessionWindow(-30);
    expect(from.getTime()).toBe(addDays(today, -44).getTime());
    expect(to.getTime()).toBe(addDays(today, -15).getTime());
  });
});

describe('covers', () => {
  it('is true for a day inside the window', () => {
    const window = sessionWindow(0);
    expect(covers(window, 0)).toBe(true);
    expect(covers(window, -14)).toBe(true);
  });

  it('is false for a day outside the window', () => {
    const window = sessionWindow(0);
    expect(covers(window, -15)).toBe(false);
    expect(covers(window, 100)).toBe(false);
  });

  it('never counts the day that starts at the window end as covered (its classes were not fetched)', () => {
    const window = sessionWindow(-30); // to = start of day -15
    expect(covers(window, -16)).toBe(true);
    expect(covers(window, -15)).toBe(false);
  });

  it('covers the last bookable day from today\'s window', () => {
    expect(covers(sessionWindow(0), 13)).toBe(true);
  });
});
