// TypeScript interfaces mirroring backend DTOs in PrmDashboard.Shared/DTOs.
// ASP.NET Core serializes C# PascalCase records to camelCase JSON by default.

// ---------- KPIs ----------
export interface KpiSummaryResponse {
  totalPrm: number;
  totalPrmPrevPeriod: number;
  totalAgents: number;
  agentsSelf: number;
  agentsOutsourced: number;
  avgServicesPerAgentPerDay: number;
  avgServicesPrevPeriod: number;
  avgDurationMinutes: number;
  avgDurationPrevPeriod: number;
  fulfillmentPct: number;
}

export interface HandlingDistributionResponse {
  labels: string[];
  values: number[];
}

export interface RequestedVsProvidedKpiResponse {
  totalRequested: number;
  totalProvided: number;
  providedAgainstRequested: number;
  fulfillmentRate: number;
  walkUpRate: number;
}

// ---------- Trends ----------
export interface DailyTrendResponse {
  dates: string[];
  values: number[];
  average: number;
}

export interface MonthlyTrendResponse {
  months: string[];
  values: number[];
}

export interface HourlyHeatmapResponse {
  days: string[];
  hours: number[];
  values: number[][];
}

export interface RequestedVsProvidedTrendResponse {
  dates: string[];
  provided: number[];
  requested: number[];
}

// ---------- Rankings ----------
export interface RankingItem {
  label: string;
  count: number;
  percentage: number;
}

export interface AgentRankingItem {
  rank: number;
  agentNo: string;
  agentName: string;
  prmCount: number;
  avgDurationMinutes: number;
  topService: string;
  topAirline: string;
  daysActive: number;
}

export interface RankingsResponse {
  items: RankingItem[];
}

export interface AgentRankingsResponse {
  items: AgentRankingItem[];
}

// ---------- Breakdowns ----------
export interface ServiceTypeMatrixRow {
  monthYear: string;
  serviceCounts: Record<string, number>;
  total: number;
}

export interface ServiceTypeMatrixResponse {
  serviceTypes: string[];
  rows: ServiceTypeMatrixRow[];
}

export interface SankeyNodeDto {
  name: string;
  value: number;
}

export interface SankeyLinkDto {
  source: string;
  target: string;
  value: number;
}

export interface SankeyResponse {
  nodes: SankeyNodeDto[];
  links: SankeyLinkDto[];
}

export interface BreakdownItem {
  label: string;
  count: number;
  percentage: number;
}

export interface BreakdownResponse {
  items: BreakdownItem[];
}

export interface RouteItem {
  departure: string;
  arrival: string;
  count: number;
  percentage: number;
}

export interface RouteBreakdownResponse {
  items: RouteItem[];
}

// ---------- Performance ----------
export interface DurationStatsResponse {
  min: number;
  max: number;
  avg: number;
  median: number;
  p90: number;
  p95: number;
}

export interface DurationBucket {
  label: string;
  count: number;
  percentage: number;
}

export interface DurationDistributionResponse {
  buckets: DurationBucket[];
  p50: number;
  p90: number;
  avg: number;
}

export interface NoShowItem {
  airline: string;
  total: number;
  noShows: number;
  rate: number;
}

export interface NoShowResponse {
  items: NoShowItem[];
}

export interface PauseAnalysisResponse {
  totalPaused: number;
  pauseRate: number;
  avgPauseDurationMinutes: number;
  byServiceType: BreakdownItem[];
}

// ---------- Records ----------
export interface PrmRecordDto {
  rowId: number;
  id: number;
  flight: string;
  agentName: string | null;
  passengerName: string;
  prmAgentType: string;
  startTime: number;
  pausedAt: number | null;
  endTime: number;
  service: string;
  seatNumber: string | null;
  posLocation: string | null;
  noShowFlag: string | null;
  locName: string;
  arrival: string | null;
  airline: string;
  departure: string | null;
  requested: number;
  serviceDate: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PrmSegmentDto {
  rowId: number;
  startTime: number;
  pausedAt: number | null;
  endTime: number;
  activeMinutes: number;
}

export interface FilterOptionsResponse {
  airlines: string[];
  services: string[];
  handledBy: string[];
  flights: string[];
  minDate: string | null;
  maxDate: string | null;
}
