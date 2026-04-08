import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api.client';
import { FilterStore } from '../../../core/store/filter.store';

@Injectable({ providedIn: 'root' })
export class PrmDataService {
  private api = inject(ApiClient);
  private filters = inject(FilterStore);

  private params(extra: Record<string, string | number | null | undefined> = {}): Record<string, string | undefined> {
    const base = this.filters.queryParams();
    const result: Record<string, string | undefined> = { ...base };
    for (const [key, value] of Object.entries(extra)) {
      result[key] = value != null ? String(value) : undefined;
    }
    return result;
  }

  // KPIs
  kpisSummary()              { return this.api.get<any>('/prm/kpis/summary', this.params()); }
  handlingDistribution()     { return this.api.get<any>('/prm/kpis/handling-distribution', this.params()); }
  requestedVsProvided()      { return this.api.get<any>('/prm/kpis/requested-vs-provided', this.params()); }

  // Trends
  trendsDaily(metric: 'count' | 'duration' | 'agents' = 'count') {
    return this.api.get<any>('/prm/trends/daily', this.params({ metric }));
  }
  trendsMonthly()            { return this.api.get<any>('/prm/trends/monthly', this.params()); }
  trendsHourly()             { return this.api.get<any>('/prm/trends/hourly', this.params()); }
  trendsRequestedProvided()  { return this.api.get<any>('/prm/trends/requested-vs-provided', this.params()); }

  // Rankings
  topAirlines(limit = 10)    { return this.api.get<any>('/prm/rankings/airlines', this.params({ limit })); }
  topFlights(limit = 10)     { return this.api.get<any>('/prm/rankings/flights', this.params({ limit })); }
  topAgents(limit = 10)      { return this.api.get<any>('/prm/rankings/agents', this.params({ limit })); }
  topServices()              { return this.api.get<any>('/prm/rankings/services', this.params()); }

  // Breakdowns
  byServiceType()            { return this.api.get<any>('/prm/breakdowns/by-service-type', this.params()); }
  byAgentType()              { return this.api.get<any>('/prm/breakdowns/by-agent-type', this.params()); }
  byAirline()                { return this.api.get<any>('/prm/breakdowns/by-airline', this.params()); }
  byLocation()               { return this.api.get<any>('/prm/breakdowns/by-location', this.params()); }
  byRoute()                  { return this.api.get<any>('/prm/breakdowns/by-route', this.params()); }

  // Performance
  durationStats()            { return this.api.get<any>('/prm/performance/duration-stats', this.params()); }
  durationDistribution()     { return this.api.get<any>('/prm/performance/duration-distribution', this.params()); }
  noShows()                  { return this.api.get<any>('/prm/performance/no-shows', this.params()); }
  pauseAnalysis()            { return this.api.get<any>('/prm/performance/pause-analysis', this.params()); }

  // Filters & records
  filterOptions(): Observable<any> {
    return this.api.get<any>('/prm/filters/options', { airport: this.filters.airport() });
  }
  records(page: number, size: number) {
    return this.api.get<any>('/prm/records', this.params({ page, size }));
  }
}
