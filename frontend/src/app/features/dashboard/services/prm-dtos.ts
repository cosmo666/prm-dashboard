// ---------- KPIs ----------
// Source: backend/src/PrmDashboard.Shared/DTOs/KpiDtos.cs
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

// ---------- Trends ----------
// Source: backend/src/PrmDashboard.Shared/DTOs/TrendDtos.cs
export interface DailyTrendResponse {
  dates: string[];   // yyyy-mm-dd
  values: number[];  // service count per day
  average: number;
}

// Source: backend/src/PrmDashboard.Shared/DTOs/TrendDtos.cs (HourlyHeatmapResponse)
// 7 days × 24 hours grid; values[day][hour] = service count.
export interface HourlyHeatmapResponse {
  days: string[];      // 7 entries: ['Mon','Tue',...,'Sun']
  hours: number[];     // 24 entries: 0..23
  values: number[][];  // values[day][hour] = service count
}

// ---------- Rankings ----------
// Source: backend/src/PrmDashboard.Shared/DTOs/RankingDtos.cs
export interface RankingItem {
  label: string;
  count: number;
  percentage: number;
}
export interface RankingsResponse {
  items: RankingItem[];
}

// ---------- Breakdowns ----------
// Source: backend/src/PrmDashboard.Shared/DTOs/BreakdownDtos.cs
export interface BreakdownItem {
  label: string;
  count: number;
  percentage: number;
}
export interface BreakdownResponse {
  items: BreakdownItem[];
}

// ---------- Filter options ----------
// Source: backend/src/PrmDashboard.Shared/DTOs/RecordDtos.cs
// (Note: spec said BreakdownDtos.cs but the C# record actually lives in RecordDtos.cs.)
// `minDate` / `maxDate` are C# DateOnly? — serialised as "yyyy-mm-dd" strings or null.
export interface FilterOptionsResponse {
  airlines: string[];
  services: string[];
  handledBy: string[];
  flights: string[];
  minDate: string | null;  // yyyy-mm-dd
  maxDate: string | null;
}

// ---------- Flight rankings (Top 10) ----------
// Source: backend/src/PrmDashboard.Shared/DTOs/RankingDtos.cs
export interface FlightRankingItem {
  label: string;
  servicedCount: number;
  requestedCount: number;
  percentage: number;
}
export interface FlightRankingsResponse { items: FlightRankingItem[]; }

// ---------- Agent rankings (Top 10) ----------
// Source: backend/src/PrmDashboard.Shared/DTOs/RankingDtos.cs
export interface AgentRankingItem {
  rank: number;
  agentNo: string;
  agentName: string;
  prmCount: number;
  avgDurationMinutes: number;
  topService: string;
  topServiceCount: number;
  topAirline: string;
  daysActive: number;
  avgPerDay: number;
}
export interface AgentRankingsResponse { items: AgentRankingItem[]; }

// ---------- Sankey (Service Breakup tab) ----------
// Source: backend/src/PrmDashboard.Shared/DTOs/BreakdownDtos.cs
export interface SankeyNode { name: string; value: number; }
export interface SankeyLink { source: string; target: string; value: number; }
export interface SankeyResponse { nodes: SankeyNode[]; links: SankeyLink[]; }

// ---------- Service-type matrix (months × service-type) ----------
// Source: backend/src/PrmDashboard.Shared/DTOs/BreakdownDtos.cs
export interface ServiceTypeMatrixRow {
  monthYear: string;
  serviceCounts: { [service: string]: number };
  total: number;
}
export interface ServiceTypeMatrixResponse {
  serviceTypes: string[];
  rows: ServiceTypeMatrixRow[];
}

// ---------- Route breakdown (Top routes) ----------
// Source: backend/src/PrmDashboard.Shared/DTOs/BreakdownDtos.cs
export interface RouteItem {
  departure: string;
  arrival: string;
  count: number;
  percentage: number;
}
export interface RouteBreakdownResponse { items: RouteItem[]; }

// ---------- Handling distribution (self vs outsourced) ----------
// Source: backend/src/PrmDashboard.Shared/DTOs/KpiDtos.cs
//   public record HandlingDistributionResponse(List<string> Labels, List<int> Values);
export interface HandlingDistributionResponse {
  labels: string[];
  values: number[];
}

// ---------- Duration distribution buckets ----------
// Source: backend/src/PrmDashboard.Shared/DTOs/PerformanceDtos.cs
//   public record DurationBucket(string Label, int Count, double Percentage);
//   public record DurationDistributionResponse(List<DurationBucket> Buckets,
//                                              double P50, double P90, double Avg);
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

// ---------- No-shows by airline ----------
// Source: backend/src/PrmDashboard.Shared/DTOs/PerformanceDtos.cs
//   public record NoShowItem(string Airline, int Total, int NoShows, double Rate);
//   public record NoShowResponse(List<NoShowItem> Items);
// (Frontend interface name pluralised to NoShowsResponse for parity with the
//  /no-shows endpoint name; wire shape mirrors the C# record exactly.)
export interface NoShowItem {
  airline: string;
  total: number;
  noShows: number;
  rate: number;
}
export interface NoShowsResponse { items: NoShowItem[]; }

// ---------- Requested-vs-Provided KPI (Fulfillment) ----------
// Source: backend/src/PrmDashboard.Shared/DTOs/KpiDtos.cs
//   public record RequestedVsProvidedKpiResponse(
//       int TotalRequested, int TotalProvided,
//       int ProvidedAgainstRequested, double FulfillmentRate, double WalkUpRate);
export interface RequestedVsProvidedKpiResponse {
  totalRequested: number;
  totalProvided: number;
  providedAgainstRequested: number;
  fulfillmentRate: number;
  walkUpRate: number;
}

// ---------- Requested-vs-Provided trend (Fulfillment) ----------
// Source: backend/src/PrmDashboard.Shared/DTOs/TrendDtos.cs
//   public record RequestedVsProvidedTrendResponse(
//       List<string> Dates, List<int> Provided, List<int> Requested);
export interface RequestedVsProvidedTrendResponse {
  dates: string[];
  provided: number[];
  requested: number[];
}

// ---------- Monthly trend (Insights) ----------
// Source: backend/src/PrmDashboard.Shared/DTOs/TrendDtos.cs
//   public record MonthlyTrendResponse(List<string> Months, List<int> Values);
export interface MonthlyTrendResponse {
  months: string[];
  values: number[];
}

// ---------- Pause analysis (Insights) ----------
// Source: backend/src/PrmDashboard.Shared/DTOs/PerformanceDtos.cs
//   public record PauseAnalysisResponse(
//       int TotalPaused, double PauseRate,
//       double AvgPauseDurationMinutes, List<BreakdownItem> ByServiceType);
export interface PauseAnalysisResponse {
  totalPaused: number;
  pauseRate: number;
  avgPauseDurationMinutes: number;
  byServiceType: BreakdownItem[];
}

// ---------- Duration by agent type (Insights) ----------
// Source: backend/src/PrmDashboard.Shared/DTOs/PerformanceDtos.cs
//   public record DurationByAgentTypeResponse(
//       List<string> ServiceTypes, List<double> Self, List<double> Outsourced);
export interface DurationByAgentTypeResponse {
  serviceTypes: string[];
  self: number[];
  outsourced: number[];
}

// ---------- Agent × Service matrix (Insights heatmap) ----------
// Source: backend/src/PrmDashboard.Shared/DTOs/BreakdownDtos.cs
//   public record AgentServiceMatrixResponse(
//       List<string> Agents, List<string> AgentNames,
//       List<string> ServiceTypes, List<List<int>> Values);
// `agents` is the agent number / id; `agentNames` the display label.
// `values[agent][service]` = count.
export interface AgentServiceMatrixResponse {
  agents: string[];
  agentNames: string[];
  serviceTypes: string[];
  values: number[][];
}
