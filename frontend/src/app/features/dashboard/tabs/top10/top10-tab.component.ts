import { Component, OnInit, OnDestroy } from '@angular/core';
import { BehaviorSubject, EMPTY, forkJoin, Subject } from 'rxjs';
import { debounceTime, switchMap, takeUntil } from 'rxjs/operators';
import { FilterStore } from 'src/app/core/store/filter.store';
import { PrmDataService } from '../../services/prm-data.service';
import { AgentRankingItem } from '../../services/prm-dtos';
import { BarDatum } from 'src/app/shared/charts/horizontal-bar-chart/horizontal-bar-chart.component';

@Component({
  selector: 'app-top10-tab',
  templateUrl: './top10-tab.component.html',
  styleUrls: ['./top10-tab.component.scss'],
})
export class Top10TabComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading$ = new BehaviorSubject<boolean>(false);

  topAirlines$ = new BehaviorSubject<BarDatum[]>([]);
  topFlightsServiced$ = new BehaviorSubject<BarDatum[]>([]);
  topFlightsGap$ = new BehaviorSubject<BarDatum[]>([]);
  topAgents$ = new BehaviorSubject<AgentRankingItem[]>([]);

  constructor(
    public filters: FilterStore,
    private data: PrmDataService,
  ) {}

  ngOnInit(): void {
    this.filters.queryParams$.pipe(
      debounceTime(50),
      switchMap(() => {
        if (this.filters.airportSnapshot.length === 0 || !this.filters.dateFromSnapshot) {
          return EMPTY;
        }
        this.loading$.next(true);
        return forkJoin({
          airlines: this.data.topAirlines(10),
          flights:  this.data.topFlights(10),
          agents:   this.data.topAgents(10),
        });
      }),
      takeUntil(this.destroy$),
    ).subscribe(
      r => {
        this.topAirlines$.next((r.airlines.items || []).map(a => ({ label: a.label, value: a.count })));

        const flights = r.flights.items || [];
        this.topFlightsServiced$.next(flights.map(f => ({ label: f.label, value: f.servicedCount })));
        this.topFlightsGap$.next(flights.map(f => ({
          label: f.label,
          value: Math.max(0, f.requestedCount - f.servicedCount),
        })));

        this.topAgents$.next(r.agents.items || []);
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

  onAirlineBarClick(payload: { category: string; value: number }): void {
    if (payload && payload.category) { this.filters.toggleAirline(payload.category); }
  }

  onFlightBarClick(payload: { category: string; value: number }): void {
    if (payload && payload.category) { this.filters.toggleFlight(payload.category); }
  }

  onAgentRowClick(agent: AgentRankingItem): void {
    if (agent && agent.agentNo) { this.filters.toggleAgentNo(agent.agentNo); }
  }
}
