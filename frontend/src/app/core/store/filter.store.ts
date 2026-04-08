import { computed } from '@angular/core';
import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';

export type DatePreset =
  | 'today' | 'yesterday' | 'last7' | 'last30'
  | 'mtd' | 'last_month' | 'last_3_months' | 'last_6_months'
  | 'qtd' | 'ytd' | 'calendar_year' | 'last_year'
  | 'q1' | 'q2' | 'q3' | 'q4'
  | 'custom';

export interface FilterState {
  airport: string;
  datePreset: DatePreset;
  dateFrom: string;
  dateTo: string;
  airline: string;
  service: string;
  handledBy: string;
  flight: string;
  agentNo: string;
  compareMode: boolean;
}

const initialState: FilterState = {
  airport: '',
  datePreset: 'mtd',
  dateFrom: '',
  dateTo: '',
  airline: '',
  service: '',
  handledBy: '',
  flight: '',
  agentNo: '',
  compareMode: false,
};

export const FilterStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((state) => ({
    queryParams: computed(() => {
      const params: Record<string, string> = {};
      const s = {
        airport: state.airport(),
        date_from: state.dateFrom(),
        date_to: state.dateTo(),
        airline: state.airline(),
        service: state.service(),
        handled_by: state.handledBy(),
        flight: state.flight(),
        agent_no: state.agentNo(),
      };
      for (const [key, value] of Object.entries(s)) {
        if (value) {
          params[key] = value;
        }
      }
      if (state.compareMode()) {
        params['compare'] = '1';
      }
      return params;
    }),
    hasAnyFilter: computed(() =>
      !!(state.airline() || state.service() || state.handledBy() || state.flight() || state.agentNo())
    ),
  })),
  withMethods((store) => ({
    setAirport(airport: string): void {
      patchState(store, { airport });
    },
    setDateRange(preset: DatePreset, from: string, to: string): void {
      patchState(store, { datePreset: preset, dateFrom: from, dateTo: to });
    },
    setFilter(patch: Partial<FilterState>): void {
      patchState(store, patch);
    },
    clearSecondary(): void {
      patchState(store, { airline: '', service: '', handledBy: '', flight: '', agentNo: '' });
    },
    toggleCompare(): void {
      patchState(store, { compareMode: !store.compareMode() });
    },
    loadFromQueryParams(params: Record<string, string>): void {
      patchState(store, {
        airport: params['airport'] || '',
        dateFrom: params['date_from'] || '',
        dateTo: params['date_to'] || '',
        airline: params['airline'] || '',
        service: params['service'] || '',
        handledBy: params['handled_by'] || '',
        flight: params['flight'] || '',
        agentNo: params['agent_no'] || '',
        compareMode: params['compare'] === '1',
      });
    },
    reset(): void {
      patchState(store, initialState);
    },
  })),
);
