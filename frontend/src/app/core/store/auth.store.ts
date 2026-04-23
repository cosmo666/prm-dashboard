import { computed } from '@angular/core';
import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';

export interface Airport {
  code: string;
  name: string;
}

export interface Employee {
  id: number;
  name: string;
  tenantSlug: string;
  airports: Airport[];
}

export interface AuthState {
  accessToken: string;
  employee: Employee | null;
}

const initialState: AuthState = {
  accessToken: '',
  employee: null,
};

export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((state) => ({
    isAuthenticated: computed(() => !!state.accessToken() && state.employee() !== null),
    airportCodes: computed(() => state.employee()?.airports.map((a) => a.code) ?? []),
  })),
  withMethods((store) => ({
    setSession(token: string, employee: Employee): void {
      patchState(store, { accessToken: token, employee });
    },
    setAccessToken(token: string): void {
      patchState(store, { accessToken: token });
    },
    clear(): void {
      patchState(store, initialState);
    },
  })),
);
