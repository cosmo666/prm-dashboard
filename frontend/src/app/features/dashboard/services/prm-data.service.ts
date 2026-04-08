import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api.client';
import { FilterStore } from '../../../core/store/filter.store';
import {
  KpiSummaryResponse,
  HandlingDistributionResponse,
  RequestedVsProvidedKpiResponse,
  DailyTrendResponse,
  MonthlyTrendResponse,
  HourlyHeatmapResponse,
  RequestedVsProvidedTrendResponse,
  RankingsResponse,
  AgentRankingsResponse,
  ServiceTypeMatrixResponse,
  SankeyResponse,
  BreakdownResponse,
  RouteBreakdownResponse,
  DurationStatsResponse,
  DurationDistributionResponse,
  NoShowResponse,
  PauseAnalysisResponse,
  PaginatedResponse,
  PrmRecordDto,
  FilterOptionsResponse,
} from './prm-dtos';

@Injectable({ providedIn: 'root' })
export class PrmDataService {
  private api = inject(ApiClient);
  private filters = inject(FilterStore);

  private params(extra: Record<string, string | number | null | undefined> = {}): Record<string, string | undefined> {
    const base = this.filters.queryParams();
    const result: Record<string, string | undefined> = { ...base };
    // compare=1 is a UI-only flag for URL sync — never sent to backend
    delete result['compare'];
    for (const [key, value] of Object.entries(extra)) {
      result[key] = value != null ? String(value) : undefined;
    }
    return result;
  }

  // KPIs
  kpisSummary(): Observable<KpiSummaryResponse> {
    return this.api.get<KpiSummaryResponse>('/prm/kpis/summary', this.params());
  }
  handlingDistribution(): Observable<HandlingDistributionResponse> {
    return this.api.get<HandlingDistributionResponse>('/prm/kpis/handling-distribution', this.params());
  }
  requestedVsProvided(): Observable<RequestedVsProvidedKpiResponse> {
    return this.api.get<RequestedVsProvidedKpiResponse>('/prm/kpis/requested-vs-provided', this.params());
  }

  // Trends
  trendsDaily(metric: 'count' | 'duration' | 'agents' = 'count'): Observable<DailyTrendResponse> {
    return this.api.get<DailyTrendResponse>('/prm/trends/daily', this.params({ metric }));
  }
  trendsDailyRange(from: string, to: string, metric: 'count' | 'duration' | 'agents' = 'count'): Observable<DailyTrendResponse> {
    return this.api.get<DailyTrendResponse>(
      '/prm/trends/daily',
      this.params({ metric, date_from: from, date_to: to }),
    );
  }
  trendsMonthly(): Observable<MonthlyTrendResponse> {
    return this.api.get<MonthlyTrendResponse>('/prm/trends/monthly', this.params());
  }
  trendsHourly(): Observable<HourlyHeatmapResponse> {
    return this.api.get<HourlyHeatmapResponse>('/prm/trends/hourly', this.params());
  }
  trendsRequestedProvided(): Observable<RequestedVsProvidedTrendResponse> {
    return this.api.get<RequestedVsProvidedTrendResponse>('/prm/trends/requested-vs-provided', this.params());
  }

  // Rankings
  topAirlines(limit = 10): Observable<RankingsResponse> {
    return this.api.get<RankingsResponse>('/prm/rankings/airlines', this.params({ limit }));
  }
  topFlights(limit = 10): Observable<RankingsResponse> {
    return this.api.get<RankingsResponse>('/prm/rankings/flights', this.params({ limit }));
  }
  topAgents(limit = 10): Observable<AgentRankingsResponse> {
    return this.api.get<AgentRankingsResponse>('/prm/rankings/agents', this.params({ limit }));
  }
  topServices(): Observable<RankingsResponse> {
    return this.api.get<RankingsResponse>('/prm/rankings/services', this.params());
  }

  // Breakdowns
  byServiceType(): Observable<ServiceTypeMatrixResponse> {
    return this.api.get<ServiceTypeMatrixResponse>('/prm/breakdowns/by-service-type', this.params());
  }
  byAgentType(): Observable<SankeyResponse> {
    return this.api.get<SankeyResponse>('/prm/breakdowns/by-agent-type', this.params());
  }
  byAirline(): Observable<BreakdownResponse> {
    return this.api.get<BreakdownResponse>('/prm/breakdowns/by-airline', this.params());
  }
  byLocation(): Observable<BreakdownResponse> {
    return this.api.get<BreakdownResponse>('/prm/breakdowns/by-location', this.params());
  }
  byRoute(): Observable<RouteBreakdownResponse> {
    return this.api.get<RouteBreakdownResponse>('/prm/breakdowns/by-route', this.params());
  }

  // Performance
  durationStats(): Observable<DurationStatsResponse> {
    return this.api.get<DurationStatsResponse>('/prm/performance/duration-stats', this.params());
  }
  durationDistribution(): Observable<DurationDistributionResponse> {
    return this.api.get<DurationDistributionResponse>('/prm/performance/duration-distribution', this.params());
  }
  noShows(): Observable<NoShowResponse> {
    return this.api.get<NoShowResponse>('/prm/performance/no-shows', this.params());
  }
  pauseAnalysis(): Observable<PauseAnalysisResponse> {
    return this.api.get<PauseAnalysisResponse>('/prm/performance/pause-analysis', this.params());
  }

  // Filters & records
  filterOptions(): Observable<FilterOptionsResponse> {
    return this.api.get<FilterOptionsResponse>('/prm/filters/options', { airport: this.filters.airport() });
  }
  records(page: number, size: number): Observable<PaginatedResponse<PrmRecordDto>> {
    return this.api.get<PaginatedResponse<PrmRecordDto>>('/prm/records', this.params({ page, size }));
  }
}
