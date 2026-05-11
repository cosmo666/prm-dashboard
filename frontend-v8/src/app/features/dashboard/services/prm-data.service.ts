import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { ApiClient } from 'src/app/core/api/api.client';
import { FilterStore } from 'src/app/core/store/filter.store';
import {
  KpiSummaryResponse,
  DailyTrendResponse,
  HourlyHeatmapResponse,
  RankingsResponse,
  FilterOptionsResponse,
  FlightRankingsResponse,
  AgentRankingsResponse,
  SankeyResponse,
  ServiceTypeMatrixResponse,
  RouteBreakdownResponse,
  HandlingDistributionResponse,
  DurationDistributionResponse,
  NoShowsResponse,
  BreakdownResponse,
  RequestedVsProvidedKpiResponse,
  RequestedVsProvidedTrendResponse,
  MonthlyTrendResponse,
  PauseAnalysisResponse,
  DurationByAgentTypeResponse,
  AgentServiceMatrixResponse,
} from './prm-dtos';

/**
 * Phase 1: wraps the 5 endpoints needed for the Overview tab. Adds a sixth
 * call (`trendsDailyPrev`) for the period-over-period overlay on the trend
 * line chart — see OQ-P1-3 in the spec.
 *
 * NOT @Injectable({ providedIn: 'root' }) — provided by DashboardModule
 * so the service lives in the lazy injector. See spec §4 P1-Q8.
 */
@Injectable()
export class PrmDataService {
  constructor(
    private api: ApiClient,
    private filters: FilterStore,
  ) {}

  /** Build the query-params dict from FilterStore + optional extras. */
  private params(extra: { [key: string]: string | number | null | undefined } = {}): { [key: string]: string } {
    const base: { [key: string]: string } = {
      ...(this.filters.airportSnapshot.length > 0 ? { airport: this.filters.airportSnapshot.join(',') } : {}),
      ...(this.filters.dateFromSnapshot ? { date_from: this.filters.dateFromSnapshot } : {}),
      ...(this.filters.dateToSnapshot ? { date_to: this.filters.dateToSnapshot } : {}),
      ...(this.filters.airlineSnapshot.length > 0 ? { airline: this.filters.airlineSnapshot.join(',') } : {}),
      ...(this.filters.serviceSnapshot.length > 0 ? { service: this.filters.serviceSnapshot.join(',') } : {}),
      ...(this.filters.handledBySnapshot.length > 0 ? { handled_by: this.filters.handledBySnapshot.join(',') } : {}),
    };
    for (const key of Object.keys(extra)) {
      const v = extra[key];
      if (v !== null && v !== undefined) {
        base[key] = String(v);
      }
    }
    return base;
  }

  kpisSummary(): Observable<KpiSummaryResponse> {
    return this.api.get<KpiSummaryResponse>('/prm/kpis/summary', this.params());
  }

  trendsDaily(metric: 'count' | 'duration' | 'agents' = 'count'): Observable<DailyTrendResponse> {
    return this.api.get<DailyTrendResponse>('/prm/trends/daily', this.params({ metric }));
  }

  /**
   * Period-over-period overlay (OQ-P1-3). Backend has no `prev=true` flag on
   * /prm/trends/daily — we shift the date_from/date_to to the previous comparable
   * period and re-issue. Mirrors the backend's `BaseQueryService.GetPrevPeriodStart`
   * convention: prev_end = from - 1 day; prev_from = prev_end - (to - from).
   * Returns null-equivalent (empty `values`) when from/to aren't both set.
   */
  trendsDailyPrev(metric: 'count' | 'duration' | 'agents' = 'count'): Observable<DailyTrendResponse> {
    const fromIso = this.filters.dateFromSnapshot;
    const toIso = this.filters.dateToSnapshot;
    if (!fromIso || !toIso) {
      return of({ dates: [], values: [], average: 0 } as DailyTrendResponse);
    }
    const from = new Date(fromIso);
    const to = new Date(toIso);
    const spanMs = to.getTime() - from.getTime();
    const prevEnd = new Date(from.getTime() - 86400000);
    const prevFrom = new Date(prevEnd.getTime() - spanMs);
    const iso = (d: Date): string => d.toISOString().slice(0, 10);
    const params = this.params({ metric });
    params.date_from = iso(prevFrom);
    params.date_to   = iso(prevEnd);
    return this.api.get<DailyTrendResponse>('/prm/trends/daily', params);
  }

  trendsHourly(): Observable<HourlyHeatmapResponse> {
    return this.api.get<HourlyHeatmapResponse>('/prm/trends/hourly', this.params());
  }

  topAirlines(limit: number = 10): Observable<RankingsResponse> {
    return this.api.get<RankingsResponse>('/prm/rankings/airlines', this.params({ limit }));
  }

  topServices(): Observable<RankingsResponse> {
    return this.api.get<RankingsResponse>('/prm/rankings/services', this.params());
  }

  topFlights(limit: number = 10): Observable<FlightRankingsResponse> {
    return this.api.get<FlightRankingsResponse>('/prm/rankings/flights', this.params({ limit }));
  }

  topAgents(limit: number = 10): Observable<AgentRankingsResponse> {
    return this.api.get<AgentRankingsResponse>('/prm/rankings/agents', this.params({ limit }));
  }

  serviceBreakupSankey(): Observable<SankeyResponse> {
    return this.api.get<SankeyResponse>('/prm/breakdowns/by-agent-type', this.params());
  }

  serviceTypeMatrix(): Observable<ServiceTypeMatrixResponse> {
    return this.api.get<ServiceTypeMatrixResponse>('/prm/breakdowns/by-service-type', this.params());
  }

  topRoutes(limit: number = 10): Observable<RouteBreakdownResponse> {
    return this.api.get<RouteBreakdownResponse>('/prm/breakdowns/by-route', this.params({ limit }));
  }

  // ── Phase A foundation: 5 endpoints for Overview row 2-3 + Top10 row 3 ──

  handlingDistribution(): Observable<HandlingDistributionResponse> {
    return this.api.get<HandlingDistributionResponse>('/prm/kpis/handling-distribution', this.params());
  }

  durationDistribution(): Observable<DurationDistributionResponse> {
    return this.api.get<DurationDistributionResponse>('/prm/performance/duration-distribution', this.params());
  }

  byLocation(): Observable<BreakdownResponse> {
    return this.api.get<BreakdownResponse>('/prm/breakdowns/by-location', this.params());
  }

  noShows(): Observable<NoShowsResponse> {
    return this.api.get<NoShowsResponse>('/prm/performance/no-shows', this.params());
  }

  byRoute(): Observable<RouteBreakdownResponse> {
    return this.api.get<RouteBreakdownResponse>('/prm/breakdowns/by-route', this.params());
  }

  // ── Phase B/C foundation: 6 endpoints for Fulfillment + Insights tabs ──

  requestedVsProvided(): Observable<RequestedVsProvidedKpiResponse> {
    return this.api.get<RequestedVsProvidedKpiResponse>('/prm/kpis/requested-vs-provided', this.params());
  }

  trendsRequestedProvided(): Observable<RequestedVsProvidedTrendResponse> {
    return this.api.get<RequestedVsProvidedTrendResponse>('/prm/trends/requested-vs-provided', this.params());
  }

  trendsMonthly(): Observable<MonthlyTrendResponse> {
    return this.api.get<MonthlyTrendResponse>('/prm/trends/monthly', this.params());
  }

  pauseAnalysis(): Observable<PauseAnalysisResponse> {
    return this.api.get<PauseAnalysisResponse>('/prm/performance/pause-analysis', this.params());
  }

  durationByAgentType(): Observable<DurationByAgentTypeResponse> {
    return this.api.get<DurationByAgentTypeResponse>('/prm/performance/duration-by-agent-type', this.params());
  }

  agentServiceMatrix(limit: number = 10): Observable<AgentServiceMatrixResponse> {
    return this.api.get<AgentServiceMatrixResponse>('/prm/breakdowns/agent-service-matrix', this.params({ limit }));
  }

  /**
   * /prm/filters/options requires a non-empty `?airport=...`. The selector
   * invariant prevents the user from de-selecting the last airport, but
   * programmatic resets / first-render-before-airports-loaded can hit the
   * empty path — short-circuit to an empty options shape rather than 400.
   */
  filterOptions(): Observable<FilterOptionsResponse> {
    const codes = this.filters.airportSnapshot;
    if (codes.length === 0) {
      return of({
        airlines: [], services: [], handledBy: [], flights: [],
        minDate: null, maxDate: null,
      } as FilterOptionsResponse);
    }
    return this.api.get<FilterOptionsResponse>('/prm/filters/options', {
      airport: codes.join(','),
    });
  }
}
