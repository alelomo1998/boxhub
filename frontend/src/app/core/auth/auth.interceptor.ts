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
 * bh_at/bh_rt — it never touches bh_bt. So a bare refresh leaves bh_bt expired. Re-mint it via
 * selectBox before retrying.
 *
 * Note WHICH status that surfaces as, because the first version of this file assumed 401 and the
 * app wedged for it: when bh_bt alone has expired, bh_at is still valid, so the request is
 * authenticated but unscoped and the answer is 403, not 401. Both are handled below, separately.
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

      // An EXPIRED box token answers 403, NOT 401 — which is why the refresh-and-re-mint path
      // below never fired and the app wedged. bh_at is still valid, so Spring sees a fully
      // authenticated user who merely lacks SCOPE_box, and SecurityConfig's authorization step
      // rejects it as forbidden rather than unauthenticated.
      //
      // Measured against the running stack, 15m after selecting a box: /api/me answered 200 as
      // athlete@demo.io while /api/box/conversations answered 403, and POST /api/auth/refresh
      // returned 200 without helping, because refresh reissues bh_at/bh_rt and never bh_bt. The
      // user's report was "the session expire and i see only couldnt load try again" on every
      // screen — every screen fetches through /api/box/**, and the only cure was re-picking the
      // gym by hand.
      //
      // Re-mint once and retry, mirroring the 409 STALE_BOX branch above. A genuine authorization
      // denial (an athlete addressing another athlete, say) re-mints the same scope, is denied
      // again, and surfaces the original error — one extra round-trip on a path that is already
      // exceptional. The retry is issued through next() inside catchError, so it does not re-enter
      // this interceptor: one retry, no loop.
      if (err.status === 403 && boxScoped && activeBoxId) {
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
