export interface SessionWindow { from: Date; to: Date; }

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/**
 * Load window for a sessions list, centred on the SELECTED day rather than fixed at today — the
 * week strip can now page into the past (and further into the future via jump), so a fetch scoped
 * to [today, now+14d] misses whatever day the strip lands on.
 *
 * `offset` is days from today, same contract as bh-week-calendar's `offset`. Upper bound stays
 * clamped at now+14d (Box.bookingHorizonWeeks's 2-week default, the ceiling every consumer already
 * used) so paging forward never asks for classes that don't exist yet.
 */
export function sessionWindow(offset: number): SessionWindow {
  const selected = startOfDay(new Date());
  selected.setDate(selected.getDate() + offset);
  const from = new Date(selected);
  from.setDate(from.getDate() - 14);
  const to = new Date(selected);
  to.setDate(to.getDate() + 15);
  const maxTo = new Date(Date.now() + 14 * 864e5);
  return { from, to: to < maxTo ? to : maxTo };
}

/** True when `window` already includes the WHOLE day at `offset` — no reload needed. `to` is the
 *  midnight that starts its last day, so a day beginning there is not covered. */
export function covers(window: SessionWindow, offset: number): boolean {
  const day = startOfDay(new Date());
  day.setDate(day.getDate() + offset);
  const next = new Date(day);
  next.setDate(next.getDate() + 1);
  return day.getTime() >= window.from.getTime() && next.getTime() <= window.to.getTime();
}

/** A session is past when its start is on a calendar day before today (local time) — today's
 *  classes keep every action, so this is day-level, not "already started". `now` defaults to the
 *  real clock; callers pin it for deterministic tests. */
export function isPastDay(startAt: string, now: Date = new Date()): boolean {
  const d = new Date(startAt);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  return day.getTime() < today.getTime();
}
