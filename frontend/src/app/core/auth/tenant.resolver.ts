import { Injectable } from '@angular/core';
import { Resolve } from '@angular/router';
import { Observable, of } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';
import { ApiClient } from '../api/api.client';
import { ProgressService } from '../progress/progress.service';
import { TenantStore, Tenant } from '../store/tenant.store';
import { readDevTenantOverride } from '../../shared/components/dev-tenant-picker/dev-tenant-picker.component';

@Injectable({ providedIn: 'root' })
export class TenantResolver implements Resolve<Tenant | null> {
  constructor(
    private api: ApiClient,
    private store: TenantStore,
    private progress: ProgressService,
  ) {}

  resolve(): Observable<Tenant | null> {
    if (this.store.tenantSnapshot) {
      return of(this.store.tenantSnapshot);
    }
    const slug = this.extractSlugFromHost();
    this.progress.start();
    return this.api.get<Tenant>(`/tenants/config?slug=${slug}`).pipe(
      tap(t => this.store.setTenant(t)),
      finalize(() => this.progress.stop()),
    );
  }

  private extractSlugFromHost(): string {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      // Dev-only: DevTenantPicker may have stashed an override slug in
      // localStorage. The override is validated against DEV_TENANTS so
      // an unknown slug still falls through to the default.
      return readDevTenantOverride() || 'aeroground';
    }
    const match = host.match(/^([a-z][a-z0-9-]*)\./);
    return match ? match[1] : 'aeroground';
  }
}
