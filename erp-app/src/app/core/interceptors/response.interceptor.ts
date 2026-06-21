import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap, catchError, throwError } from 'rxjs';
import { AlertService } from '../services/alert.service';

export const responseInterceptor: HttpInterceptorFn = (req, next) => {
  const alert = inject(AlertService);

  return next(req).pipe(
    tap(event => {
      if (event instanceof HttpResponse) {
        const body = event.body as any;
        // Show popup when API returns isSuccess: false
        if (body && body.isSuccess === false && body.message) {
          alert.error('Error', body.message);
        }
      }
    }),
    catchError(err => {
      // HTTP error status (4xx / 5xx)
      const msg: string =
        err.error?.message ??
        err.error?.title ??
        err.message ??
        'An unexpected error occurred. Please try again.';
      alert.error('Error', msg);
      return throwError(() => err);
    })
  );
};
