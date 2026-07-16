import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Cookies attach themselves, so there is no bearer token to add. The interceptor's only
 * jobs now: send credentials, and on a 401 try one refresh before giving up.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const withCreds = req.clone({ withCredentials: true });

  return next(withCreds).pipe(
    catchError((err: HttpErrorResponse) => {
      const isAuthCall = req.url.startsWith('/api/auth/');
      if (err.status !== 401 || isAuthCall) return throwError(() => err);

      return auth.refresh().pipe(
        switchMap(ok => {
          if (!ok) {
            auth.session.set(null);
            router.navigate(['/auth/login']);
            return throwError(() => err);
          }
          return next(req.clone({ withCredentials: true }));
        }),
      );
    }),
  );
};
