import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
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
          const retry = req.clone({ setHeaders: { Authorization: `Bearer ${auth.bearerToken()}` } });
          return next(retry);
        }),
      );
    }),
  );
};
// ponytail: refresh renews user token only; box token refresh flow in M1 if it bites.
