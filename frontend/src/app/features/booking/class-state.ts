import { SessionView } from './booking.service';
import { isPastDay } from './session-window';

export type Phase = 'finished' | 'started' | 'upcoming';
export type Mine = 'attended' | 'booked' | 'waitlist' | null;
export type Action = 'book' | 'waitlist' | 'cancel' | 'leave' | null;
export interface AthleteState {
  phase: Phase; mine: Mine; position: number | null; action: Action; spotsLeft: number | null; full: boolean;
}

/**
 * Every athlete booking rule in one place (M14c-b, user-ruled 2026-09-16): a past day or a started
 * class offers no action; a past day shows no spots; a checked-in athlete never sees Book or Cancel.
 * Book, class detail and Home all read this, so the rule cannot drift between them.
 */
export function athleteState(
  s: Pick<SessionView, 'startAt' | 'capacity' | 'bookedCount' | 'myBookingStatus' | 'myPosition'>,
  now: Date = new Date(),
): AthleteState {
  const phase: Phase = isPastDay(s.startAt, now) ? 'finished'
    : new Date(s.startAt).getTime() <= now.getTime() ? 'started' : 'upcoming';
  const mine: Mine = s.myBookingStatus === 'CHECKED_IN' ? 'attended'
    : s.myBookingStatus === 'BOOKED' ? 'booked'
    : s.myBookingStatus === 'WAITLIST' ? 'waitlist' : null;
  const full = s.bookedCount >= s.capacity;
  let action: Action = null;
  if (phase === 'upcoming') {
    if (mine === 'booked') action = 'cancel';
    else if (mine === 'waitlist') action = 'leave';
    else if (mine === null) action = full ? 'waitlist' : 'book';
  }
  return {
    phase, mine,
    position: mine === 'waitlist' ? s.myPosition : null,
    action,
    spotsLeft: phase === 'finished' ? null : Math.max(0, s.capacity - s.bookedCount),
    full: phase === 'finished' ? false : full,
  };
}
