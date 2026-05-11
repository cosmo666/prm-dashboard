import { Injectable } from '@angular/core';
import {
  HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { AuthStore } from '../store/auth.store';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private auth: AuthService, private authStore: AuthStore) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = this.authStore.accessTokenSnapshot;
    const authedReq = token
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

    return next.handle(authedReq).pipe(
      catchError((err: HttpErrorResponse) => {
        if (err.status !== 401 || req.url.indexOf('/auth/refresh') !== -1) {
          return throwError(err);
        }
        return this.auth.refresh().pipe(
          switchMap(() => {
            const newToken = this.authStore.accessTokenSnapshot;
            return next.handle(req.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } }));
          }),
          catchError(refreshErr => {
            this.auth.logout();
            return throwError(refreshErr);
          })
        );
      })
    );
  }
}
