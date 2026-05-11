import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthStore, AirportInfo } from 'src/app/core/store/auth.store';
import { FilterStore } from 'src/app/core/store/filter.store';

/**
 * Reimagined airport "selector" — instead of a long-form multiselect dropdown
 * that truncated names like "Kempegowda International Airport (BLR)" and
 * required a horizontal scrollbar, we render the user's RBAC-scoped airports
 * as inline IATA-code CHIPS. Click a chip to toggle it in/out of the active
 * filter; the full airport name is in the chip's title attribute for the
 * curious. This is faster (1 click vs open-dropdown-then-click), more
 * scannable (always visible), and visually distinguishes the airport
 * dimension from the airline / service / handled-by dropdowns.
 *
 * Never-empty rule preserved: clicking the only-active chip is a no-op so
 * the dashboard always has data to render.
 */
@Component({
  selector: 'app-airport-selector',
  templateUrl: './airport-selector.component.html',
  styleUrls: ['./airport-selector.component.scss'],
})
export class AirportSelectorComponent implements OnInit, OnDestroy {
  airports: AirportInfo[] = [];
  active: string[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private authStore: AuthStore,
    private filters: FilterStore,
  ) {}

  ngOnInit(): void {
    this.authStore.airports$.pipe(takeUntil(this.destroy$)).subscribe(airports => {
      this.airports = airports || [];
    });
    this.filters.airport$.pipe(takeUntil(this.destroy$)).subscribe(codes => {
      this.active = codes;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  isActive(code: string): boolean {
    return this.active.indexOf(code) >= 0;
  }

  toggle(code: string): void {
    // Never-empty: if this is the ONLY active chip, ignore the click so we
    // don't end up with zero airports filtered (the dashboard would have
    // nothing to render and the backend would 400 on missing ?airport=).
    if (this.active.length === 1 && this.active[0] === code) { return; }
    this.filters.toggleAirport(code);
  }

  trackByCode(_index: number, a: AirportInfo): string { return a.code; }
}
