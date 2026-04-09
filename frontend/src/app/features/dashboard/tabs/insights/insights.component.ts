import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, forkJoin, switchMap } from 'rxjs';
import { KpiCardComponent } from '../../components/kpi-card/kpi-card.component';
import { BarChartComponent, BarDatum } from '../../../../shared/charts/bar-chart/bar-chart.component';
import { HorizontalBarChartComponent } from '../../../../shared/charts/horizontal-bar-chart/horizontal-bar-chart.component';
import { HeatmapChartComponent, HeatmapCell } from '../../../../shared/charts/heatmap-chart/heatmap-chart.component';
import { LineChartComponent, LineSeries } from '../../../../shared/charts/line-chart/line-chart.component';
import { PrmDataService } from '../../services/prm-data.service';
import { FilterStore } from '../../../../core/store/filter.store';
import { ToastService } from '../../../../core/toast/toast.service';

@Component({
  selector: 'app-insights',
  standalone: true,
  imports: [
    CommonModule, KpiCardComponent, BarChartComponent,
    HorizontalBarChartComponent, HeatmapChartComponent, LineChartComponent,
  ],
  templateUrl: './insights.component.html',
  styleUrl: './insights.component.scss',
})
export class InsightsComponent {
  private data = inject(PrmDataService);
  private toast = inject(ToastService);
  filters = inject(FilterStore);

  loading = signal(true);

  // KPIs
  pauseRate = signal<number>(0);
  outsourcedPct = signal<number>(0);
  avgPerAgent = signal<number>(0);
  noShowRate = signal<number>(0);

  // Section 1: Agent Performance
  agentWorkload = signal<BarDatum[]>([]);
  matrixCells = signal<HeatmapCell[]>([]);
  matrixXLabels = signal<string[]>([]);
  matrixYLabels = signal<string[]>([]);

  // Section 2: Operational Patterns
  hourlyHeatCells = signal<HeatmapCell[]>([]);
  hourlyXLabels = signal<string[]>([]);
  hourlyYLabels = signal<string[]>([]);
  durationSelfBars = signal<BarDatum[]>([]);
  durationOutBars = signal<BarDatum[]>([]);

  // Section 3: Strategic Trends
  monthlyTrendSeries = signal<LineSeries[]>([]);
  noShowBars = signal<BarDatum[]>([]);

  constructor() {
    toObservable(this.filters.queryParams).pipe(
      switchMap(() => {
        if (!this.filters.airport() || !this.filters.dateFrom()) {
          return EMPTY;
        }
        this.loading.set(true);
        return forkJoin({
          pause: this.data.pauseAnalysis(),
          handling: this.data.handlingDistribution(),
          kpis: this.data.kpisSummary(),
          noShows: this.data.noShows(),
          agents: this.data.topAgents(10),
          matrix: this.data.agentServiceMatrix(10),
          hourly: this.data.trendsHourly(),
          durByType: this.data.durationByAgentType(),
          monthly: this.data.trendsMonthly(),
        });
      }),
      takeUntilDestroyed(),
    ).subscribe({
      next: (r: any) => {
        // KPIs
        this.pauseRate.set(r.pause.pauseRate ?? 0);
        const hLabels: string[] = r.handling.labels ?? [];
        const hValues: number[] = r.handling.values ?? [];
        const total = hValues.reduce((a: number, b: number) => a + b, 0) || 1;
        const outIdx = hLabels.findIndex((l: string) => l.toUpperCase().startsWith('OUT'));
        this.outsourcedPct.set(outIdx >= 0 ? (hValues[outIdx] / total) * 100 : 0);
        this.avgPerAgent.set(
          r.kpis.totalAgents > 0
            ? Math.round((r.kpis.totalPrm / r.kpis.totalAgents) * 10) / 10
            : 0
        );
        const noShowTotal = (r.noShows.items ?? []).reduce((s: number, i: any) => s + i.total, 0) || 1;
        const noShowCount = (r.noShows.items ?? []).reduce((s: number, i: any) => s + i.noShows, 0);
        this.noShowRate.set(Math.round((noShowCount / noShowTotal) * 1000) / 10);

        // Agent Workload (horizontal bar)
        this.agentWorkload.set((r.agents.items ?? []).map((a: any) => ({
          label: a.agentName ?? a.agentNo,
          value: a.prmCount,
          color: a.topService === 'OUTSOURCED' ? '#fb8c00' : '#1d4ed8',
        })));

        // Agent Specialization Matrix (heatmap)
        const mAgents: string[] = r.matrix.agentNames ?? r.matrix.agents ?? [];
        const mTypes: string[] = r.matrix.serviceTypes ?? [];
        const mValues: number[][] = r.matrix.values ?? [];
        const cells: HeatmapCell[] = [];
        for (let ai = 0; ai < mAgents.length; ai++) {
          for (let si = 0; si < mTypes.length; si++) {
            cells.push({ x: mTypes[si], y: mAgents[ai], value: mValues[ai]?.[si] ?? 0 });
          }
        }
        this.matrixCells.set(cells);
        this.matrixXLabels.set(mTypes);
        this.matrixYLabels.set(mAgents);

        // Hourly Demand Heatmap
        const days: string[] = r.hourly.days ?? [];
        const hours: number[] = r.hourly.hours ?? [];
        const hVals: number[][] = r.hourly.values ?? [];
        const hourLabels = hours.map((h: number) => `${String(h).padStart(2, '0')}:00`);
        const hourlyCells: HeatmapCell[] = [];
        for (let di = 0; di < days.length; di++) {
          for (let hi = 0; hi < hours.length; hi++) {
            hourlyCells.push({ x: hourLabels[hi], y: days[di], value: hVals[di]?.[hi] ?? 0 });
          }
        }
        this.hourlyHeatCells.set(hourlyCells);
        this.hourlyXLabels.set(hourLabels);
        this.hourlyYLabels.set(days);

        // Self vs Outsourced Duration (grouped bars)
        const durTypes: string[] = r.durByType.serviceTypes ?? [];
        const selfVals: number[] = r.durByType.self ?? [];
        const outVals: number[] = r.durByType.outsourced ?? [];
        this.durationSelfBars.set(durTypes.map((t: string, i: number) => ({ label: t, value: selfVals[i] ?? 0 })));
        this.durationOutBars.set(durTypes.map((t: string, i: number) => ({ label: t, value: outVals[i] ?? 0 })));

        // Monthly Volume Trend
        const months: string[] = r.monthly.months ?? [];
        const mVals: number[] = r.monthly.values ?? [];
        this.monthlyTrendSeries.set([{
          name: 'Services',
          type: 'area',
          data: months.map((m: string, i: number) => [m, mVals[i] ?? 0] as [string, number]),
          color: '#1d4ed8',
        }]);

        // No-Show by Airline
        this.noShowBars.set((r.noShows.items ?? [])
          .filter((ns: any) => ns.noShows > 0)
          .slice(0, 10)
          .map((ns: any) => ({
            label: ns.airline,
            value: ns.rate,
            color: ns.rate > 5 ? '#b91c1c' : ns.rate >= 3 ? '#b45309' : '#047857',
          })));

        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onAgentClick(label: string): void {
    if (!label) return;
    this.toast.show(`Agent: ${label}`);
  }

  onNoShowAirlineClick(code: string): void {
    if (!code) return;
    this.filters.setAirline([code]);
    this.toast.show(`Filtered by airline: ${code}`);
  }

  onMonthClick(month: string): void {
    if (!month) return;
    this.toast.show(`Month: ${month}`);
  }
}
