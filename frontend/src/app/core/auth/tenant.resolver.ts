import { ResolveFn } from '@angular/router';
import { inject } from '@angular/core';
import { Observable, of, catchError, map } from 'rxjs';
import { ApiClient } from '../api/api.client';
import { TenantStore } from '../store/tenant.store';
import { environment } from '../../../environments/environment';

interface TenantConfigResponse {
  slug: string;
  name: string;
  logo_url: string;
  primary_color: string;
}

function extractSlugFromHostname(): string {
  const hostname = window.location.hostname;

  // localhost or IP — use default
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
    return environment.defaultTenantSlug;
  }

  // subdomain.prm-app.com → extract first part
  const parts = hostname.split('.');
  if (parts.length >= 2) {
    return parts[0];
  }

  return environment.defaultTenantSlug;
}

export const tenantResolver: ResolveFn<boolean> = (): Observable<boolean> => {
  const tenantStore = inject(TenantStore);
  const api = inject(ApiClient);

  if (tenantStore.loaded()) {
    return of(true);
  }

  const slug = extractSlugFromHostname();

  return api.get<TenantConfigResponse>('/tenants/config', { slug }).pipe(
    map((config) => {
      tenantStore.setTenant({
        slug: config.slug,
        name: config.name,
        logoUrl: config.logo_url,
        primaryColor: config.primary_color,
      });
      return true;
    }),
    catchError(() => {
      // Fallback: set slug only so the app can still load
      tenantStore.setTenant({ slug, name: slug, logoUrl: '', primaryColor: '#1976d2' });
      return of(true);
    }),
  );
};
