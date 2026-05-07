import { Component, OnInit, OnDestroy } from '@angular/core';
import { BehaviorSubject, EMPTY, forkJoin, Subject, combineLatest } from 'rxjs';
import { debounceTime, switchMap, takeUntil } from 'rxjs/operators';
import { FilterStore } from 'src/app/core/store/filter.store';
import { PrmDataService } from '../../services/prm-data.service';
import { BarDatum } from 'src/app/shared/charts/bar-chart/bar-chart.component';

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

// Muted, operational carrier colors — not vivid. Mirrors main's CARRIER_COLORS.
const CARRIER_COLORS: { [code: string]: string } = {
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

const TOP_X_OPTIONS: number[] = [5, 10, 15, 20];

@Component({
  selector: 'app-top10-tab',
  templateUrl: './top10-tab.component.html',
  styleUrls: ['./top10-tab.component.scss'],
})
export class Top10TabComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  readonly topXOptions = TOP_X_OPTIONS;
  readonly skeletonAgents: number[] = [0, 1, 2, 3, 4, 5, 6, 7];

  loading$ = new BehaviorSubject<boolean>(true);
  topX$ = new BehaviorSubject<number>(10);

  topAirlines$ = new BehaviorSubject<BarDatum[]>([]);
  topFlights$ = new BehaviorSubject<BarDatum[]>([]);
  topFlightsRequested$ = new BehaviorSubject<BarDatum[]>([]);
  topAgents$ = new BehaviorSubject<AgentRow[]>([]);
  topRoutes$ = new BehaviorSubject<BarDatum[]>([]);
  noShows$ = new BehaviorSubject<BarDatum[]>([]);

  constructor(
    public filters: FilterStore,
    private data: PrmDataService,
  ) {}

  ngOnInit(): void {
    combineLatest([this.filters.queryParams$, this.topX$]).pipe(
      debounceTime(50),
      switchMap(args => {
        const limit: number = args[1];
        if (this.filters.airportSnapshot.length === 0 || !this.filters.dateFromSnapshot) {
          return EMPTY;
        }
        this.loading$.next(true);
        return forkJoin({
          airlines: this.data.topAirlines(limit),
          flights: this.data.topFlights(limit),
          agents: this.data.topAgents(limit),
          routes: this.data.byRoute(),
          noShows: this.data.noShows(),
        });
      }),
      takeUntil(this.destroy$),
    ).subscribe(
      r => {
        this.topAirlines$.next((r.airlines.items || []).map(a => ({
          label: a.label,
          value: a.count,
          color: CARRIER_COLORS[a.label] || '#475569',
        })));

        const flights = r.flights.items || [];
        this.topFlights$.next(flights.map(f => {
          const airline = (f.label || '').substring(0, 2);
          return {
            label: f.label,
            value: f.servicedCount || 0,
            color: CARRIER_COLORS[airline] || '#475569',
          };
        }));
        this.topFlightsRequested$.next(flights.map(f => ({
          label: f.label,
          value: f.requestedCount || 0,
        })));

        this.topAgents$.next((r.agents.items || []).map((a, i) => ({
          rank: a.rank || (i + 1),
          agentNo: a.agentNo || '',
          name: a.agentName || '',
          count: a.prmCount || 0,
          avgDuration: a.avgDurationMinutes || 0,
          avgPerDay: a.avgPerDay || 0,
          topService: a.topService || '—',
          topServiceCount: a.topServiceCount || 0,
          topAirline: a.topAirline || '—',
          daysActive: a.daysActive || 0,
        })));

        this.topRoutes$.next((r.routes.items || []).slice(0, 10).map(rt => ({
          label: rt.departure + ' → ' + rt.arrival,
          value: rt.count,
        })));

        this.noShows$.next((r.noShows.items || []).map(ns => ({
          label: ns.airline,
          value: ns.rate,
          color: ns.rate > 5 ? '#b91c1c' : ns.rate >= 3 ? '#b45309' : '#047857',
        })));

        this.loading$.next(false);
      },
      err => {
        console.error('[top10] forkJoin failed', err);
        this.loading$.next(false);
      },
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setTopX(n: number): void {
    if (this.topX$.value !== n) { this.topX$.next(n); }
  }

  rankClass(rank: number): string {
    if (rank === 1) { return 'rank--gold'; }
    if (rank === 2) { return 'rank--silver'; }
    if (rank === 3) { return 'rank--bronze'; }
    return '';
  }

  durationClass(minutes: number): string {
    if (minutes < 20) { return 'duration--fast'; }
    if (minutes < 40) { return 'duration--mid'; }
    return 'duration--slow';
  }

  /** "1" → "01", "10" → "10". TS 3.4 has no String.padStart. */
  formatRank(rank: number): string {
    return ('00' + rank).slice(-2);
  }

  /** Editorial cadence label based on active-day count within the period. */
  daysLabel(days: number): string {
    if (days >= 20) { return 'daily'; }
    if (days >= 10) { return 'frequent'; }
    if (days >= 5)  { return 'regular'; }
    if (days >= 1)  { return 'occasional'; }
    return 'inactive';
  }

  onAirlineClick(payload: { category: string; value: number }): void {
    if (payload && payload.category) { this.filters.setAirline([payload.category]); }
  }

  onFlightClick(payload: { category: string; value: number }): void {
    if (payload && payload.category) { this.filters.setFlight(payload.category); }
  }

  // tslint:disable-next-line: no-empty
  onRouteClick(_payload: { category: string; value: number }): void { }

  onNoShowAirlineClick(payload: { category: string; value: number }): void {
    if (payload && payload.category) { this.filters.setAirline([payload.category]); }
  }

  onAgentRowClick(agent: AgentRow): void {
    if (agent && agent.agentNo) { this.filters.toggleAgentNo(agent.agentNo); }
  }
}
