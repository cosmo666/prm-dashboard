import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { BarChartComponent, BarDatum } from '../../../../shared/charts/bar-chart/bar-chart.component';
import { LineChartComponent, LineSeries } from '../../../../shared/charts/line-chart/line-chart.component';
import { PrmDataService } from '../../services/prm-data.service';
import { FilterStore } from '../../../../core/store/filter.store';

export const SERVICE_TYPES = ['WCHR','WCHC','MAAS','WCHS','DPNA','UMNR','BLND','MEDA','WCMP'] as const;
export type ServiceType = typeof SERVICE_TYPES[number];

export interface ServiceSummary { type: ServiceType; count: number; pct: number; }
export interface MatrixRow { month: string; counts: Record<ServiceType, number>; total: number; }

@Component({
  selector: 'app-service-breakup',
  standalone: true,
  imports: [CommonModule, BarChartComponent, LineChartComponent],
  templateUrl: './service-breakup.component.html',
  styleUrl: './service-breakup.component.scss',
})
export class ServiceBreakupComponent {
  private data = inject(PrmDataService);
  filters = inject(FilterStore);

  loading = signal(true);
  serviceTypes = SERVICE_TYPES;

  summaries = signal<ServiceSummary[]>([]);
  matrix = signal<MatrixRow[]>([]);
  trendSeries = signal<LineSeries[]>([]);
  serviceCountBars = signal<BarDatum[]>([]);
  dowBars = signal<BarDatum[]>([]);

  maxPerColumn = computed<Record<ServiceType, number>>(() => {
    const m: Record<string, number> = {};
    for (const t of SERVICE_TYPES) {
      m[t] = Math.max(0, ...this.matrix().map(r => r.counts[t] ?? 0));
    }
    return m as Record<ServiceType, number>;
  });

  constructor() {
    effect(() => { this.filters.queryParams(); this.fetchAll(); }, { allowSignalWrites: true });
  }

  fetchAll() {
    if (!this.filters.airport() || !this.filters.dateFrom()) return;
    this.loading.set(true);
    forkJoin({
      byService: this.data.byServiceType(),
      topServices: this.data.topServices(),
      durStats: this.data.durationStats(),
      hourly: this.data.trendsHourly(),
    }).subscribe({
      next: (r: any) => {
        // ServiceTypeMatrixResponse: serviceTypes[], rows[{monthYear, serviceCounts, total}]
        const svcTypes: string[] = r.byService.serviceTypes ?? [];
        const monthRows: MatrixRow[] = (r.byService.rows ?? []).map((m: any) => {
          const counts: any = {};
          let total = 0;
          for (const t of SERVICE_TYPES) {
            counts[t] = m.serviceCounts?.[t] ?? 0;
            total += counts[t];
          }
          return { month: m.monthYear, counts, total };
        });
        this.matrix.set(monthRows);

        // Summary cards from topServices (RankingsResponse)
        const totals: Record<string, number> = {};
        for (const t of SERVICE_TYPES) totals[t] = 0;
        for (const item of r.topServices.items ?? []) totals[item.label] = item.count;
        const grand = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
        this.summaries.set(SERVICE_TYPES.map(t => ({
          type: t, count: totals[t], pct: (totals[t] / grand) * 100,
        })));

        // Stacked trend series (one line per service type, top 5)
        this.trendSeries.set(SERVICE_TYPES.slice(0, 5).map(t => ({
          name: t,
          data: monthRows.map(m => [m.month, m.counts[t]] as [string, number]),
        })));

        // PRM count by service type (backend has no per-service duration aggregation;
        // add one later if needed — for now we show volumes which is meaningful).
        this.serviceCountBars.set((r.topServices.items ?? []).map((d: any) => ({
          label: d.label, value: d.count,
        })));

        // Day of week from hourly heatmap: days[], hours[], values[][]
        const days: string[] = r.hourly.days ?? [];
        const hourValues: number[][] = r.hourly.values ?? [];
        const dowTotals: Record<string, number> = {};
        for (let di = 0; di < days.length; di++) {
          let sum = 0;
          for (let hi = 0; hi < (hourValues[di]?.length ?? 0); hi++) {
            sum += hourValues[di][hi] ?? 0;
          }
          dowTotals[days[di]] = sum;
        }
        this.dowBars.set(days.map(d => ({
          label: d,
          value: dowTotals[d] ?? 0,
          color: d === 'Sat' || d === 'Sun' ? '#fb8c00' : '#1e88e5',
        })));

        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  clickServiceCard(t: ServiceType) {
    const current = this.filters.service();
    this.filters.setFilter({ service: current === t ? '' : t });
  }

  isMaxInColumn(t: ServiceType, value: number): boolean {
    return value > 0 && value === this.maxPerColumn()[t];
  }
}
