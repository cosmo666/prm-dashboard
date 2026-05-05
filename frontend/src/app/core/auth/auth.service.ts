import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { ApiClient } from '../api/api.client';
import { AuthStore, Employee } from '../store/auth.store';

interface LoginResponse {
  accessToken: string;
  employee: Employee;
}
interface RefreshResponse {
  accessToken: string;
}
interface MeResponse {
  employee: Employee;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(
    private api: ApiClient,
    private store: AuthStore,
    private router: Router,
  ) {}

  login(email: string, password: string): Observable<LoginResponse> {
    return this.api.post<LoginResponse>('/auth/login', { email, password }).pipe(
      tap(res => {
        this.store.setAccessToken(res.accessToken);
        this.store.setEmployee(res.employee);
      })
    );
  }

  refresh(): Observable<RefreshResponse> {
    return this.api.post<RefreshResponse>('/auth/refresh', {}).pipe(
      tap(res => this.store.setAccessToken(res.accessToken))
    );
  }

  me(): Observable<MeResponse> {
    return this.api.get<MeResponse>('/auth/me').pipe(
      tap(res => this.store.setEmployee(res.employee))
    );
  }

  logout(): void {
    this.api.post('/auth/logout', {}).pipe(
      catchError(() => throwError(null))
    ).subscribe({
      next: () => this.finishLogout(),
      error: () => this.finishLogout(),
    });
  }

  private finishLogout(): void {
    this.store.clear();
    this.router.navigate(['/login']);
  }
}
