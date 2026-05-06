import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';

import { environment } from '../../../environments/environment';

export type DatePreset =
  | 'today' | 'yesterday' | 'last7' | 'last30'
  | 'mtd' | 'last_month' | 'last_3_months' | 'last_6_months'
  | 'qtd' | 'ytd' | 'calendar_year' | 'last_year'
  | 'q1' | 'q2' | 'q3' | 'q4'
  | 'custom';

@Injectable({ providedIn: 'root' })
export class FilterStore {
  private _airport$    = new BehaviorSubject<string[]>([]);
  private _datePreset$ = new BehaviorSubject<DatePreset>('mtd');
  private _dateFrom$   = new BehaviorSubject<string>('');
  private _dateTo$     = new BehaviorSubject<string>('');
  private _airline$    = new BehaviorSubject<string[]>([]);
  private _service$    = new BehaviorSubject<string[]>([]);
  private _handledBy$  = new BehaviorSubject<string[]>([]);
  private _flight$     = new BehaviorSubject<string>('');
  private _agentNo$    = new BehaviorSubject<string>('');

  airport$: Observable<string[]> = this._airport$.asObservable();
  datePreset$: Observable<DatePreset> = this._datePreset$.asObservable();
  dateFrom$: Observable<string> = this._dateFrom$.asObservable();
  dateTo$: Observable<string> = this._dateTo$.asObservable();
  airline$: Observable<string[]> = this._airline$.asObservable();
  service$: Observable<string[]> = this._service$.asObservable();
  handledBy$: Observable<string[]> = this._handledBy$.asObservable();
  flight$: Observable<string> = this._flight$.asObservable();
  agentNo$: Observable<string> = this._agentNo$.asObservable();

  get airportSnapshot(): string[]      { return this._airport$.value; }
  get datePresetSnapshot(): DatePreset { return this._datePreset$.value; }
  get dateFromSnapshot(): string       { return this._dateFrom$.value; }
  get dateToSnapshot(): string         { return this._dateTo$.value; }
  get airlineSnapshot(): string[]      { return this._airline$.value; }
  get serviceSnapshot(): string[]      { return this._service$.value; }
  get handledBySnapshot(): string[]    { return this._handledBy$.value; }
  get flightSnapshot(): string         { return this._flight$.value; }
  get agentNoSnapshot(): string        { return this._agentNo$.value; }

  queryParams$: Observable<{ [key: string]: string }> = combineLatest([
    this._airport$, this._dateFrom$, this._dateTo$,
    this._airline$, this._service$, this._handledBy$,
    this._flight$, this._agentNo$,
  ]).pipe(
    map((vals: Array<string | string[]>) => {
      const airport    = vals[0] as string[];
      const dateFrom   = vals[1] as string;
      const dateTo     = vals[2] as string;
      const airline    = vals[3] as string[];
      const service    = vals[4] as string[];
      const handledBy  = vals[5] as string[];
      const flight     = vals[6] as string;
      const agentNo    = vals[7] as string;
      const params: { [key: string]: string } = {};
      if (airport.length > 0)   { params.airport    = airport.join(','); }
      if (dateFrom)             { params.date_from  = dateFrom; }
      if (dateTo)               { params.date_to    = dateTo; }
      if (airline.length > 0)   { params.airline    = airline.join(','); }
      if (service.length > 0)   { params.service    = service.join(','); }
      if (handledBy.length > 0) { params.handled_by = handledBy.join(','); }
      if (flight)               { params.flight     = flight; }
      if (agentNo)              { params.agent_no   = agentNo; }
      return params;
    }),
    shareReplay(1),
  );

  // -------------------- Mutations --------------------

  setAirport(value: string | string[] | null): void {
    this._airport$.next(this.normalize(value));
  }

  /** Toggles `code` in/out of the airport array, but never empties it (backend 400 guard). */
  toggleAirport(code: string): void {
    const current = this._airport$.value;
    if (current.indexOf(code) >= 0) {
      if (current.length === 1) { return; }    // never-empty rule
      this._airport$.next(current.filter(c => c !== code));
    } else {
      this._airport$.next(current.concat([code]));
    }
  }

  removeAirport(value: string): void {
    const current = this._airport$.value;
    if (current.length <= 1) { return; }       // never-empty rule
    this._airport$.next(current.filter(v => v !== value));
  }

  setDateRange(preset: DatePreset, from: string, to: string): void {
    // Order matters: write from/to BEFORE preset so any subscriber listening
    // on datePreset$ (e.g. DateRangePicker.recomputeLabels) reads the fresh
    // from/to snapshot via the synchronous next() chain. Reversing this
    // produced a stale trigger label on preset change.
    this._dateFrom$.next(from);
    this._dateTo$.next(to);
    this._datePreset$.next(preset);
  }

  setAirline(value: string | string[] | null): void  { this._airline$.next(this.normalize(value)); }
  setService(value: string | string[] | null): void  { this._service$.next(this.normalize(value)); }
  setHandledBy(value: string | string[] | null): void { this._handledBy$.next(this.normalize(value)); }
  setFlight(value: string): void   { this._flight$.next(value || ''); }
  setAgentNo(value: string): void  { this._agentNo$.next(value || ''); }

  /** Drill-down: chart bar click toggles airline. No never-empty rule. */
  toggleAirline(code: string): void {
    const current = this._airline$.value;
    this._airline$.next(
      current.indexOf(code) >= 0 ? current.filter(c => c !== code) : current.concat([code])
    );
  }

  /** Drill-down: donut segment click toggles service. No never-empty rule. */
  toggleService(code: string): void {
    const current = this._service$.value;
    this._service$.next(
      current.indexOf(code) >= 0 ? current.filter(c => c !== code) : current.concat([code])
    );
  }

  /** Drill-down: flight bar click. Single-value — clicking the same value clears. */
  toggleFlight(value: string): void {
    this._flight$.next(this._flight$.value === value ? '' : value);
  }

  /** Drill-down: agent row click. Single-value. */
  toggleAgentNo(value: string): void {
    this._agentNo$.next(this._agentNo$.value === value ? '' : value);
  }

  removeAirline(value: string): void   { this._airline$.next(this._airline$.value.filter(v => v !== value)); }
  removeService(value: string): void   { this._service$.next(this._service$.value.filter(v => v !== value)); }
  removeHandledBy(value: string): void { this._handledBy$.next(this._handledBy$.value.filter(v => v !== value)); }

  /** Resets the secondary filters but keeps airport+date. Used by the "Clear filters" pill. */
  clearSecondary(): void {
    this._airline$.next([]);
    this._service$.next([]);
    this._handledBy$.next([]);
    this._flight$.next('');
    this._agentNo$.next('');
  }

  /**
   * Hydrate from URL query params on dashboard mount. Only known keys are read;
   * unknown keys are ignored. CSVs are parsed via `parseCsv` (trims + drops empties).
   */
  hydrateFromQueryParams(params: { [key: string]: string }): void {
    if (params.airport)    { this._airport$.next(this.parseCsv(params.airport)); }
    if (params.date_from)  { this._dateFrom$.next(params.date_from); }
    if (params.date_to)    { this._dateTo$.next(params.date_to); }
    if (params.airline)    { this._airline$.next(this.parseCsv(params.airline)); }
    if (params.service)    { this._service$.next(this.parseCsv(params.service)); }
    if (params.handled_by) { this._handledBy$.next(this.parseCsv(params.handled_by)); }
    if (params.flight)     { this._flight$.next(params.flight); }
    if (params.agent_no)   { this._agentNo$.next(params.agent_no); }
    // datePreset is UI sugar — hydrating dateFrom/dateTo + leaving preset='custom' is fine
    if (params.date_from || params.date_to) {
      this._datePreset$.next('custom');
    }
  }

  /**
   * Default landing state — Month To Date, anchored to `environment.pocToday`
   * if set (POC seed data range), otherwise `new Date()`. T3 will replace this
   * inline computation with `resolvePreset('mtd', anchor)` when date-presets.ts
   * lands.
   */
  applyDefault(): void {
    const anchorIso: string = environment.pocToday || '';
    const anchor: Date = anchorIso ? new Date(anchorIso) : new Date();
    const yyyy = anchor.getUTCFullYear();
    const mm   = anchor.getUTCMonth();      // 0-indexed
    const day  = anchor.getUTCDate();
    const pad  = (n: number): string => (n < 10 ? '0' + n : '' + n);
    const from = yyyy + '-' + pad(mm + 1) + '-01';
    const to   = yyyy + '-' + pad(mm + 1) + '-' + pad(day);
    this.setDateRange('mtd', from, to);
  }

  // -------------------- helpers --------------------

  private normalize(v: string | string[] | null | undefined): string[] {
    if (!v) { return []; }
    if (Array.isArray(v)) { return v.filter(s => s && s.length > 0); }
    return v.length > 0 ? [v] : [];
  }

  private parseCsv(s: string): string[] {
    if (!s) { return []; }
    return s.split(',').map(x => x.trim()).filter(x => x.length > 0);
  }
}
