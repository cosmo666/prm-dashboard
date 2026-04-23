import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of, take } from 'rxjs';
import { ApiClient } from '../api/api.client';
import { AuthStore, Employee } from '../store/auth.store';
import { TenantStore } from '../store/tenant.store';

// Backend returns camelCase (ASP.NET Core default). EmployeeDto has no tenantId/tenantSlug —
// we read those from TenantStore which is populated by tenantResolver from the subdomain.
interface LoginResponse {
  accessToken: string;
  employee: {
    id: number;
    displayName: string;
    email?: string;
    airports: { code: string; name: string }[];
  };
}

interface RefreshResponse {
  accessToken: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiClient);
  private readonly authStore = inject(AuthStore);
  private readonly tenantStore = inject(TenantStore);
  private readonly router = inject(Router);

  login(username: string, password: string, _tenantSlug: string): Observable<LoginResponse> {
    return this.api.post<LoginResponse>('/auth/login', { username, password }).pipe(
      tap((res) => this.applySession(res)),
    );
  }

  refresh(): Observable<RefreshResponse> {
    return this.api.post<RefreshResponse>('/auth/refresh').pipe(
      tap((res) => {
        this.authStore.setAccessToken(res.accessToken);
      }),
    );
  }

  logout(): void {
    this.api.post('/auth/logout').pipe(
      take(1),
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
          const employee = this.mapEmployee(res);
          this.authStore.setSession(tok, employee);
        }
      }),
    );
  }

  get token(): string {
    return this.authStore.accessToken();
  }

  private applySession(res: LoginResponse): void {
    const employee = this.mapEmployee(res);
    this.authStore.setSession(res.accessToken, employee);
  }

  private mapEmployee(res: LoginResponse): Employee {
    return {
      id: res.employee.id,
      name: res.employee.displayName,
      tenantId: 0, // not returned by backend; derive from TenantStore if needed
      tenantSlug: this.tenantStore.slug(),
      airports: res.employee.airports,
    };
  }
}
