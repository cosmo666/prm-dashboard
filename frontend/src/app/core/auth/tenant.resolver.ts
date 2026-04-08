import { ResolveFn } from '@angular/router';
import { inject } from '@angular/core';
import { Observable, of, catchError, map, finalize } from 'rxjs';
import { ApiClient } from '../api/api.client';
import { TenantStore } from '../store/tenant.store';
import { ProgressService } from '../progress/progress.service';
import { environment } from '../../../environments/environment';
import { readDevTenantOverride } from '../../shared/components/dev-tenant-picker/dev-tenant-picker.component';

// Mirror backend TenantConfigResponse (camelCase by default ASP.NET serialization)
interface TenantConfigResponse {
  id: number;
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
}

function extractSlugFromHostname(): string {
  const hostname = window.location.hostname;

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
    // Dev-only: DevTenantPicker may have stashed a slug override in localStorage.
    return readDevTenantOverride() ?? environment.defaultTenantSlug;
  }

  const parts = hostname.split('.');
  if (parts.length >= 2) {
    return parts[0];
  }

  return environment.defaultTenantSlug;
}

export const tenantResolver: ResolveFn<boolean> = (): Observable<boolean> => {
  const tenantStore = inject(TenantStore);
  const api = inject(ApiClient);
  const progress = inject(ProgressService);

  if (tenantStore.loaded()) {
    return of(true);
  }

  const slug = extractSlugFromHostname();

  progress.start();
  return api.get<TenantConfigResponse>('/tenants/config', { slug }).pipe(
    map((config) => {
      tenantStore.setTenant({
        slug: config.slug,
        name: config.name,
        logoUrl: config.logoUrl ?? '',
        primaryColor: config.primaryColor,
      });
      return true;
    }),
    catchError(() => {
      // Fallback: set slug only so the app can still load
      tenantStore.setTenant({ slug, name: slug, logoUrl: '', primaryColor: '#1d4ed8' });
      return of(true);
    }),
    finalize(() => progress.stop()),
  );
};
