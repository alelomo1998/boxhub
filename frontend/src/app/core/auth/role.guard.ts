import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { redirectForRole, Role } from './auth.models';

export function roleGuard(allowed: Role[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const box = auth.activeBox();
    if (!box) return router.parseUrl('/auth/login');
    return allowed.includes(box.role) ? true : router.parseUrl(redirectForRole(box.role));
  };
}
