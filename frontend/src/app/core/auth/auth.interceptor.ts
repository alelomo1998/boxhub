import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, of, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const token = auth.bearerToken();
  const authedReq = token && !req.url.includes('/api/auth/login') && !req.url.includes('/api/auth/refresh')
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authedReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || req.url.includes('/api/auth/')) return throwError(() => err);
      return auth.refresh().pipe(
        switchMap(ok => {
          if (!ok) {
            auth.logout();
            router.navigateByUrl('/auth/login');
            return throwError(() => err);
          }
          const box = auth.activeBox();
          // Re-mint the box token with the fresh user token so the retry
          // doesn't reuse an expired box-scoped token.
          const reselect = box ? auth.selectBox(box.boxId) : of(void 0);
          return reselect.pipe(
            switchMap(() => {
              const retry = req.clone({ setHeaders: { Authorization: `Bearer ${auth.bearerToken()}` } });
              return next(retry);
            }),
            catchError(() => {
              auth.logout();
              router.navigateByUrl('/auth/login');
              return throwError(() => err);
            }),
          );
        }),
      );
    }),
  );
};
