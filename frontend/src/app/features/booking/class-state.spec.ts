import { athleteState } from './class-state';

const NOW = new Date(2026, 8, 17, 12, 0); // local 17 Sep 2026 12:00
const at = (d: number, h: number) => new Date(2026, 8, d, h, 0).toISOString();
const base = { capacity: 10, bookedCount: 3, myBookingStatus: null as string | null, myPosition: null as number | null };

describe('athleteState', () => {
  it('upcoming, not mine, room → book with spots', () => {
    expect(athleteState({ ...base, startAt: at(17, 18) }, NOW))
      .toEqual({ phase: 'upcoming', mine: null, position: null, action: 'book', spotsLeft: 7, full: false });
  });
  it('upcoming, full → waitlist', () => {
    const s = athleteState({ ...base, bookedCount: 10, startAt: at(18, 7) }, NOW);
    expect(s.action).toBe('waitlist'); expect(s.full).toBeTrue(); expect(s.spotsLeft).toBe(0);
  });
  it('upcoming, booked → cancel', () => {
    expect(athleteState({ ...base, myBookingStatus: 'BOOKED', startAt: at(18, 7) }, NOW).action).toBe('cancel');
  });
  it('upcoming, waitlisted → leave with position', () => {
    const s = athleteState({ ...base, myBookingStatus: 'WAITLIST', myPosition: 2, startAt: at(18, 7) }, NOW);
    expect(s.mine).toBe('waitlist'); expect(s.position).toBe(2); expect(s.action).toBe('leave');
  });
  it('checked in never offers book or cancel, in any phase', () => {
    for (const startAt of [at(18, 7), at(17, 9), at(16, 9)]) {
      const s = athleteState({ ...base, myBookingStatus: 'CHECKED_IN', startAt }, NOW);
      expect(s.mine).toBe('attended'); expect(s.action).toBeNull();
    }
  });
  it('today, already started → started, no action, spots still known', () => {
    const s = athleteState({ ...base, startAt: at(17, 9) }, NOW);
    expect(s.phase).toBe('started'); expect(s.action).toBeNull(); expect(s.spotsLeft).toBe(7);
  });
  it('booked and started → mine booked, no cancel', () => {
    const s = athleteState({ ...base, myBookingStatus: 'BOOKED', startAt: at(17, 9) }, NOW);
    expect(s.mine).toBe('booked'); expect(s.action).toBeNull();
  });
  it('past day → finished, no action, no spots', () => {
    const s = athleteState({ ...base, startAt: at(16, 20) }, NOW);
    expect(s).toEqual({ phase: 'finished', mine: null, position: null, action: null, spotsLeft: null, full: false });
  });
  it('past day booked → finished + booked', () => {
    expect(athleteState({ ...base, myBookingStatus: 'BOOKED', startAt: at(16, 20) }, NOW).mine).toBe('booked');
  });
  it('overbooked never reports negative spots', () => {
    expect(athleteState({ ...base, bookedCount: 12, startAt: at(18, 7) }, NOW).spotsLeft).toBe(0);
  });
});
