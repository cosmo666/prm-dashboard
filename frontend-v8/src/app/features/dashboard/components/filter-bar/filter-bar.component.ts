import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { of, Subject } from 'rxjs';
import { takeUntil, debounceTime, switchMap } from 'rxjs/operators';
import { FilterStore } from 'src/app/core/store/filter.store';
import { PrmDataService } from '../../services/prm-data.service';
import { FilterOptionsResponse } from '../../services/prm-dtos';

const EMPTY_OPTIONS: FilterOptionsResponse = {
  airlines: [], services: [], handledBy: [], flights: [],
  minDate: null, maxDate: null,
};

interface Opt { label: string; value: string; }

/**
 * FilterBar — secondary-filter strip (airline / service / handled-by / date /
 * airport).
 *
 * Two layouts:
 *   inline = false (default) — labelled cells stacked vertically, with chips
 *   underneath. Used on standalone pages and as the dashboard's pre-Phase-D fallback.
 *
 *   inline = true — single horizontal row designed to live next to the tab
 *   pills inside the dashboard's "control row". No labels above each cell;
 *   the multiselect's [defaultLabel] doubles as the empty-state placeholder
 *   ("Airline" / "Service" / "Handled by"). No chips row.
 */
@Component({
  selector: 'app-filter-bar',
  templateUrl: './filter-bar.component.html',
  styleUrls: ['./filter-bar.component.scss'],
})
export class FilterBarComponent implements OnInit, OnDestroy {
  @Input() inline = false;

  airlineOptions: Opt[] = [];
  serviceOptions: Opt[] = [];
  handledByOptions: Opt[] = [
    { label: 'Self', value: 'SELF' },
    { label: 'Outsourced', value: 'OUTSOURCED' },
  ];

  airline: string[] = [];
  service: string[] = [];
  handledBy: string[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    public filters: FilterStore,
    private data: PrmDataService,
  ) {}

  ngOnInit(): void {
    // Re-fetch options when the airport set changes. Debounced so toggling
    // multiple airports in quick succession only triggers one round-trip.
    // switchMap cancels any in-flight request when a newer airport$ emission
    // arrives — guards against last-write-wins on stale responses.
    this.filters.airport$.pipe(
      debounceTime(150),
      switchMap(airport => airport.length === 0 ? of(EMPTY_OPTIONS) : this.data.filterOptions()),
      takeUntil(this.destroy$),
    ).subscribe(
      r => {
        this.airlineOptions = (r.airlines || []).map(a => ({ label: a, value: a }));
        this.serviceOptions = (r.services || []).map(s => ({ label: s, value: s }));
      },
      () => { /* leave previous options in place; surfaces via error toast in Phase 6 */ },
    );

    // Two-way bindings — store → component
    this.filters.airline$.pipe(takeUntil(this.destroy$)).subscribe(v => this.airline = v);
    this.filters.service$.pipe(takeUntil(this.destroy$)).subscribe(v => this.service = v);
    this.filters.handledBy$.pipe(takeUntil(this.destroy$)).subscribe(v => this.handledBy = v);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setAirline(ev: { value: string[] }): void {
    this.filters.setAirline(this.collapseAllSelected(ev.value, this.airlineOptions.length));
  }
  setService(ev: { value: string[] }): void {
    this.filters.setService(this.collapseAllSelected(ev.value, this.serviceOptions.length));
  }
  setHandledBy(ev: { value: string[] }): void {
    this.filters.setHandledBy(this.collapseAllSelected(ev.value, this.handledByOptions.length));
  }

  /**
   * "Select all" is semantically equivalent to "no filter applied" — both
   * pass the same data through the dashboard. Collapsing a fully-populated
   * selection back to an empty array makes the trigger label revert to its
   * placeholder ("All airlines" / "All services" / "Both") rather than
   * showing a bursting list of every option's value.
   */
  private collapseAllSelected(v: string[], total: number): string[] {
    if (total > 0 && v.length === total) { return []; }
    return v;
  }

  removeAirline(v: string): void   { this.filters.removeAirline(v); }
  removeService(v: string): void   { this.filters.removeService(v); }
  removeHandledBy(v: string): void { this.filters.removeHandledBy(v); }

  handledByLabel(v: string): string {
    if (v === 'SELF') { return 'Self'; }
    if (v === 'OUTSOURCED') { return 'Outsourced'; }
    return v;
  }

  clearAll(): void { this.filters.clearSecondary(); }

  hasAnyFilter(): boolean {
    return this.airline.length > 0 || this.service.length > 0 || this.handledBy.length > 0;
  }
}
