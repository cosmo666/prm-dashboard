import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';

export interface Employee {
  id: string;
  name: string;
  email: string;
  tenantSlug: string;
  airports: string[];
}

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private _accessToken$ = new BehaviorSubject<string | null>(null);
  private _employee$ = new BehaviorSubject<Employee | null>(null);

  accessToken$: Observable<string | null> = this._accessToken$.asObservable();
  employee$: Observable<Employee | null> = this._employee$.asObservable();

  airports$: Observable<string[]> = this._employee$.pipe(
    map(emp => (emp ? emp.airports : [])),
    shareReplay(1)
  );

  isAuthenticated$: Observable<boolean> = combineLatest([
    this._accessToken$,
    this._employee$,
  ]).pipe(
    map(([token, emp]) => token !== null && emp !== null),
    shareReplay(1)
  );

  get accessTokenSnapshot(): string | null { return this._accessToken$.value; }
  get employeeSnapshot(): Employee | null { return this._employee$.value; }
  get airportsSnapshot(): string[] {
    const emp = this._employee$.value;
    return emp ? emp.airports : [];
  }
  get isAuthenticatedSnapshot(): boolean {
    return this._accessToken$.value !== null && this._employee$.value !== null;
  }

  setAccessToken(token: string | null): void { this._accessToken$.next(token); }
  setEmployee(employee: Employee | null): void { this._employee$.next(employee); }

  clear(): void {
    this._accessToken$.next(null);
    this._employee$.next(null);
  }
}
