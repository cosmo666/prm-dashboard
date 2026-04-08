import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';

export interface TenantState {
  slug: string;
  name: string;
  logoUrl: string;
  primaryColor: string;
  loaded: boolean;
}

const initialState: TenantState = {
  slug: '',
  name: '',
  logoUrl: '',
  primaryColor: '#1976d2',
  loaded: false,
};

export const TenantStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    setTenant(tenant: Omit<TenantState, 'loaded'>): void {
      patchState(store, { ...tenant, loaded: true });
    },
    clear(): void {
      patchState(store, initialState);
    },
  })),
);
