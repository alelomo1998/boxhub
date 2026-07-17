import { passwordErrorMessage } from './auth.models';

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
