import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthStore, AirportInfo } from 'src/app/core/store/auth.store';
import { FilterStore } from 'src/app/core/store/filter.store';

interface SelectOption { label: string; value: string; }

@Component({
  selector: 'app-airport-selector',
  templateUrl: './airport-selector.component.html',
  styleUrls: ['./airport-selector.component.scss'],
})
export class AirportSelectorComponent implements OnInit, OnDestroy {
  options: SelectOption[] = [];
  value: string[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private authStore: AuthStore,
    private filters: FilterStore,
  ) {}

  ngOnInit(): void {
    // RBAC-scoped option list — user can only pick airports from JWT claim.
    this.authStore.airports$.pipe(takeUntil(this.destroy$)).subscribe((airports: AirportInfo[]) => {
      this.options = airports.map(a => ({ label: a.name + ' (' + a.code + ')', value: a.code }));
    });

    // Two-way: filters.airport$ → component.value
    this.filters.airport$.pipe(takeUntil(this.destroy$)).subscribe(codes => {
      this.value = codes;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onChange(event: { value: string[] }): void {
    if (!event.value || event.value.length === 0) {
      // Never-empty rule (spec §8) — re-emit prior selection so the dashboard
      // always has data to render. Triggers re-render of the [(ngModel)] binding.
      this.value = this.filters.airportSnapshot;
      return;
    }
    this.filters.setAirport(event.value);
  }
}
