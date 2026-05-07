import { Component, OnInit, OnDestroy } from '@angular/core';
import { BehaviorSubject, EMPTY, forkJoin, Subject } from 'rxjs';
import { debounceTime, switchMap, takeUntil } from 'rxjs/operators';
import { FilterStore } from 'src/app/core/store/filter.store';
import { PrmDataService } from '../../services/prm-data.service';
import { BarDatum } from 'src/app/shared/charts/bar-chart/bar-chart.component';

// IATA SSR codes for the 9-card row. Order matches main's editorial layout.
// WCMP (Wheelchair, Multi-Purpose) is included instead of DEAF — matches the
// codes returned by /breakdowns/by-service-type for the seed tenants.
const SERVICE_TYPES: string[] = ['WCHR', 'WCHC', 'MAAS', 'WCHS', 'DPNA', 'UMNR', 'BLND', 'MEDA', 'WCMP'];

// Per-SSR-code palette. WCHR is the dominant primary (anchored to --app-primary
// hex). Others use distinct hues so 9-segment stacks remain legible. Codes not
// in this map fall back to slate gray (#94a3b8) at the call site.
const SSR_COLORS: { [code: string]: string } = {
  WCHR: '#2563EB',
  WCHC: '#1e3a8a',
  WCHS: '#3b82f6',
  WCMP: '#6366f1',
  MAAS: '#0ea5e9',
  UMNR: '#8b5cf6',
  DPNA: '#a855f7',
  BLND: '#10b981',
  MEDA: '#f59e0b',
  DEAF: '#22c55e',
};

export interface ServiceSummary {
  type: string;
  count: number;
  pct: number;
}

export interface MatrixRow {
  month: string;
  counts: { [code: string]: number };
  total: number;
}

@Component({
  selector: 'app-service-breakup-tab',
  templateUrl: './service-breakup-tab.component.html',
  styleUrls: ['./service-breakup-tab.component.scss'],
})
export class ServiceBreakupTabComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  serviceTypes: string[] = SERVICE_TYPES;

  loading$ = new BehaviorSubject<boolean>(false);

  summaries$ = new BehaviorSubject<ServiceSummary[]>([]);
  matrix$ = new BehaviorSubject<MatrixRow[]>([]);
  maxPerColumn$ = new BehaviorSubject<{ [code: string]: number }>({});

  // Stacked monthly trend (top 5 services). Reuses the existing BarChart
  // stacked-vertical mode added in P3-T3 (no LineChart multi-series support
  // on this branch yet).
  trendBars$ = new BehaviorSubject<BarDatum[]>([]);
  trendStacked$ = new BehaviorSubject<{ [code: string]: number[] }>({});
  trendKeys$ = new BehaviorSubject<string[]>([]);
  trendColors$ = new BehaviorSubject<{ [code: string]: string }>({});

  serviceCountBars$ = new BehaviorSubject<BarDatum[]>([]);
  dowBars$ = new BehaviorSubject<BarDatum[]>([]);

  constructor(
    public filters: FilterStore,
    private data: PrmDataService,
  ) {}

  ngOnInit(): void {
    this.filters.queryParams$.pipe(
      debounceTime(50),
      switchMap(() => {
        if (this.filters.airportSnapshot.length === 0 || !this.filters.dateFromSnapshot) {
          return EMPTY;
        }
        this.loading$.next(true);
        return forkJoin({
          byService: this.data.serviceTypeMatrix(),
          topServices: this.data.topServices(),
          hourly: this.data.trendsHourly(),
        });
      }),
      takeUntil(this.destroy$),
    ).subscribe(
      r => {
        // Monthly matrix rows
        const rows: MatrixRow[] = (r.byService.rows || []).map(m => {
          const counts: { [code: string]: number } = {};
          let total = 0;
          for (const t of SERVICE_TYPES) {
            const c = (m.serviceCounts && m.serviceCounts[t]) || 0;
            counts[t] = c;
            total += c;
          }
          return { month: m.monthYear, counts, total };
        });
        this.matrix$.next(rows);

        // Max per column (for cell highlighting)
        const maxes: { [code: string]: number } = {};
        for (const t of SERVICE_TYPES) {
          let max = 0;
          for (const row of rows) {
            if (row.counts[t] > max) { max = row.counts[t]; }
          }
          maxes[t] = max;
        }
        this.maxPerColumn$.next(maxes);

        // Service summary cards from topServices ranking
        const totals: { [code: string]: number } = {};
        for (const t of SERVICE_TYPES) { totals[t] = 0; }
        for (const item of (r.topServices.items || [])) {
          totals[item.label] = item.count;
        }
        let grand = 0;
        for (const t of SERVICE_TYPES) { grand += totals[t]; }
        if (grand === 0) { grand = 1; }
        this.summaries$.next(SERVICE_TYPES.map(t => ({
          type: t,
          count: totals[t],
          pct: (totals[t] / grand) * 100,
        })));

        // Stacked monthly trend — top 5 services by total count
        const totalsForRanking: { code: string; total: number }[] = SERVICE_TYPES.map(t => {
          let s = 0;
          for (const row of rows) { s += row.counts[t]; }
          return { code: t, total: s };
        });
        totalsForRanking.sort((a, b) => b.total - a.total);
        const top5: string[] = totalsForRanking.slice(0, 5).map(x => x.code);
        const stacked: { [code: string]: number[] } = {};
        for (const t of top5) {
          stacked[t] = rows.map(row => row.counts[t]);
        }
        const colors: { [code: string]: string } = {};
        for (const t of top5) { colors[t] = SSR_COLORS[t] || '#94a3b8'; }
        this.trendBars$.next(rows.map(row => ({ label: row.month, value: 0 })));
        this.trendStacked$.next(stacked);
        this.trendKeys$.next(top5);
        this.trendColors$.next(colors);

        // Services by category (from topServices ranking)
        this.serviceCountBars$.next((r.topServices.items || []).map(d => ({
          label: d.label,
          value: d.count,
        })));

        // Day-of-week bars (sum across hours, weekend highlighted)
        const days: string[] = r.hourly.days || [];
        const hourValues: number[][] = r.hourly.values || [];
        const dowOut: BarDatum[] = days.map((day, di) => {
          const dayRow = hourValues[di] || [];
          let sum = 0;
          for (const v of dayRow) { sum += v || 0; }
          return {
            label: day,
            value: sum,
            color: (day === 'Sat' || day === 'Sun') ? '#fb8c00' : '#2563EB',
          };
        });
        this.dowBars$.next(dowOut);

        this.loading$.next(false);
      },
      err => {
        console.error('[service-breakup] forkJoin failed', err);
        this.loading$.next(false);
      },
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  isMaxInColumn(code: string, value: number): boolean {
    if (value <= 0) { return false; }
    const maxes = this.maxPerColumn$.value;
    return value === maxes[code];
  }

  /**
   * Service-card click — toggle a single-service focus.
   * If the user has already focused exactly this one service, clicking again
   * clears the filter back to "all services". Otherwise replaces the filter
   * with [type] (single-select drill-down, not multi-add).
   */
  onCardClick(code: string): void {
    const current = this.filters.serviceSnapshot;
    if (current.length === 1 && current[0] === code) {
      this.filters.setService([]);
    } else {
      this.filters.setService([code]);
    }
  }

  onServiceBarClick(payload: { category: string; value: number }): void {
    if (!payload || !payload.category) { return; }
    this.filters.setService([payload.category]);
  }

  /** Day-of-week bar click is informational only — no global day filter exists. */
  // tslint:disable-next-line: no-empty
  onDowClick(_payload: { category: string; value: number }): void { }

  isCardActive(code: string, activeServices: string[] | null): boolean {
    if (!activeServices) { return false; }
    return activeServices.indexOf(code) >= 0;
  }
}
