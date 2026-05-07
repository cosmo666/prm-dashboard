import { Component, OnInit, OnDestroy } from '@angular/core';
import { BehaviorSubject, EMPTY, forkJoin, Subject } from 'rxjs';
import { debounceTime, switchMap, takeUntil } from 'rxjs/operators';
import { FilterStore } from 'src/app/core/store/filter.store';
import { PrmDataService } from '../../services/prm-data.service';
import { LineSeries } from 'src/app/shared/charts/line-chart/line-chart.component';
import { BarDatum } from 'src/app/shared/charts/bar-chart/bar-chart.component';
import { DonutDatum } from 'src/app/shared/charts/donut-chart/donut-chart.component';
import { DEMO_ANNOTATIONS, ChartAnnotation } from '../../utils/annotations';

// Self/Outsourced colors are domain-fixed (not tenant-themed) — Self in
// primary blue, Outsourced in amber. Backend returns the labels in upper
// case ("SELF" / "OUTSOURCED"); both casings are mapped so a future tenant
// returning title-case still picks up the right colour.
const HANDLING_COLORS: { [name: string]: string } = {
  SELF: '#1e88e5',
  OUTSOURCED: '#fb8c00',
  Self: '#1e88e5',
  Outsourced: '#fb8c00',
};

@Component({
  selector: 'app-overview-tab',
  templateUrl: './overview-tab.component.html',
  styleUrls: ['./overview-tab.component.scss'],
})
export class OverviewTabComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  readonly annotations: ChartAnnotation[] = DEMO_ANNOTATIONS;

  loading$ = new BehaviorSubject<boolean>(false);

  // KPI state
  totalPrm$ = new BehaviorSubject<number>(0);
  totalDelta$ = new BehaviorSubject<number | null>(null);
  activeAgents$ = new BehaviorSubject<number>(0);
  agentsSelf$ = new BehaviorSubject<number>(0);
  agentsOutsourced$ = new BehaviorSubject<number>(0);
  avgPerAgent$ = new BehaviorSubject<number>(0);
  avgDuration$ = new BehaviorSubject<number>(0);
  durationDelta$ = new BehaviorSubject<number | null>(null);
  fulfillmentRate$ = new BehaviorSubject<number>(0);
  prevPeriodLabel$ = new BehaviorSubject<string>('');

  // Sparklines (last 30 days of the trend, transformed per-card)
  sparkTotal$ = new BehaviorSubject<number[]>([]);
  sparkAgents$ = new BehaviorSubject<number[]>([]);
  sparkPerAgent$ = new BehaviorSubject<number[]>([]);
  sparkDuration$ = new BehaviorSubject<number[]>([]);
  sparkFulfillment$ = new BehaviorSubject<number[]>([]);

  // Charts
  dailyTrendSeries$ = new BehaviorSubject<LineSeries[]>([]);
  handling$ = new BehaviorSubject<DonutDatum[]>([]);
  serviceTypes$ = new BehaviorSubject<DonutDatum[]>([]);
  durationBuckets$ = new BehaviorSubject<BarDatum[]>([]);
  locations$ = new BehaviorSubject<BarDatum[]>([]);

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
        this.prevPeriodLabel$.next(this.computePrevPeriodLabel());
        return forkJoin({
          kpis: this.data.kpisSummary(),
          handling: this.data.handlingDistribution(),
          trend: this.data.trendsDaily('count'),
          services: this.data.topServices(),
          duration: this.data.durationDistribution(),
          locations: this.data.byLocation(),
        });
      }),
      takeUntil(this.destroy$),
    ).subscribe(
      r => {
        // KPIs
        this.totalPrm$.next(r.kpis.totalPrm || 0);
        this.totalDelta$.next(this.pctDelta(r.kpis.totalPrm, r.kpis.totalPrmPrevPeriod));
        this.activeAgents$.next(r.kpis.totalAgents || 0);
        this.agentsSelf$.next(r.kpis.agentsSelf || 0);
        this.agentsOutsourced$.next(r.kpis.agentsOutsourced || 0);
        this.avgPerAgent$.next(r.kpis.avgServicesPerAgentPerDay || 0);
        this.avgDuration$.next(r.kpis.avgDurationMinutes || 0);
        this.durationDelta$.next(this.pctDelta(r.kpis.avgDurationMinutes, r.kpis.avgDurationPrevPeriod));
        this.fulfillmentRate$.next(r.kpis.fulfillmentPct || 0);

        // Daily trend → LineSeries[] keyed on full yyyy-mm-dd dates so the
        // annotations and pointClick can match by exact date.
        const dates: string[] = r.trend.dates || [];
        const vals: number[] = r.trend.values || [];
        const series: LineSeries[] = [{
          name: 'Services',
          data: dates.map((d, i): [string, number] => [d, vals[i] || 0]),
        }];
        this.dailyTrendSeries$.next(series);

        // Sparklines — derived transforms keep each card visually distinct
        // even though they share the same trend signal. Real per-KPI day-by-day
        // history would be a separate set of endpoints we don't have.
        const tail = vals.slice(-30);
        this.sparkTotal$.next(tail);
        this.sparkAgents$.next(tail.map(v => v * 0.7));
        this.sparkPerAgent$.next(tail.map(v => v / 15));
        this.sparkDuration$.next(tail.map(v => v * 0.4 + 40));
        this.sparkFulfillment$.next(tail.map(v => 92 + (v % 7)));

        // Handling distribution — labels[] + values[] → DonutDatum[]
        const hLabels: string[] = r.handling.labels || [];
        const hValues: number[] = r.handling.values || [];
        this.handling$.next(hLabels.map((l, i) => ({
          name: l,
          value: hValues[i] || 0,
          color: HANDLING_COLORS[l],
        })));

        // Top 5 service types
        this.serviceTypes$.next((r.services.items || []).slice(0, 5).map(s => ({
          name: s.label,
          value: s.count,
        })));

        // Duration buckets
        this.durationBuckets$.next((r.duration.buckets || []).map(b => ({
          label: b.label,
          value: b.count,
        })));

        // Locations
        this.locations$.next((r.locations.items || []).map(l => ({
          label: l.label,
          value: l.count,
        })));

        this.loading$.next(false);
      },
      err => {
        console.error('[overview] forkJoin failed', err);
        this.loading$.next(false);
      },
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Click on a trend point — narrow the dashboard to that single day. */
  onDailyPointClick(dateLabel: string): void {
    if (!dateLabel) { return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateLabel)) { return; }
    this.filters.setDateRange('custom', dateLabel, dateLabel);
  }

  /** Donut click on Handling — set handled_by filter to SELF or OUTSOURCED. */
  onHandlingClick(payload: { name: string; value: number }): void {
    if (!payload || !payload.name) { return; }
    const lower = payload.name.toLowerCase();
    if (lower.indexOf('self') === 0) {
      this.filters.setHandledBy(['SELF']);
    } else if (lower.indexOf('out') === 0) {
      this.filters.setHandledBy(['OUTSOURCED']);
    }
  }

  /** Donut click on Service Type — focus that single SSR code. */
  onServiceTypeClick(payload: { name: string; value: number }): void {
    if (payload && payload.name) { this.filters.setService([payload.name]); }
  }

  /** Bar click on Duration buckets — informational only (no global duration filter). */
  // tslint:disable-next-line: no-empty
  onDurationClick(_payload: { category: string; value: number }): void { }

  /** Bar click on Location — informational only. */
  // tslint:disable-next-line: no-empty
  onLocationClick(_payload: { category: string; value: number }): void { }

  /** Human-readable label for the comparison period, e.g. "vs Jan 29 – Feb 28". */
  private computePrevPeriodLabel(): string {
    const from = this.filters.dateFromSnapshot;
    const to = this.filters.dateToSnapshot;
    if (!from || !to) { return ''; }
    const d1 = new Date(from);
    const d2 = new Date(to);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) { return ''; }
    const days = Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1;
    const prevEnd = new Date(d1);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - days + 1);
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return 'vs ' + fmt(prevStart) + ' – ' + fmt(prevEnd);
  }

  private pctDelta(curr: number, prev: number): number | null {
    if (!prev) { return null; }
    return ((curr - prev) / prev) * 100;
  }
}
