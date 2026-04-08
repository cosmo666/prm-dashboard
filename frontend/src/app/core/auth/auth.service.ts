import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of } from 'rxjs';
import { ApiClient } from '../api/api.client';
import { AuthStore, Employee } from '../store/auth.store';

interface LoginResponse {
  access_token: string;
  employee: {
    id: number;
    name: string;
    tenant_id: number;
    tenant_slug: string;
    airports: { code: string; name: string }[];
  };
}

interface RefreshResponse {
  access_token: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiClient);
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  login(username: string, password: string, tenantSlug: string): Observable<LoginResponse> {
    return this.api.post<LoginResponse>('/auth/login', { username, password, tenant_slug: tenantSlug }).pipe(
      tap((res) => {
        const employee: Employee = {
          id: res.employee.id,
          name: res.employee.name,
          tenantId: res.employee.tenant_id,
          tenantSlug: res.employee.tenant_slug,
          airports: res.employee.airports,
        };
        this.authStore.setSession(res.access_token, employee);
      }),
    );
  }

  refresh(): Observable<RefreshResponse> {
    return this.api.post<RefreshResponse>('/auth/refresh').pipe(
      tap((res) => {
        this.authStore.setAccessToken(res.access_token);
      }),
    );
  }

  logout(): void {
    this.api.post('/auth/logout').pipe(
      catchError(() => of(null)),
    ).subscribe(() => {
      this.authStore.clear();
      this.router.navigate(['/login']);
    });
  }

  ensureProfile(): Observable<LoginResponse> {
    return this.api.get<LoginResponse>('/auth/me').pipe(
      tap((res) => {
        const tok = this.authStore.accessToken();
        if (tok) {
          const employee: Employee = {
            id: res.employee.id,
            name: res.employee.name,
            tenantId: res.employee.tenant_id,
            tenantSlug: res.employee.tenant_slug,
            airports: res.employee.airports,
          };
          this.authStore.setSession(tok, employee);
        }
      }),
    );
  }

  get token(): string {
    return this.authStore.accessToken();
  }
}
