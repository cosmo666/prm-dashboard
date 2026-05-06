import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, skip, take, takeUntil } from 'rxjs/operators';
import { FilterStore } from 'src/app/core/store/filter.store';
import { AuthStore } from 'src/app/core/store/auth.store';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  constructor(
    public filters: FilterStore,
    private route: ActivatedRoute,
    private router: Router,
    private authStore: AuthStore,
  ) {}

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
