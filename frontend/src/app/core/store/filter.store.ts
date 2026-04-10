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
  // Multi-select filters — serialized to URL as comma-delimited strings
  // (e.g. `airline=AI,BA`). Empty array means "no filter / all values".
  airline: string[];
  service: string[];
  handledBy: string[];
  // Single-value filters (no multi-select UI today)
  flight: string;
  agentNo: string;
}

const initialState: FilterState = {
  airport: '',
  datePreset: 'mtd',
  dateFrom: '',
  dateTo: '',
  airline: [],
  service: [],
  handledBy: [],
  flight: '',
  agentNo: '',
};

/**
 * Parse a URL query value (possibly legacy single string) into an array.
 * Tolerant of the pre-multi-select format so saved views keep working.
 */
function parseCsv(value: string | undefined | null): string[] {
  if (!value) return [];
  return value.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

export const FilterStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((state) => ({
    queryParams: computed(() => {
      const params: Record<string, string> = {};

      if (state.airport()) params['airport'] = state.airport();
      if (state.dateFrom()) params['date_from'] = state.dateFrom();
      if (state.dateTo()) params['date_to'] = state.dateTo();

      // Multi-value filters — join with comma. Empty array is "no filter".
      if (state.airline().length > 0) params['airline'] = state.airline().join(',');
      if (state.service().length > 0) params['service'] = state.service().join(',');
      if (state.handledBy().length > 0) params['handled_by'] = state.handledBy().join(',');

      if (state.flight()) params['flight'] = state.flight();
      if (state.agentNo()) params['agent_no'] = state.agentNo();

      return params;
    }),
    hasAnyFilter: computed(() =>
      state.airline().length > 0 ||
      state.service().length > 0 ||
      state.handledBy().length > 0 ||
      !!state.flight() ||
      !!state.agentNo()
    ),
  })),
  withMethods((store) => ({
    setAirport(airport: string): void {
      patchState(store, { airport });
    },
    setDateRange(preset: DatePreset, from: string, to: string): void {
      patchState(store, { datePreset: preset, dateFrom: from, dateTo: to });
    },
    setAirline(value: string[] | string | null): void {
      patchState(store, { airline: normalize(value) });
    },
    setService(value: string[] | string | null): void {
      patchState(store, { service: normalize(value) });
    },
    setHandledBy(value: string[] | string | null): void {
      patchState(store, { handledBy: normalize(value) });
    },
    removeAirline(value: string): void {
      patchState(store, { airline: store.airline().filter((v) => v !== value) });
    },
    removeService(value: string): void {
      patchState(store, { service: store.service().filter((v) => v !== value) });
    },
    removeHandledBy(value: string): void {
      patchState(store, { handledBy: store.handledBy().filter((v) => v !== value) });
    },
    setFilter(patch: Partial<FilterState>): void {
      patchState(store, patch);
    },
    clearSecondary(): void {
      patchState(store, { airline: [], service: [], handledBy: [], flight: '', agentNo: '' });
    },
    loadFromQueryParams(params: Record<string, string>): void {
      patchState(store, {
        airport: params['airport'] || '',
        dateFrom: params['date_from'] || '',
        dateTo: params['date_to'] || '',
        airline: parseCsv(params['airline']),
        service: parseCsv(params['service']),
        handledBy: parseCsv(params['handled_by']),
        flight: params['flight'] || '',
        agentNo: params['agent_no'] || '',
      });
    },
    reset(): void {
      patchState(store, initialState);
    },
  })),
);

/**
 * Coerce either a single string, an array of strings, or null into a clean
 * array. Used by the multi-select setters so callers can pass whatever the
 * UI layer gives them (mat-select with [multiple]="true" emits an array).
 */
function normalize(value: string[] | string | null | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((v) => v && v.length > 0);
  return value.length > 0 ? [value] : [];
}
