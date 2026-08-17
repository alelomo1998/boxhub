import { HttpErrorResponse } from '@angular/common/http';
import { passwordErrorMessage, fieldErrorMessages } from './auth.models';

describe('passwordErrorMessage', () => {
  it('maps PASSWORD_TOO_SHORT to a human sentence', () => {
    expect(passwordErrorMessage('PASSWORD_TOO_SHORT')).toBe('Use at least 10 characters.');
  });
  it('maps PASSWORD_BREACHED to a human sentence', () => {
    expect(passwordErrorMessage('PASSWORD_BREACHED')).toBe('This password has appeared in a data breach. Choose another one.');
  });
  it('returns null for an unknown or missing code', () => {
    expect(passwordErrorMessage('SOMETHING_ELSE')).toBeNull();
    expect(passwordErrorMessage(undefined)).toBeNull();
  });
});

describe('fieldErrorMessages', () => {
  // ApiExceptionHandler#validation's shape: { detail, errors: { field: <server English text> } }.
  function response(errors: unknown): HttpErrorResponse {
    return { error: { detail: 'Validation failed', errors } } as HttpErrorResponse;
  }

  it('maps each field in the errors map to our own localised copy', () => {
    const out = fieldErrorMessages(response({
      email: 'must be a well-formed email address',
      name: 'must not be blank',
    }));
    expect(out['email']).toBe('Enter a valid email address.');
    expect(out['name']).toBe('Enter your name.');
  });

  it('gives an unrecognised field the localised fallback, NEVER the server\'s English text', () => {
    const serverText = 'boxName must not exceed 120 characters';
    const out = fieldErrorMessages(response({ someUnknownField: serverText }));
    expect(out['someUnknownField']).toBe('Enter a valid value.');
    // The assertion that actually protects the i18n rule: the untranslated server string must
    // never reach anything this function returns, on this field or any other.
    expect(Object.values(out)).not.toContain(serverText);
    expect(JSON.stringify(out)).not.toContain('must not exceed');
  });

  it('returns {} when errors is absent or not an object', () => {
    expect(fieldErrorMessages({ error: { detail: 'boom' } } as HttpErrorResponse)).toEqual({});
    expect(fieldErrorMessages({ error: null } as HttpErrorResponse)).toEqual({});
    expect(fieldErrorMessages({} as HttpErrorResponse)).toEqual({});
    expect(fieldErrorMessages(response('not an object'))).toEqual({});
  });
});
