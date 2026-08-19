import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, of, switchMap, throwError } from 'rxjs';
import { AuthService, SILENT_401 } from './auth.service';

/**
 * Cookies attach themselves, so there is no bearer token to add. The interceptor's three jobs
 * now: send credentials, assert the active box on every /api/box/** request, and on a 401 try
 * one refresh (or on a 409 STALE_BOX, one re-mint) before giving up.
 *
 * bh_bt (box token) shares the 15m access-token TTL but /api/auth/refresh only reissues
 * bh_at/bh_rt — it never touches bh_bt. So a bare refresh leaves bh_bt expired and every
 * /api/box/** retry would 401 again. Re-mint it via selectBox before retrying.
 *
 * X-Box-Id names the box this tab believes it's in. The server compares it against the box
 * named in bh_bt and, on a mismatch, answers 409 STALE_BOX — another tab switched boxes and
 * re-minted bh_bt underneath us. Re-mint for the box THIS tab means and retry once.
 *
 * A wrong current password (change password / change email / delete account) is a 422 with
 * detail WRONG_PASSWORD, never a 401 — see AccountService.requirePassword/anonymize. So any
 * 401 on /api/me/** is unambiguously a dead session, same as everywhere else, and belongs in
 * the normal refresh-and-retry path below.
 *
 * /api/auth/** is excluded from refresh — a 401 there is a lifecycle failure (bad credentials,
 * dead refresh cookie), and refresh/box-token would recurse. But two authenticated data
 * endpoints live under /api/auth ONLY because bh_rt is Path=/api/auth (sessions) — they are not
 * loop-prone and MUST refresh like any other authenticated call, else "sign out everywhere"
 * silently no-ops on the first click after the 15m access token expires.
 */
const REFRESHABLE_AUTH = new Set(['/api/auth/sessions', '/api/auth/logout-all']);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const path = req.url.split('?')[0];
  const boxScoped = path.startsWith('/api/box/');
  const clone = () => req.clone({
    withCredentials: true,
    setHeaders: boxScoped && auth.activeBox() ? { 'X-Box-Id': auth.activeBox()!.boxId } : {},
  });

  return next(clone()).pipe(
    catchError((err: HttpErrorResponse) => {
      const activeBoxId = auth.activeBox()?.boxId;
      // The server says our token names a different box than this tab is showing — another tab
      // switched underneath us. Re-mint for the box THIS tab means and retry once. The retried
      // request is issued inside catchError, so its own failure is caught by the inner
      // catchError and never re-enters this branch: one retry, no loop.
      if (err.status === 409 && err.error?.detail === 'STALE_BOX' && activeBoxId) {
        return auth.selectBox(activeBoxId).pipe(
          switchMap(() => next(clone())),
          catchError(() => throwError(() => err)),
        );
      }

      const skipRetry = path.startsWith('/api/auth/') && !REFRESHABLE_AUTH.has(path);
      if (err.status !== 401 || skipRetry) return throwError(() => err);

      return auth.refresh().pipe(
        switchMap(ok => {
          if (!ok) {
            auth.clear();
            if (!req.context.get(SILENT_401)) router.navigate(['/auth/login']);
            return throwError(() => err);
          }
          const box = auth.activeBox();
          const reselect = box ? auth.selectBox(box.boxId) : of(void 0);
          return reselect.pipe(
            switchMap(() => next(clone())),
            catchError(() => {
              // Re-mint failed — give up the same way a failed refresh does. Rethrow the
              // ORIGINAL 401 (`err`), not the reselect error: the caller cares that its
              // request failed, not why the recovery attempt failed.
              auth.clear();
              if (!req.context.get(SILENT_401)) router.navigate(['/auth/login']);
              return throwError(() => err);
            }),
          );
        }),
      );
    }),
  );
};
