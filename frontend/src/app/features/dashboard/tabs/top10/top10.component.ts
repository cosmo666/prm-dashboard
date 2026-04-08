import { Component, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
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

const CARRIER_COLORS: Record<string, string> = {
  AI: '#ef5350', '6E': '#42a5f5', UK: '#ab47bc',
  EK: '#ffa726', QR: '#26a69a', SQ: '#66bb6a',
  LH: '#5c6bc0', BA: '#78909c', CX: '#ff7043', TG: '#d4e157',
};

@Component({
  selector: 'app-top10',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatIconModule, BarChartComponent, HorizontalBarChartComponent],
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

  displayedColumns = ['rank', 'agentNo', 'name', 'count', 'avgDuration', 'topService', 'topAirline', 'daysActive'];

  constructor() {
    effect(() => { this.filters.queryParams(); this.fetchAll(); }, { allowSignalWrites: true });
  }

  fetchAll() {
    if (!this.filters.airport() || !this.filters.dateFrom()) return;
    this.loading.set(true);
    forkJoin({
      airlines: this.data.topAirlines(10),
      flights: this.data.topFlights(10),
      agents: this.data.topAgents(10),
      routes: this.data.byRoute(),
      noShows: this.data.noShows(),
    }).subscribe({
      next: (r: any) => {
        // RankingsResponse.items → BarDatum (label, count)
        this.topAirlines.set((r.airlines.items ?? []).map((a: any) => ({
          label: a.label, value: a.count, color: CARRIER_COLORS[a.label] ?? '#78909c',
        })));
        this.topFlights.set((r.flights.items ?? []).map((f: any) => {
          const airline = f.label?.substring(0, 2) ?? '';
          return { label: f.label, value: f.count, color: CARRIER_COLORS[airline] ?? '#78909c' };
        }));
        // AgentRankingsResponse.items
        this.topAgents.set((r.agents.items ?? []).slice(0, 10).map((a: any, i: number) => ({
          rank: a.rank ?? i + 1,
          agentNo: a.agentNo ?? '',
          name: a.agentName ?? '',
          count: a.prmCount ?? 0,
          avgDuration: a.avgDurationMinutes ?? 0,
          topService: a.topService ?? '-',
          topAirline: a.topAirline ?? '-',
          daysActive: a.daysActive ?? 0,
        })));
        // RouteBreakdownResponse.items
        this.topRoutes.set((r.routes.items ?? []).slice(0, 10).map((route: any) => ({
          label: `${route.departure} -> ${route.arrival}`, value: route.count,
        })));
        // NoShowResponse.items
        this.noShows.set((r.noShows.items ?? []).map((ns: any) => ({
          label: ns.airline,
          value: ns.rate,
          color: ns.rate > 5 ? '#ef5350' : ns.rate >= 3 ? '#fb8c00' : '#66bb6a',
        })));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  rankMedal(rank: number): string {
    if (rank === 1) return '\u{1F947}';
    if (rank === 2) return '\u{1F948}';
    if (rank === 3) return '\u{1F949}';
    return String(rank);
  }

  durationColor(minutes: number): string {
    if (minutes < 20) return '#66bb6a';
    if (minutes < 40) return '#fb8c00';
    return '#ef5350';
  }
}
