export type Role = 'ATHLETE' | 'COACH' | 'BOX_ADMIN';

export interface MembershipDto {
  boxId: string;
  boxName: string;
  boxSlug: string;
  role: Role;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  memberships: MembershipDto[];
}

export interface ActiveBox {
  boxId: string;
  boxName: string;
  role: Role;
}

export function redirectForRole(role: Role): string {
  return role === 'BOX_ADMIN' ? '/admin' : role === 'COACH' ? '/coach' : '/athlete';
}
