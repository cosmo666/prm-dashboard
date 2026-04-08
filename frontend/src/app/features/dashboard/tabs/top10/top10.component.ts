import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, forkJoin, switchMap } from 'rxjs';
import { BarChartComponent, BarDatum } from '../../../../shared/charts/bar-chart/bar-chart.component';
import { HorizontalBarChartComponent } from '../../../../shared/charts/horizontal-bar-chart/horizontal-bar-chart.component';
import { PrmDataService } from '../../services/prm-data.service';
import { FilterStore } from '../../../../core/store/filter.store';

export interface AgentRow {
  rank: number;
  agentNo: string;
  name: string;
  count: number;
  avgDuration: number;
  topService: string;
  topAirline: string;
  daysActive: number;
}

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
  imports: [CommonModule, BarChartComponent, HorizontalBarChartComponent],
  templateUrl: './top10.component.html',
  styleUrl: './top10.component.scss',
})
export class Top10Component {
  private data = inject(PrmDataService);
  filters = inject(FilterStore);

  loading = signal(true);
  topAirlines = signal<BarDatum[]>([]);
  topFlights = signal<BarDatum[]>([]);
  topAgents = signal<AgentRow[]>([]);
  topRoutes = signal<BarDatum[]>([]);
  noShows = signal<BarDatum[]>([]);

  // Empty placeholder rows for skeleton state
  skeletonAgents = Array.from({ length: 8 }, (_, i) => i);

  constructor() {
    toObservable(this.filters.queryParams).pipe(
      switchMap(() => {
        if (!this.filters.airport() || !this.filters.dateFrom()) {
          return EMPTY;
        }
        this.loading.set(true);
        return forkJoin({
          airlines: this.data.topAirlines(10),
          flights: this.data.topFlights(10),
          agents: this.data.topAgents(10),
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
          return { label: f.label, value: f.count, color: CARRIER_COLORS[airline] ?? '#475569' };
        }));
        this.topAgents.set((r.agents.items ?? []).slice(0, 10).map((a: any, i: number) => ({
          rank: a.rank ?? i + 1,
          agentNo: a.agentNo ?? '',
          name: a.agentName ?? '',
          count: a.prmCount ?? 0,
          avgDuration: a.avgDurationMinutes ?? 0,
          topService: a.topService ?? '—',
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
}
