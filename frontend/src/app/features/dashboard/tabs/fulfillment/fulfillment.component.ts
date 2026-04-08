import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, forkJoin, switchMap } from 'rxjs';
import { KpiCardComponent } from '../../components/kpi-card/kpi-card.component';
import { LineChartComponent, LineSeries } from '../../../../shared/charts/line-chart/line-chart.component';
import { BarChartComponent, BarDatum } from '../../../../shared/charts/bar-chart/bar-chart.component';
import { SankeyChartComponent, SankeyNode, SankeyLink } from '../../../../shared/charts/sankey-chart/sankey-chart.component';
import { CompactNumberPipe } from '../../../../shared/pipes/compact-number.pipe';
import { PrmDataService } from '../../services/prm-data.service';
import { FilterStore } from '../../../../core/store/filter.store';

function timeBin(hour: number): string {
  const start = Math.floor(hour / 4) * 4;
  const end = start + 4;
  return `${String(start).padStart(2, '0')}-${String(end).padStart(2, '0')}`;
}

const BIN_COLORS: Record<string, string> = {
  '00-04': '#90a4ae', '04-08': '#90a4ae',
  '08-12': '#ef5350',
  '12-16': '#fb8c00',
  '16-20': '#fb8c00',
  '20-24': '#66bb6a',
};

@Component({
  selector: 'app-fulfillment',
  standalone: true,
  imports: [CommonModule, KpiCardComponent, LineChartComponent, BarChartComponent, SankeyChartComponent, CompactNumberPipe],
  templateUrl: './fulfillment.component.html',
  styleUrl: './fulfillment.component.scss',
})
export class FulfillmentComponent {
  private data = inject(PrmDataService);
  filters = inject(FilterStore);

  loading = signal(true);

  totalRequested = signal<number>(0);
  totalProvided = signal<number>(0);
  providedPct = signal<number>(0);
  walkupRate = signal<number>(0);

  dualAxisSeries = signal<LineSeries[]>([]);
  sankeyNodes = signal<SankeyNode[]>([]);
  sankeyLinks = signal<SankeyLink[]>([]);
  timeOfDay = signal<BarDatum[]>([]);
  cumulativeSeries = signal<LineSeries[]>([]);

  constructor() {
    toObservable(this.filters.queryParams).pipe(
      switchMap(() => {
        if (!this.filters.airport() || !this.filters.dateFrom()) {
          return EMPTY;
        }
        this.loading.set(true);
        return forkJoin({
          rvp: this.data.requestedVsProvided(),
          trend: this.data.trendsRequestedProvided(),
          agentType: this.data.byAgentType(),
          hourly: this.data.trendsHourly(),
          daily: this.data.trendsDaily('count'),
        });
      }),
      takeUntilDestroyed(),
    ).subscribe({
      next: (r: any) => {
        // KPIs from RequestedVsProvidedKpiResponse
        this.totalRequested.set(r.rvp.totalRequested ?? 0);
        this.totalProvided.set(r.rvp.totalProvided ?? 0);
        this.providedPct.set(r.rvp.fulfillmentRate ?? 0);
        this.walkupRate.set(r.rvp.walkUpRate ?? 0);

        // Dual-axis: RequestedVsProvidedTrendResponse (dates[], provided[], requested[])
        const dates: string[] = r.trend.dates ?? [];
        const provided: number[] = r.trend.provided ?? [];
        const requested: number[] = r.trend.requested ?? [];
        this.dualAxisSeries.set([
          { name: 'Provided',  type: 'bar',  data: dates.map((d, i) => [d.slice(-2), provided[i] ?? 0] as [string, number]), color: '#1e88e5' },
          { name: 'Requested', type: 'line', data: dates.map((d, i) => [d.slice(-2), requested[i] ?? 0] as [string, number]), color: '#fb8c00' },
        ]);

        // Sankey from SankeyResponse
        this.sankeyNodes.set((r.agentType.nodes ?? []).map((n: any) => ({ name: n.name })));
        this.sankeyLinks.set((r.agentType.links ?? []).map((l: any) => ({
          source: l.source, target: l.target, value: l.value,
        })));

        // Time of Day (4-hour bins) from HourlyHeatmapResponse
        const hDays: string[] = r.hourly.days ?? [];
        const hours: number[] = r.hourly.hours ?? [];
        const hValues: number[][] = r.hourly.values ?? [];
        const bins: Record<string, number> = { '00-04': 0, '04-08': 0, '08-12': 0, '12-16': 0, '16-20': 0, '20-24': 0 };
        for (let di = 0; di < hDays.length; di++) {
          for (let hi = 0; hi < hours.length; hi++) {
            const bin = timeBin(hours[hi]);
            bins[bin] = (bins[bin] ?? 0) + (hValues[di]?.[hi] ?? 0);
          }
        }
        this.timeOfDay.set(Object.keys(bins).map(b => ({
          label: b, value: bins[b], color: BIN_COLORS[b],
        })));

        // Cumulative pace from DailyTrendResponse
        const dailyDates: string[] = r.daily.dates ?? [];
        const dailyVals: number[] = r.daily.values ?? [];
        let cum = 0;
        const cumData: Array<[string, number]> = dailyDates.map((d, i) => {
          cum += dailyVals[i] ?? 0;
          return [d.slice(-2), cum];
        });
        const totalDays = dailyDates.length || 1;
        const finalTotal = cum;
        const targetData: Array<[string, number]> = dailyDates.map((d, i) =>
          [d.slice(-2), (finalTotal / totalDays) * (i + 1)]
        );
        this.cumulativeSeries.set([
          { name: 'Actual',  type: 'area', data: cumData,    color: '#1e88e5' },
          { name: 'Target',  type: 'line', data: targetData, color: '#888' },
        ]);

        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
