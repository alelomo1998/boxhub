import { DayTone } from '../../ui/week-calendar.component';
import { SessionView } from './booking.service';

/**
 * Per-day availability for bh-week-calendar's dots, rolled up from sessions a screen has ALREADY
 * fetched — deliberately not a request of its own, since every consumer holds the whole horizon.
 *
 * A day is 'open' if any session still has a place, and 'full' only when every session that day is
 * at capacity. A day with no sessions is absent from the map, which the component reads as 'none'.
 *
 * Keyed by LOCAL calendar date, matching the component's own isoOf(): toISOString() would convert
 * to UTC and key the dots a day out for every box west of Greenwich.
 */
export function tonesOf(sessions: SessionView[]): Record<string, DayTone> {
  const out: Record<string, DayTone> = {};
  for (const s of sessions) {
    const d = new Date(s.startAt);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (out[iso] === 'open') continue;              // one open session is enough to mark the day
    out[iso] = s.bookedCount < s.capacity ? 'open' : 'full';
  }
  return out;
}
