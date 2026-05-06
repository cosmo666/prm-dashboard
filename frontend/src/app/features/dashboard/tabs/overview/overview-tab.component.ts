import { Component, OnInit, OnDestroy } from '@angular/core';
import { BehaviorSubject, EMPTY, forkJoin, Subject } from 'rxjs';
import { debounceTime, switchMap, takeUntil } from 'rxjs/operators';
import { FilterStore } from 'src/app/core/store/filter.store';
import { PrmDataService } from '../../services/prm-data.service';
import { DailyTrendResponse } from '../../services/prm-dtos';
import { DonutDatum } from 'src/app/shared/charts/donut-chart/donut-chart.component';
import { BarDatum } from 'src/app/shared/charts/horizontal-bar-chart/horizontal-bar-chart.component';

@Component({
  selector: 'app-overview-tab',
  templateUrl: './overview-tab.component.html',
  styleUrls: ['./overview-tab.component.scss'],
})
export class OverviewTabComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading$ = new BehaviorSubject<boolean>(false);

  // KPI state
  totalPrm$ = new BehaviorSubject<number>(0);
  totalDelta$ = new BehaviorSubject<number | null>(null);
  avgDuration$ = new BehaviorSubject<number>(0);
  durationDelta$ = new BehaviorSubject<number | null>(null);
  fulfillmentPct$ = new BehaviorSubject<number>(0);
  totalAgents$ = new BehaviorSubject<number>(0);
  agentsSelf$ = new BehaviorSubject<number>(0);
  agentsOutsourced$ = new BehaviorSubject<number>(0);
  avgServicesPerAgentPerDay$ = new BehaviorSubject<number>(0);
  avgServicesDelta$ = new BehaviorSubject<number | null>(null);

  // Chart state
  dailyTrend$ = new BehaviorSubject<DailyTrendResponse | null>(null);
  dailyTrendPrev$ = new BehaviorSubject<DailyTrendResponse | null>(null);
  serviceTypes$ = new BehaviorSubject<DonutDatum[]>([]);
  topAirlines$ = new BehaviorSubject<BarDatum[]>([]);

  constructor(
    public filters: FilterStore,
    private data: PrmDataService,
  ) {}

  ngOnInit(): void {
    this.filters.queryParams$.pipe(
      debounceTime(50),
      switchMap(() => {
        // Backend requires at least one airport + a date range. Skip the
        // forkJoin until the user (or applyDefault) has populated both.
        if (this.filters.airportSnapshot.length === 0 || !this.filters.dateFromSnapshot) {
          return EMPTY;
        }
        this.loading$.next(true);
        return forkJoin({
          kpis:      this.data.kpisSummary(),
          trend:     this.data.trendsDaily('count'),
          // OQ-P1-3 PoP overlay — second call shifts dates to the previous comparable period.
          trendPrev: this.data.trendsDailyPrev('count'),
          services:  this.data.topServices(),
          airlines:  this.data.topAirlines(10),
        });
      }),
      takeUntil(this.destroy$),
    ).subscribe(
      r => {
        // KPIs
        this.totalPrm$.next(r.kpis.totalPrm);
        this.totalDelta$.next(this.pctDelta(r.kpis.totalPrm, r.kpis.totalPrmPrevPeriod));
        this.avgDuration$.next(r.kpis.avgDurationMinutes);
        this.durationDelta$.next(this.pctDelta(r.kpis.avgDurationMinutes, r.kpis.avgDurationPrevPeriod));
        this.fulfillmentPct$.next(r.kpis.fulfillmentPct);
        this.totalAgents$.next(r.kpis.totalAgents);
        this.agentsSelf$.next(r.kpis.agentsSelf);
        this.agentsOutsourced$.next(r.kpis.agentsOutsourced);
        this.avgServicesPerAgentPerDay$.next(r.kpis.avgServicesPerAgentPerDay);
        this.avgServicesDelta$.next(this.pctDelta(r.kpis.avgServicesPerAgentPerDay, r.kpis.avgServicesPrevPeriod));

        // Trend (current + optional prev overlay)
        this.dailyTrend$.next(r.trend);
        this.dailyTrendPrev$.next(
          r.trendPrev && r.trendPrev.values && r.trendPrev.values.length > 0 ? r.trendPrev : null
        );

        // RankingsResponse → chart data
        this.serviceTypes$.next((r.services.items || []).slice(0, 5).map(s => ({
          name: s.label, value: s.count,
        })));
        this.topAirlines$.next((r.airlines.items || []).map(a => ({
          label: a.label, value: a.count,
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

  /** Used by the template (compact-number formatting for Total PRM). */
  formatCount(n: number | null): string {
    if (n === null || n === undefined) { return '—'; }
    if (n >= 1000000) { return (n / 1000000).toFixed(1) + 'M'; }
    if (n >= 1000)    { return (n / 1000).toFixed(1) + 'k'; }
    return n.toLocaleString();
  }

  /** OQ-P1-2 drill-down: donut segment click toggles the service filter. */
  onServiceSegmentClick(payload: { name: string; value: number }): void {
    if (payload && payload.name) { this.filters.toggleService(payload.name); }
  }

  /** OQ-P1-2 drill-down: bar click toggles the airline filter. */
  onAirlineBarClick(payload: { category: string; value: number }): void {
    if (payload && payload.category) { this.filters.toggleAirline(payload.category); }
  }

  private pctDelta(curr: number, prev: number): number | null {
    if (!prev) { return null; }   // no baseline → hide delta
    return ((curr - prev) / prev) * 100;
  }
}
