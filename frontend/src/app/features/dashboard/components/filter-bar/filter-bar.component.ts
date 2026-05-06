import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';
import { FilterStore } from 'src/app/core/store/filter.store';
import { PrmDataService } from '../../services/prm-data.service';

interface Opt { label: string; value: string; }

@Component({
  selector: 'app-filter-bar',
  templateUrl: './filter-bar.component.html',
  styleUrls: ['./filter-bar.component.scss'],
})
export class FilterBarComponent implements OnInit, OnDestroy {
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
    this.filters.airport$.pipe(
      debounceTime(150),
      takeUntil(this.destroy$),
    ).subscribe(airport => {
      if (airport.length === 0) {
        this.airlineOptions = [];
        this.serviceOptions = [];
        return;
      }
      this.data.filterOptions().subscribe({
        next: r => {
          this.airlineOptions = (r.airlines || []).map(a => ({ label: a, value: a }));
          this.serviceOptions = (r.services || []).map(s => ({ label: s, value: s }));
        },
        error: () => { /* leave previous options in place; surfaces via error toast in Phase 6 */ },
      });
    });

    // Two-way bindings — store → component
    this.filters.airline$.pipe(takeUntil(this.destroy$)).subscribe(v => this.airline = v);
    this.filters.service$.pipe(takeUntil(this.destroy$)).subscribe(v => this.service = v);
    this.filters.handledBy$.pipe(takeUntil(this.destroy$)).subscribe(v => this.handledBy = v);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setAirline(ev: { value: string[] }): void   { this.filters.setAirline(ev.value); }
  setService(ev: { value: string[] }): void   { this.filters.setService(ev.value); }
  setHandledBy(ev: { value: string[] }): void { this.filters.setHandledBy(ev.value); }

  removeAirline(v: string): void   { this.filters.removeAirline(v); }
  removeService(v: string): void   { this.filters.removeService(v); }
  removeHandledBy(v: string): void { this.filters.removeHandledBy(v); }

  handledByLabel(v: string): string {
    if (v === 'SELF') { return 'Self'; }
    if (v === 'OUTSOURCED') { return 'Outsourced'; }
    return v;
  }

  clearAll(): void { this.filters.clearSecondary(); }
}
