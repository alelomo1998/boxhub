import { HttpErrorResponse } from '@angular/common/http';

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

/**
 * Maps a Bean Validation field name (from ApiExceptionHandler#validation's `errors` map) to our
 * own localised copy. NEVER the server's own message text — `"must be a well-formed email
 * address"` is English, untranslatable, and this project's i18n rule forbids new unmarked
 * user-facing strings. An unrecognised field gets a generic localised fallback, never the raw
 * server text.
 */
function fieldErrorMessage(field: string): string {
  switch (field) {
    case 'email': return $localize`:@@auth.field.error.email:Enter a valid email address.`;
    case 'name': return $localize`:@@auth.field.error.name:Enter your name.`;
    case 'boxName': return $localize`:@@auth.field.error.boxName:Enter your gym's name.`;
    case 'password': return $localize`:@@auth.field.error.password:Enter a password with at least 10 characters.`;
    case 'newPassword': return $localize`:@@auth.field.error.newPassword:Enter a new password with at least 10 characters.`;
    case 'currentPassword': return $localize`:@@auth.field.error.currentPassword:Enter your current password.`;
    default: return $localize`:@@auth.field.error.generic:Enter a valid value.`;
  }
}

/**
 * Maps an HttpErrorResponse carrying the backend's `{ errors: { field: message } }` validation
 * shape (ApiExceptionHandler#validation, thrown on MethodArgumentNotValidException) to
 * field name -> localised message. Empty when the response carries no `errors` map — the caller
 * falls back to the generic top-of-form alert. Shared by signup and start-box — one mapping, not
 * two, same reason as passwordErrorMessage above.
 */
export function fieldErrorMessages(e: HttpErrorResponse): Record<string, string> {
  const errors = e.error?.errors;
  if (!errors || typeof errors !== 'object') return {};
  const out: Record<string, string> = {};
  for (const field of Object.keys(errors)) {
    out[field] = fieldErrorMessage(field);
  }
  return out;
}
