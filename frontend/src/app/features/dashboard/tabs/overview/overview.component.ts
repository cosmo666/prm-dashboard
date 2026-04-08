import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, forkJoin, of, switchMap } from 'rxjs';
import { KpiCardComponent } from '../../components/kpi-card/kpi-card.component';
import { BarChartComponent, BarDatum } from '../../../../shared/charts/bar-chart/bar-chart.component';
import { DonutChartComponent, DonutDatum } from '../../../../shared/charts/donut-chart/donut-chart.component';
import { HorizontalBarChartComponent } from '../../../../shared/charts/horizontal-bar-chart/horizontal-bar-chart.component';
import { LineChartComponent, LineSeries } from '../../../../shared/charts/line-chart/line-chart.component';
import { CompactNumberPipe } from '../../../../shared/pipes/compact-number.pipe';
import { PrmDataService } from '../../services/prm-data.service';
import { FilterStore } from '../../../../core/store/filter.store';
import { ToastService } from '../../../../core/toast/toast.service';
import { DEMO_ANNOTATIONS } from '../../utils/annotations';

function prevRange(from: string, to: string): { from: string; to: string } {
  const f = new Date(from);
  const t = new Date(to);
  const days = Math.round((t.getTime() - f.getTime()) / 86400000);
  const prevTo = new Date(f.getTime() - 86400000);
  const prevFrom = new Date(prevTo.getTime() - days * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(prevFrom), to: iso(prevTo) };
}

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, KpiCardComponent, BarChartComponent, DonutChartComponent, HorizontalBarChartComponent, LineChartComponent, CompactNumberPipe],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss',
})
export class OverviewComponent {
  private data = inject(PrmDataService);
  private toast = inject(ToastService);
  filters = inject(FilterStore);

  readonly annotations = DEMO_ANNOTATIONS;

  loading = signal(true);

  // KPIs
  totalPrm = signal<number>(0);
  totalDelta = signal<number | null>(null);
  activeAgents = signal<number>(0);
  selfAgents = signal<number>(0);
  outsourcedAgents = signal<number>(0);
  avgPerAgent = signal<number>(0);
  avgDuration = signal<number>(0);
  durationDelta = signal<number | null>(null);
  fulfillmentRate = signal<number>(0);

  // Charts
  dailyTrendSeries = signal<LineSeries[]>([]);
  handling = signal<DonutDatum[]>([]);
  serviceTypes = signal<DonutDatum[]>([]);
  durationBuckets = signal<BarDatum[]>([]);
  locations = signal<BarDatum[]>([]);

  constructor() {
    toObservable(this.filters.queryParams).pipe(
      switchMap(() => {
        if (!this.filters.airport() || !this.filters.dateFrom()) {
          return EMPTY;
        }
        this.loading.set(true);
        const compare = this.filters.compareMode();
        const from = this.filters.dateFrom();
        const to = this.filters.dateTo();
        const prev = compare && from && to ? prevRange(from, to) : null;
        return forkJoin({
          kpis: this.data.kpisSummary(),
          handling: this.data.handlingDistribution(),
          trend: this.data.trendsDaily('count'),
          prevTrend: prev
            ? this.data.trendsDailyRange(prev.from, prev.to, 'count')
            : of(null),
          services: this.data.topServices(),
          duration: this.data.durationDistribution(),
          locations: this.data.byLocation(),
        });
      }),
      takeUntilDestroyed(),
    ).subscribe({
      next: (r: any) => {
        // KPIs — compute delta as % change vs previous period
        this.totalPrm.set(r.kpis.totalPrm ?? 0);
        const prevPrm = r.kpis.totalPrmPrevPeriod;
        this.totalDelta.set(prevPrm ? ((r.kpis.totalPrm - prevPrm) / prevPrm) * 100 : null);
        this.activeAgents.set(r.kpis.totalAgents ?? 0);
        this.selfAgents.set(r.kpis.agentsSelf ?? 0);
        this.outsourcedAgents.set(r.kpis.agentsOutsourced ?? 0);
        this.avgPerAgent.set(r.kpis.avgServicesPerAgentPerDay ?? 0);
        this.avgDuration.set(r.kpis.avgDurationMinutes ?? 0);
        const prevDur = r.kpis.avgDurationPrevPeriod;
        this.durationDelta.set(prevDur ? ((r.kpis.avgDurationMinutes - prevDur) / prevDur) * 100 : null);
        this.fulfillmentRate.set(r.kpis.fulfillmentPct ?? 0);

        // Daily trend → LineSeries[] keyed on full yyyy-mm-dd dates (for annotation matching)
        const dates: string[] = r.trend.dates ?? [];
        const vals: number[] = r.trend.values ?? [];
        const currentSeries: LineSeries = {
          name: 'Current',
          data: dates.map((d: string, i: number): [string, number] => [d, vals[i] ?? 0]),
        };
        const series: LineSeries[] = [currentSeries];
        if (r.prevTrend) {
          const prevVals: number[] = r.prevTrend.values ?? [];
          // Align previous series to the current x-axis (day index), so both sit side-by-side
          // on the same axis. We use the current-period date as the x label but map by position.
          const alignedPrev: Array<[string, number]> = dates.map((d: string, i: number): [string, number] => [
            d,
            prevVals[i] ?? 0,
          ]);
          series.push({
            name: 'Previous period',
            data: alignedPrev,
            dashed: true,
            color: '#94a3b8',
          });
        }
        this.dailyTrendSeries.set(series);

        // Handling distribution: labels[] + values[] → DonutDatum[]
        const hLabels: string[] = r.handling.labels ?? [];
        const hValues: number[] = r.handling.values ?? [];
        const hColors: Record<string, string> = { Self: '#1e88e5', Outsourced: '#fb8c00' };
        this.handling.set(hLabels.map((l: string, i: number) => ({ name: l, value: hValues[i] ?? 0, color: hColors[l] })));

        // Service types: RankingsResponse.items → DonutDatum[]
        this.serviceTypes.set((r.services.items ?? []).slice(0, 5).map((s: any) => ({ name: s.label, value: s.count })));

        // Duration distribution: buckets[] → BarDatum[]
        this.durationBuckets.set((r.duration.buckets ?? []).map((b: any) => ({
          label: b.label, value: b.count,
        })));

        // Locations: BreakdownResponse.items → BarDatum[]
        this.locations.set((r.locations.items ?? []).map((l: any) => ({ label: l.label, value: l.count })));

        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onDailyPointClick(dateLabel: string): void {
    // dateLabel is the x-axis value — we set it as the full yyyy-mm-dd in the series
    if (!dateLabel) return;
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(dateLabel) ? dateLabel : null;
    if (!iso) return;
    this.filters.setDateRange('custom', iso, iso);
    this.toast.show(`Drilled down to ${iso}`);
  }

  onHandlingClick(name: string): void {
    if (!name) return;
    const lower = name.toLowerCase();
    if (lower.startsWith('self')) {
      this.filters.setFilter({ handledBy: 'SELF' });
      this.toast.show('Filtered by handled-by: Self');
    } else if (lower.startsWith('out')) {
      this.filters.setFilter({ handledBy: 'OUTSOURCED' });
      this.toast.show('Filtered by handled-by: Outsourced');
    }
  }
}
