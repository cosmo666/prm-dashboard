import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest, Observable, Subject } from 'rxjs';
import { debounceTime, map, skip, take, takeUntil } from 'rxjs/operators';
import { FilterStore } from 'src/app/core/store/filter.store';
import { AuthStore } from 'src/app/core/store/auth.store';

interface TabDef { label: string; route: string; }

const TABS: TabDef[] = [
  { label: 'Overview',        route: 'overview'        },
  { label: 'Top 10',          route: 'top10'           },
  { label: 'Service Breakup', route: 'service-breakup' },
];

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  readonly tabs = TABS;
  filterSummary$: Observable<string>;

  private destroy$ = new Subject<void>();

  constructor(
    public filters: FilterStore,
    private route: ActivatedRoute,
    private router: Router,
    private authStore: AuthStore,
  ) {
    // Human-readable summary of the active secondary filters. Mirrors main's
    // `filterSummary` computed signal — built from the three secondary arrays
    // (airline / service / handledBy) since those are the values a user
    // would describe out loud as "what am I filtering by". Empty string when
    // nothing is active so the template can hide the chip with *ngIf.
    this.filterSummary$ = combineLatest([
      this.filters.airline$, this.filters.service$, this.filters.handledBy$,
    ]).pipe(
      map((vals: string[][]) => {
        const active: string[] = [];
        for (const arr of vals) { for (const v of arr) { active.push(v); } }
        if (active.length === 0) { return ''; }
        if (active.length === 1) { return 'Filtered by ' + active[0]; }
        return active.length + ' filters applied · ' + active.join(' / ');
      }),
    );
  }

  ngOnInit(): void {
    this.route.queryParams.pipe(take(1), takeUntil(this.destroy$)).subscribe(params => {
      if (Object.keys(params).length === 0) {
        // Default airport set: first JWT airport (never-empty rule)
        const codes = this.authStore.airportCodesSnapshot;
        if (codes.length > 0) { this.filters.setAirport([codes[0]]); }
        this.filters.applyDefault();   // mtd date range
      } else {
        // Cast Params (Angular has loose Params type) → string-record before hydrate
        const dict: { [key: string]: string } = {};
        for (const k of Object.keys(params)) {
          // tslint:disable-next-line: no-any
          const v = (params as any)[k];
          if (typeof v === 'string') {
            dict[k] = v;
          } else if (Array.isArray(v) && v.length > 0) {
            dict[k] = String(v[0]);
          }
        }
        this.filters.hydrateFromQueryParams(dict);
      }
    });

    this.filters.queryParams$.pipe(skip(1), debounceTime(150), takeUntil(this.destroy$)).subscribe(qp => {
      // queryParamsHandling: '' (empty string) is Angular's documented "replace
      // all" mode — required so cleared filters disappear from the URL instead
      // of lingering. 'merge' would keep stale params; ''/undefined replaces.
      this.router.navigate([], { relativeTo: this.route, queryParams: qp, queryParamsHandling: '' });
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
