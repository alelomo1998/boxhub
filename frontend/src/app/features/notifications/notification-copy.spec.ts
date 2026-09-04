import { NOTIFICATION_COPY } from './notification-copy';

describe('NOTIFICATION_COPY', () => {
  it('has copy for every type the server can put in the feed', () => {
    // The server's feed types, hardcoded here on purpose: this list and NotificationType.
    // feedTypeNames() must be edited together, and a mismatch renders a blank row rather than
    // throwing — invisible in every other test.
    const SERVER_FEED_TYPES = [
      'WAITLIST_PROMOTED', 'CLASS_CANCELLED', 'CLASS_TIME_CHANGED', 'COACH_CHANGED',
      'LATE_CANCEL_UNREFUNDED', 'NO_SHOW_RECORDED', 'NEW_ANNOUNCEMENT', 'SUBSCRIPTION_EXPIRING',
      'PAYMENT_FAILED', 'MEMBERSHIP_BLOCKED', 'INVITE_ACCEPTED', 'NEW_MEMBER_JOINED',
    ];
    expect(Object.keys(NOTIFICATION_COPY).sort()).toEqual(SERVER_FEED_TYPES.sort());
  });

  it('falls back to "Your gym" for a system announcement', () => {
    // sentByName is legitimately absent for V30's backfill and seed sends.
    expect(NOTIFICATION_COPY['NEW_ANNOUNCEMENT'].title({ bodyPreview: 'x' })).toContain('Your gym');
  });

  it('renders no placeholder markers in any title', () => {
    // A misplaced placeholder name ships as literal ":className:" text. Assert it never appears.
    for (const [type, copy] of Object.entries(NOTIFICATION_COPY)) {
      const rendered = copy.title({ className: 'A', coachName: 'B', sentByName: 'C',
                                    inviteeName: 'D', memberName: 'E' });
      expect(rendered).withContext(type).not.toMatch(/:[a-zA-Z]+:/);
    }
  });

  it('gives every type a short, non-empty eyebrow with no stray placeholder marker', () => {
    const entries = Object.entries(NOTIFICATION_COPY);
    expect(entries.length).toBe(12);
    for (const [type, copy] of entries) {
      expect(copy.eyebrow.length).withContext(type).toBeGreaterThan(0);
      expect(copy.eyebrow).withContext(type).not.toMatch(/:[a-zA-Z]+:/);
    }
  });
});
