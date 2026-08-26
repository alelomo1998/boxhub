import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { redirectForRole, Role } from './auth.models';

export function roleGuard(allowed: Role[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const box = auth.activeBox();
    // A session with no active box is not anonymous. Sending it to /auth/login showed a login
    // form to someone already logged in, and it was the whole reason a boxless account had no
    // shell at all — which is the state EVERY account starts in, since register() creates a
    // User and never a Membership.
    if (!box) return router.parseUrl(auth.hasSession() ? '/gyms' : '/auth/login');
    return allowed.includes(box.role) ? true : router.parseUrl(redirectForRole(box.role));
  };
}
