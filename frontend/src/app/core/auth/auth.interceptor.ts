import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, of, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Cookies attach themselves, so there is no bearer token to add. The interceptor's only
 * jobs now: send credentials, and on a 401 try one refresh before giving up.
 *
 * bh_bt (box token) shares the 15m access-token TTL but /api/auth/refresh only reissues
 * bh_at/bh_rt — it never touches bh_bt. So a bare refresh leaves bh_bt expired and every
 * /api/box/** retry would 401 again. Re-mint it via selectBox before retrying.
 *
 * /api/me/** is excluded from the retry too: those endpoints 401 on purpose when the caller
 * types the wrong current password (change password / change email / delete account) — that
 * is a business answer, not a session problem, and must reach the component as a clean 401
 * instead of being swallowed by a refresh-and-retry that only 401s again and then nukes a
 * perfectly valid session.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const withCreds = req.clone({ withCredentials: true });

  return next(withCreds).pipe(
    catchError((err: HttpErrorResponse) => {
      const skipRetry = req.url.startsWith('/api/auth/') || req.url.startsWith('/api/me');
      if (err.status !== 401 || skipRetry) return throwError(() => err);

      return auth.refresh().pipe(
        switchMap(ok => {
          if (!ok) {
            auth.clear();
            router.navigate(['/auth/login']);
            return throwError(() => err);
          }
          const box = auth.activeBox();
          const reselect = box ? auth.selectBox(box.boxId) : of(void 0);
          return reselect.pipe(
            switchMap(() => next(req.clone({ withCredentials: true }))),
            catchError(() => {
              // Re-mint failed — give up the same way a failed refresh does. Rethrow the
              // ORIGINAL 401 (`err`), not the reselect error: the caller cares that its
              // request failed, not why the recovery attempt failed.
              auth.clear();
              router.navigate(['/auth/login']);
              return throwError(() => err);
            }),
          );
        }),
      );
    }),
  );
};
