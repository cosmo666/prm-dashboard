import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';

/**
 * Small store that tracks the current dashboard tab name so the top-bar
 * breadcrumb can render it without prop-drilling.
 */
export interface NavigationState {
  activeTab: string | null;
}

const initialState: NavigationState = {
  activeTab: null,
};

export const NavigationStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    setActiveTab(name: string | null): void {
      patchState(store, { activeTab: name });
    },
    clear(): void {
      patchState(store, initialState);
    },
  })),
);
