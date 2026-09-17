import { tonesOf } from './session-tones';
import { SessionView } from './booking.service';

function session(startAt: string, bookedCount: number, capacity: number): SessionView {
  return {
    id: startAt, name: 'WOD', startAt, durationMin: 60, capacity, coachId: null, coachName: null,
    status: 'ACTIVE', programmingStatus: 'PUBLISHED', bookedCount, waitlistCount: 0, booked: [],
    myBookingStatus: null, myPosition: null, imagePath: null,
  };
}

describe('tonesOf', () => {
  it('marks a day open when one session is open and one is full', () => {
    const tones = tonesOf([
      session('2026-09-10T09:00:00', 5, 5),
      session('2026-09-10T18:00:00', 2, 5),
    ]);
    expect(tones['2026-09-10']).toBe('open');
  });

  it('marks a day full only when every session is at capacity', () => {
    const tones = tonesOf([
      session('2026-09-11T09:00:00', 5, 5),
      session('2026-09-11T18:00:00', 5, 5),
    ]);
    expect(tones['2026-09-11']).toBe('full');
  });

  it('leaves a day with no sessions absent from the map', () => {
    const tones = tonesOf([session('2026-09-12T09:00:00', 0, 5)]);
    expect(tones['2026-09-13']).toBeUndefined();
  });
});
