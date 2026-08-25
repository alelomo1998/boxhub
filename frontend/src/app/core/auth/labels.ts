import { Role } from './auth.models';

/**
 * The enum never reaches a screen. box-picker.page.ts rendered `{{ m.role }}` raw, so a box
 * admin's row read BOX_ADMIN — untranslatable, and an unmarked user-facing English string
 * against the standing i18n rule. One module, because the hub and the switcher both need it.
 */
export function roleLabel(role: Role): string {
  switch (role) {
    case 'BOX_ADMIN': return $localize`:@@role.boxAdmin:Admin`;
    case 'COACH': return $localize`:@@role.coach:Coach`;
    case 'ATHLETE': return $localize`:@@role.athlete:Athlete`;
  }
}

/**
 * What a person is told about a gym they cannot open. The label keys off the ROLE they hold at
 * THAT gym, not the status alone:
 *
 *   - an admin of a gym awaiting platform approval is the one person who can act on it, so they
 *     are told;
 *   - everyone else is told only that it is unavailable. A member cannot act on "suspended", and
 *     it is a fact about the owner's account rather than theirs.
 *
 * Returns null for a reachable gym — the caller renders no chip at all rather than an "OK" one.
 */
export function boxStatusLabel(status: string, role: Role): string | null {
  if (isReachable(status)) return null;
  if (status === 'PENDING' && role === 'BOX_ADMIN') return $localize`:@@boxStatus.inReview:In review`;
  return $localize`:@@boxStatus.unavailable:Unavailable`;
}

/**
 * Deliberately an allowlist, not a denylist of the three bad values. A status this build has
 * never heard of is not openable — POST /api/auth/box-token would 403 it anyway, and failing
 * closed here means the row is marked rather than tapped.
 */
export function isReachable(status: string): boolean {
  return status === 'ACTIVE';
}
