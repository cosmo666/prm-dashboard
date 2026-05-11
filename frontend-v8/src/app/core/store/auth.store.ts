import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';

export interface AirportInfo {
  code: string;
  name: string;
}

// Mirrors backend EmployeeDto (PrmDashboard.Shared/DTOs/AuthDtos.cs).
// tenantSlug lives in the JWT claims, not the EmployeeDto, so it isn't on this type.
export interface Employee {
  id: number;
  displayName: string;
  email: string | null;
  airports: AirportInfo[];
}

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private _accessToken$ = new BehaviorSubject<string | null>(null);
  private _employee$ = new BehaviorSubject<Employee | null>(null);

  accessToken$: Observable<string | null> = this._accessToken$.asObservable();
  employee$: Observable<Employee | null> = this._employee$.asObservable();

  airports$: Observable<AirportInfo[]> = this._employee$.pipe(
    map(emp => (emp ? emp.airports : [])),
    shareReplay(1)
  );

  airportCodes$: Observable<string[]> = this._employee$.pipe(
    map(emp => (emp ? emp.airports.map(a => a.code) : [])),
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
  get airportsSnapshot(): AirportInfo[] {
    const emp = this._employee$.value;
    return emp ? emp.airports : [];
  }
  get airportCodesSnapshot(): string[] {
    const emp = this._employee$.value;
    return emp ? emp.airports.map(a => a.code) : [];
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
