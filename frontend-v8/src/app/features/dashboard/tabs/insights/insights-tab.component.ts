import { Component, OnInit, OnDestroy } from '@angular/core';
import { BehaviorSubject, EMPTY, forkJoin, Subject } from 'rxjs';
import { debounceTime, switchMap, takeUntil } from 'rxjs/operators';
import { FilterStore } from 'src/app/core/store/filter.store';
import { PrmDataService } from '../../services/prm-data.service';
import { BarDatum } from 'src/app/shared/charts/bar-chart/bar-chart.component';
import { LineSeries } from 'src/app/shared/charts/line-chart/line-chart.component';
import { HeatmapCell } from 'src/app/shared/charts/heatmap-chart/heatmap-chart.component';

@Component({
  selector: 'app-insights-tab',
  templateUrl: './insights-tab.component.html',
  styleUrls: ['./insights-tab.component.scss'],
})
export class InsightsTabComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading$ = new BehaviorSubject<boolean>(true);

  // KPIs
  pauseRate$ = new BehaviorSubject<number>(0);
  outsourcedPct$ = new BehaviorSubject<number>(0);
  avgPerAgent$ = new BehaviorSubject<number>(0);
  noShowRate$ = new BehaviorSubject<number>(0);

  // Section 1: Agent Performance
  agentWorkload$ = new BehaviorSubject<BarDatum[]>([]);
  matrixCells$ = new BehaviorSubject<HeatmapCell[]>([]);
  matrixXLabels$ = new BehaviorSubject<string[]>([]);
  matrixYLabels$ = new BehaviorSubject<string[]>([]);

  // Section 2: Operational Patterns
  hourlyHeatCells$ = new BehaviorSubject<HeatmapCell[]>([]);
  hourlyXLabels$ = new BehaviorSubject<string[]>([]);
  hourlyYLabels$ = new BehaviorSubject<string[]>([]);
  durationSelfBars$ = new BehaviorSubject<BarDatum[]>([]);
  durationOutBars$ = new BehaviorSubject<BarDatum[]>([]);

  // Section 3: Strategic Trends
  monthlyTrendSeries$ = new BehaviorSubject<LineSeries[]>([]);
  noShowBars$ = new BehaviorSubject<BarDatum[]>([]);

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
          pause:    this.data.pauseAnalysis(),
          handling: this.data.handlingDistribution(),
          kpis:     this.data.kpisSummary(),
          noShows:  this.data.noShows(),
          agents:   this.data.topAgents(10),
          matrix:   this.data.agentServiceMatrix(10),
          hourly:   this.data.trendsHourly(),
          durByType: this.data.durationByAgentType(),
          monthly:  this.data.trendsMonthly(),
        });
      }),
      takeUntil(this.destroy$),
    ).subscribe(
      r => {
        // ── KPIs ──
        this.pauseRate$.next(r.pause.pauseRate || 0);

        // Outsourced share — find the OUT* label in the handling distribution
        // and divide by the total. Tolerant to label casing because backend
        // may shift between "OUTSOURCED" and "Outsourced" over time.
        const hLabels: string[] = r.handling.labels || [];
        const hValues: number[] = r.handling.values || [];
        const total = hValues.reduce((a, b) => a + b, 0) || 1;
        let outIdx = -1;
        for (let i = 0; i < hLabels.length; i++) {
          if ((hLabels[i] || '').toUpperCase().indexOf('OUT') === 0) { outIdx = i; break; }
        }
        this.outsourcedPct$.next(outIdx >= 0 ? ((hValues[outIdx] || 0) / total) * 100 : 0);

        const totalAgents = r.kpis.totalAgents || 0;
        const totalPrm    = r.kpis.totalPrm || 0;
        this.avgPerAgent$.next(totalAgents > 0 ? Math.round((totalPrm / totalAgents) * 10) / 10 : 0);

        const noShowItems = r.noShows.items || [];
        const noShowTotal = noShowItems.reduce((s, i) => s + (i.total || 0), 0) || 1;
        const noShowCount = noShowItems.reduce((s, i) => s + (i.noShows || 0), 0);
        this.noShowRate$.next(Math.round((noShowCount / noShowTotal) * 1000) / 10);

        // ── Section 1: Agent Workload (horizontal bar) ──
        const agentItems = r.agents.items || [];
        this.agentWorkload$.next(agentItems.map(a => ({
          label: a.agentName || a.agentNo || '',
          value: a.prmCount || 0,
        })));

        // ── Section 1: Agent Specialization (heatmap) ──
        // Backend ships both `agents` (numbers) and `agentNames` (display labels);
        // prefer names, fall back to numbers if names are absent.
        const mAgentNames: string[] = r.matrix.agentNames || [];
        const mAgents: string[] = r.matrix.agents || [];
        const mLabels = mAgentNames.length > 0 ? mAgentNames : mAgents;
        const mTypes: string[] = r.matrix.serviceTypes || [];
        const mValues: number[][] = r.matrix.values || [];
        const matrixCells: HeatmapCell[] = [];
        for (let ai = 0; ai < mLabels.length; ai++) {
          const row = mValues[ai] || [];
          for (let si = 0; si < mTypes.length; si++) {
            matrixCells.push({ x: mTypes[si], y: mLabels[ai], value: row[si] || 0 });
          }
        }
        this.matrixCells$.next(matrixCells);
        this.matrixXLabels$.next(mTypes);
        this.matrixYLabels$.next(mLabels);

        // ── Section 2: Hourly Demand (7 x 24 heatmap) ──
        // TS 3.4.5 has no String.padStart — use the ('00' + n).slice(-2) idiom.
        const days: string[] = r.hourly.days || [];
        const hours: number[] = r.hourly.hours || [];
        const hVals: number[][] = r.hourly.values || [];
        const hourLabels = hours.map(h => ('00' + h).slice(-2) + ':00');
        const hourlyCells: HeatmapCell[] = [];
        for (let di = 0; di < days.length; di++) {
          const row = hVals[di] || [];
          for (let hi = 0; hi < hours.length; hi++) {
            hourlyCells.push({ x: hourLabels[hi], y: days[di], value: row[hi] || 0 });
          }
        }
        this.hourlyHeatCells$.next(hourlyCells);
        this.hourlyXLabels$.next(hourLabels);
        this.hourlyYLabels$.next(days);

        // ── Section 2: Self vs Outsourced Duration (grouped bars) ──
        const durTypes: string[] = r.durByType.serviceTypes || [];
        const selfVals: number[] = r.durByType.self || [];
        const outVals: number[] = r.durByType.outsourced || [];
        this.durationSelfBars$.next(durTypes.map((t, i) => ({ label: t, value: selfVals[i] || 0 })));
        this.durationOutBars$.next(durTypes.map((t, i) => ({ label: t, value: outVals[i] || 0 })));

        // ── Section 3: Monthly Volume (area line) ──
        const months: string[] = r.monthly.months || [];
        const mVals: number[] = r.monthly.values || [];
        this.monthlyTrendSeries$.next([{
          name: 'Services',
          type: 'area',
          color: '#1d4ed8',
          data: months.map((m, i): [string, number] => [m, mVals[i] || 0]),
        }]);

        // ── Section 3: No-Show by Airline (bar with severity colour ramp) ──
        // Red >5%, amber 3-5%, green <3%.
        this.noShowBars$.next(noShowItems
          .filter(ns => (ns.noShows || 0) > 0)
          .slice(0, 10)
          .map(ns => ({
            label: ns.airline || '',
            value: ns.rate || 0,
            color: (ns.rate || 0) > 5 ? '#b91c1c' : (ns.rate || 0) >= 3 ? '#b45309' : '#047857',
          })));

        this.loading$.next(false);
      },
      err => {
        console.error('[insights] forkJoin failed', err);
        this.loading$.next(false);
      },
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Drill-down: clicking an agent bar narrows by agent_no when we have a
   * lookup. The horizontal bar emits the bar `label` (agent NAME from
   * topAgents). Without a name->number map we can only log; mirror main's
   * informational-only behaviour rather than guess.
   */
  // tslint:disable-next-line: no-empty
  onAgentClick(_label: string): void { }

  /** Drill-down: clicking a no-show bar narrows airline filter. */
  onNoShowAirlineClick(payload: { category: string; value: number }): void {
    if (!payload || !payload.category) { return; }
    this.filters.setAirline([payload.category]);
  }

  /** Monthly volume click — informational only. */
  // tslint:disable-next-line: no-empty
  onMonthClick(_month: string): void { }
}
