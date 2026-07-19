export type Role = 'ATHLETE' | 'COACH' | 'BOX_ADMIN';

export interface MembershipDto {
  boxId: string;
  boxName: string;
  boxSlug: string;
  role: Role;
  boxStatus: string;
}

export interface ActiveBox {
  boxId: string;
  boxName: string;
  role: Role;
}

export function redirectForRole(role: Role): string {
  return role === 'BOX_ADMIN' ? '/admin' : role === 'COACH' ? '/coach' : '/athlete';
}

/**
 * Maps the backend's password-policy problem+json `detail` codes to a human sentence.
 * Shared by signup and reset — one mapping, not two. Returns null for any other code
 * (caller falls back to a generic error).
 */
export function passwordErrorMessage(code: string | undefined | null): string | null {
  switch (code) {
    case 'PASSWORD_TOO_SHORT': return 'Use at least 10 characters.';
    case 'PASSWORD_BREACHED': return 'This password has appeared in a data breach. Choose another one.';
    default: return null;
  }
}
