import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { redirectForRole } from './auth.models';

/**
 * What "/" means. Before M23 it was `redirectTo: 'auth/login'` unconditionally, so the bare
 * domain showed a login form to someone who was already signed in — and superadminGuard sent
 * a signed-in non-superadmin through the same door.
 *
 * A GUARD, not a component lifecycle hook. account-index.page.ts records why, from a bug that
 * already cost a debugging session: a lifecycle navigateByUrl starts a SECOND navigation, which
 * on a cold bootstrap races the still-in-flight initial one and silently loses — the URL stays
 * put and an empty template renders. A CanActivate returning a UrlTree redirects inside the
 * router's own resolution of the FIRST navigation, so there is no second navigation to race.
 *
 * Always returns a UrlTree: "/" has no screen of its own.
 */
export const entryGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.hasSession()) return router.parseUrl('/auth/login');
  const box = auth.activeBox();
  return router.parseUrl(box ? redirectForRole(box.role) : '/gyms');
};
