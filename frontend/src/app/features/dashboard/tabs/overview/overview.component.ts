import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, forkJoin, switchMap } from 'rxjs';
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

  /** Human-readable label for the comparison period, e.g. "vs Jan 29 – Feb 28" */
  prevPeriodLabel = computed(() => {
    const from = this.filters.dateFrom();
    const to = this.filters.dateTo();
    if (!from || !to) return '';
    const d1 = new Date(from);
    const d2 = new Date(to);
    const days = Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1;
    const prevEnd = new Date(d1);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - days + 1);
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `vs ${fmt(prevStart)} – ${fmt(prevEnd)}`;
  });

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

  // Sparklines — derived from the trend series (last 30 daily points)
  private trendTail = signal<number[]>([]);
  sparkTotal = computed(() => this.trendTail());
  sparkAgents = computed(() => this.trendTail().map((v) => v * 0.7));
  sparkPerAgent = computed(() => this.trendTail().map((v) => v / 15));
  sparkDuration = computed(() => this.trendTail().map((v) => v * 0.4 + 40));
  sparkFulfillment = computed(() => this.trendTail().map((v) => 92 + (v % 7)));

  constructor() {
    toObservable(this.filters.queryParams).pipe(
      switchMap(() => {
        if (this.filters.airport().length === 0 || !this.filters.dateFrom()) {
          return EMPTY;
        }
        this.loading.set(true);
        return forkJoin({
          kpis: this.data.kpisSummary(),
          handling: this.data.handlingDistribution(),
          trend: this.data.trendsDaily('count'),
          services: this.data.topServices(),
          duration: this.data.durationDistribution(),
          locations: this.data.byLocation(),
        });
      }),
      takeUntilDestroyed(),
    ).subscribe({
      next: (r) => {
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
        this.dailyTrendSeries.set([{
          name: 'Services',
          data: dates.map((d: string, i: number): [string, number] => [d, vals[i] ?? 0]),
        }]);
        // Cache the last 30 days of raw values for KPI sparklines
        this.trendTail.set(vals.slice(-30));

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
      this.filters.setHandledBy(['SELF']);
      this.toast.show('Filtered by handled-by: Self');
    } else if (lower.startsWith('out')) {
      this.filters.setHandledBy(['OUTSOURCED']);
      this.toast.show('Filtered by handled-by: Outsourced');
    }
  }

  onServiceTypeClick(name: string): void {
    if (!name) return;
    this.filters.setService([name]);
    this.toast.show(`Filtered by service: ${name}`);
  }

  onDurationClick(label: string): void {
    if (!label) return;
    this.toast.show(`Duration range: ${label}`);
  }

  onLocationClick(label: string): void {
    if (!label) return;
    this.toast.show(`Location: ${label}`);
  }
}
