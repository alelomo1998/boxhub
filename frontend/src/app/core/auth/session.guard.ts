import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * A session and nothing else. Deliberately NOT roleGuard: that requires an active box, which
 * locked a membership-less or suspended-box user out of their own password, sessions and account
 * deletion — the users most likely to want to delete an account were exactly the ones barred.
 */
export const sessionGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.hasSession() ? true : inject(Router).parseUrl('/auth/login');
};
