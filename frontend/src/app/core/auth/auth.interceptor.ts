import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { TenantStore } from '../store/tenant.store';

// URLs that should not trigger 401 auto-refresh
const SKIP_REFRESH_URLS = ['/auth/login', '/auth/refresh'];

function shouldSkipRefresh(url: string): boolean {
  return SKIP_REFRESH_URLS.some((skip) => url.includes(skip));
}

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const authService = inject(AuthService);
  const tenantStore = inject(TenantStore);

  let headers = req.headers;

  // Attach Bearer token (skip for refresh requests to avoid stale token)
  const token = authService.token;
  if (token && !req.url.includes('/auth/refresh')) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }

  // Attach tenant slug header
  const slug = tenantStore.slug();
  if (slug) {
    headers = headers.set('X-Tenant-Slug', slug);
  }

  const cloned = req.clone({ headers });

  return next(cloned).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !shouldSkipRefresh(req.url)) {
        return authService.refresh().pipe(
          switchMap(() => {
            // Retry with new token — use cloned.headers to preserve all headers from first pass
            const retryHeaders = cloned.headers.set('Authorization', `Bearer ${authService.token}`);
            return next(cloned.clone({ headers: retryHeaders }));
          }),
          catchError(() => {
            authService.logout();
            return throwError(() => error);
          }),
        );
      }
      return throwError(() => error);
    }),
  );
};
