import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest, EMPTY, forkJoin, switchMap } from 'rxjs';
import { BarChartComponent, BarDatum } from '../../../../shared/charts/bar-chart/bar-chart.component';
import { HorizontalBarChartComponent } from '../../../../shared/charts/horizontal-bar-chart/horizontal-bar-chart.component';
import { PrmDataService } from '../../services/prm-data.service';
import { FilterStore } from '../../../../core/store/filter.store';
import { ToastService } from '../../../../core/toast/toast.service';
import { TooltipDirective } from '../../../../shared/directives/tooltip.directive';

export interface AgentRow {
  rank: number;
  agentNo: string;
  name: string;
  count: number;
  avgDuration: number;
  avgPerDay: number;
  topService: string;
  topServiceCount: number;
  topAirline: string;
  daysActive: number;
}

export const TOP_X_OPTIONS = [5, 10, 15, 20] as const;

// Muted, operational carrier colors — not vivid
const CARRIER_COLORS: Record<string, string> = {
  AI: '#be185d',
  '6E': '#0369a1',
  UK: '#7c3aed',
  EK: '#ca8a04',
  QR: '#0d9488',
  SQ: '#059669',
  LH: '#1e3a8a',
  BA: '#475569',
  CX: '#c2410c',
  TG: '#65a30d',
};

@Component({
  selector: 'app-top10',
  standalone: true,
  imports: [CommonModule, BarChartComponent, HorizontalBarChartComponent, TooltipDirective],
  templateUrl: './top10.component.html',
  styleUrl: './top10.component.scss',
})
export class Top10Component {
  private data = inject(PrmDataService);
  private toast = inject(ToastService);
  filters = inject(FilterStore);

  loading = signal(true);
  topX = signal<number>(10);
  readonly topXOptions = TOP_X_OPTIONS;
  topAirlines = signal<BarDatum[]>([]);
  topFlights = signal<BarDatum[]>([]);
  topFlightsRequested = signal<BarDatum[]>([]);
  topAgents = signal<AgentRow[]>([]);
  topRoutes = signal<BarDatum[]>([]);
  noShows = signal<BarDatum[]>([]);

  // Empty placeholder rows for skeleton state
  skeletonAgents = Array.from({ length: 8 }, (_, i) => i);

  constructor() {
    combineLatest([
      toObservable(this.filters.queryParams),
      toObservable(this.topX),
    ]).pipe(
      switchMap(([, limit]) => {
        if (!this.filters.airport() || !this.filters.dateFrom()) {
          return EMPTY;
        }
        this.loading.set(true);
        return forkJoin({
          airlines: this.data.topAirlines(limit),
          flights: this.data.topFlights(limit),
          agents: this.data.topAgents(limit),
          routes: this.data.byRoute(),
          noShows: this.data.noShows(),
        });
      }),
      takeUntilDestroyed(),
    ).subscribe({
      next: (r: any) => {
        this.topAirlines.set((r.airlines.items ?? []).map((a: any) => ({
          label: a.label,
          value: a.count,
          color: CARRIER_COLORS[a.label] ?? '#475569',
        })));
        this.topFlights.set((r.flights.items ?? []).map((f: any) => {
          const airline = f.label?.substring(0, 2) ?? '';
          return { label: f.label, value: f.servicedCount ?? 0, color: CARRIER_COLORS[airline] ?? '#475569' };
        }));
        this.topFlightsRequested.set((r.flights.items ?? []).map((f: any) => ({
          label: f.label,
          value: f.requestedCount ?? 0,
        })));
        this.topAgents.set((r.agents.items ?? []).map((a: any, i: number) => ({
          rank: a.rank ?? i + 1,
          agentNo: a.agentNo ?? '',
          name: a.agentName ?? '',
          count: a.prmCount ?? 0,
          avgDuration: a.avgDurationMinutes ?? 0,
          avgPerDay: a.avgPerDay ?? 0,
          topService: a.topService ?? '—',
          topServiceCount: a.topServiceCount ?? 0,
          topAirline: a.topAirline ?? '—',
          daysActive: a.daysActive ?? 0,
        })));
        this.topRoutes.set((r.routes.items ?? []).slice(0, 10).map((route: any) => ({
          label: `${route.departure} → ${route.arrival}`,
          value: route.count,
        })));
        this.noShows.set((r.noShows.items ?? []).map((ns: any) => ({
          label: ns.airline,
          value: ns.rate,
          color: ns.rate > 5 ? '#b91c1c' : ns.rate >= 3 ? '#b45309' : '#047857',
        })));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  setTopX(n: number): void {
    if (this.topX() !== n) this.topX.set(n);
  }

  rankClass(rank: number): string {
    if (rank === 1) return 'rank--gold';
    if (rank === 2) return 'rank--silver';
    if (rank === 3) return 'rank--bronze';
    return '';
  }

  durationClass(minutes: number): string {
    if (minutes < 20) return 'duration--fast';
    if (minutes < 40) return 'duration--mid';
    return 'duration--slow';
  }

  // Format rank as "01", "02"... "10"
  formatRank(rank: number): string {
    return rank.toString().padStart(2, '0');
  }

  // Editorial cadence label based on active-day count within the period
  daysLabel(days: number): string {
    if (days >= 20) return 'daily';
    if (days >= 10) return 'frequent';
    if (days >= 5) return 'regular';
    if (days >= 1) return 'occasional';
    return 'inactive';
  }

  onAirlineClick(code: string): void {
    if (!code) return;
    this.filters.setAirline([code]);
    this.toast.show(`Filtered by airline: ${code}`);
  }

  onFlightClick(code: string): void {
    if (!code) return;
    this.filters.setFilter({ flight: code });
    this.toast.show(`Filtered by flight: ${code}`);
  }

  onRouteClick(label: string): void {
    if (!label) return;
    this.toast.show(`Route: ${label}`);
  }

  onNoShowAirlineClick(code: string): void {
    if (!code) return;
    this.filters.setAirline([code]);
    this.toast.show(`Filtered by airline: ${code}`);
  }
}
