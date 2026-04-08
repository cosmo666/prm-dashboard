import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';

/**
 * Small store that tracks the current dashboard tab name so the top-bar
 * breadcrumb can render it without prop-drilling.
 */
export interface NavigationState {
  activeTab: string | null;
  // Increments each time a caller (e.g. the command palette) requests a tab
  // switch — the dashboard watches `requestedTabIndex` via an effect and
  // applies it. The counter is a lightweight trigger to avoid "same value,
  // no fire" pitfalls when the same tab is re-requested.
  requestedTabIndex: number | null;
  requestedTabTick: number;
}

const initialState: NavigationState = {
  activeTab: null,
  requestedTabIndex: null,
  requestedTabTick: 0,
};

export const NavigationStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    setActiveTab(name: string | null): void {
      patchState(store, { activeTab: name });
    },
    requestTab(index: number): void {
      patchState(store, (s) => ({
        requestedTabIndex: index,
        requestedTabTick: s.requestedTabTick + 1,
      }));
    },
    clear(): void {
      patchState(store, initialState);
    },
  })),
);
