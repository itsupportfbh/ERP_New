import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getToken();
  if (token && req.url.startsWith(environment.apiUrl)) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
  }
  return next(req).pipe(
    catchError((err: unknown) => {
      // An expired/invalid login session comes back as 401 on any authenticated call.
      // Clear the stale token and send the user to login, instead of leaving a cryptic
      // "HTTP 401" error on every screen. The auth endpoints are excluded — a 401 there
      // just means "wrong credentials", and we are already on the login page.
      if (
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        !req.url.includes('/user/login') &&
        !req.url.includes('/user/forgotPassword') &&
        !req.url.includes('/user/resetPassword')
      ) {
        auth.logout();
      }
      return throwError(() => err);
    })
  );
};
