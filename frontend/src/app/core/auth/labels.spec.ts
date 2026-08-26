import { roleLabel, boxStatusLabel, isReachable } from './labels';

describe('labels', () => {
  it('never renders a raw enum value for a role', () => {
    expect(roleLabel('BOX_ADMIN')).toBe('Admin');
    expect(roleLabel('COACH')).toBe('Coach');
    expect(roleLabel('ATHLETE')).toBe('Athlete');
  });

  it('shows no status chip for an ACTIVE gym', () => {
    expect(boxStatusLabel('ACTIVE', 'ATHLETE')).toBeNull();
    expect(boxStatusLabel('ACTIVE', 'BOX_ADMIN')).toBeNull();
  });

  // The decision this file exists for: the label keys off the ROLE held at that gym,
  // not the status alone. An admin owns the problem; a member cannot act on it.
  it('tells an admin their own gym is in review, and tells a member nothing specific', () => {
    expect(boxStatusLabel('PENDING', 'BOX_ADMIN')).toBe('In review');
    expect(boxStatusLabel('PENDING', 'COACH')).toBe('Unavailable');
    expect(boxStatusLabel('PENDING', 'ATHLETE')).toBe('Unavailable');
  });

  it('never leaks SUSPENDED or REJECTED to anyone, admin included', () => {
    for (const role of ['ATHLETE', 'COACH', 'BOX_ADMIN'] as const) {
      expect(boxStatusLabel('SUSPENDED', role)).toBe('Unavailable');
      expect(boxStatusLabel('REJECTED', role)).toBe('Unavailable');
    }
  });

  it('treats only ACTIVE as reachable, so an unknown status fails closed', () => {
    expect(isReachable('ACTIVE')).toBe(true);
    expect(isReachable('PENDING')).toBe(false);
    expect(isReachable('SUSPENDED')).toBe(false);
    expect(isReachable('WHATEVER_SHIPS_NEXT')).toBe(false);
  });
});
