import { Component, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { KpiCardComponent } from '../../components/kpi-card/kpi-card.component';
import { BarChartComponent, BarDatum } from '../../../../shared/charts/bar-chart/bar-chart.component';
import { DonutChartComponent, DonutDatum } from '../../../../shared/charts/donut-chart/donut-chart.component';
import { HorizontalBarChartComponent } from '../../../../shared/charts/horizontal-bar-chart/horizontal-bar-chart.component';
import { PrmDataService } from '../../services/prm-data.service';
import { FilterStore } from '../../../../core/store/filter.store';

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, KpiCardComponent, BarChartComponent, DonutChartComponent, HorizontalBarChartComponent],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss',
})
export class OverviewComponent {
  private data = inject(PrmDataService);
  filters = inject(FilterStore);

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
  dailyTrend = signal<BarDatum[]>([]);
  handling = signal<DonutDatum[]>([]);
  serviceTypes = signal<DonutDatum[]>([]);
  durationBuckets = signal<BarDatum[]>([]);
  locations = signal<BarDatum[]>([]);

  constructor() {
    effect(() => {
      this.filters.queryParams(); // track filter changes
      this.fetchAll();
    });
  }

  fetchAll() {
    if (!this.filters.airport() || !this.filters.dateFrom()) return;
    this.loading.set(true);
    forkJoin({
      kpis: this.data.kpisSummary(),
      handling: this.data.handlingDistribution(),
      trend: this.data.trendsDaily('count'),
      services: this.data.topServices(),
      duration: this.data.durationDistribution(),
      locations: this.data.byLocation(),
    }).subscribe({
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

        // Daily trend: dates[] + values[] → BarDatum[]
        const dates: string[] = r.trend.dates ?? [];
        const vals: number[] = r.trend.values ?? [];
        this.dailyTrend.set(dates.map((d: string, i: number) => ({ label: d.slice(-2), value: vals[i] ?? 0 })));

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
}
