import { bookingReason } from './booking-reason';

const CODES = ['ENTRIES_TOTAL', 'ENTRIES_PER_MONTH', 'ENTRIES_PER_WEEK', 'ENTRIES_PER_DAY',
  'CANCELLATIONS_TOTAL', 'CANCELLATIONS_PER_MONTH', 'CANCELLATIONS_PER_WEEK', 'CANCELLATIONS_PER_DAY',
  'NO_ACTIVE_SUBSCRIPTION', 'PAST_CUTOFF', 'ALREADY_BOOKED', 'CANCELLED', 'PAST'];

describe('bookingReason', () => {
  const fallback = bookingReason(undefined);
  it('falls back for unknown codes', () => expect(bookingReason('nonsense')).toBe(fallback));
  for (const c of CODES) {
    it(`has its own copy for ${c}`, () => expect(bookingReason(c)).not.toBe(fallback));
  }
  it('gives every code distinct copy', () => expect(new Set(CODES.map(bookingReason)).size).toBe(CODES.length));
});
