import { Injectable } from '@angular/core';
import { Resolve } from '@angular/router';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ApiClient } from '../api/api.client';
import { TenantStore, Tenant } from '../store/tenant.store';

@Injectable({ providedIn: 'root' })
export class TenantResolver implements Resolve<Tenant | null> {
  constructor(private api: ApiClient, private store: TenantStore) {}

  resolve(): Observable<Tenant | null> {
    if (this.store.tenantSnapshot) {
      return of(this.store.tenantSnapshot);
    }
    const slug = this.extractSlugFromHost();
    return this.api.get<Tenant>(`/tenants/config?slug=${slug}`).pipe(
      tap(t => this.store.setTenant(t))
    );
  }

  private extractSlugFromHost(): string {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'acme';
    }
    const match = host.match(/^([a-z][a-z0-9-]*)\./);
    return match ? match[1] : 'acme';
  }
}
