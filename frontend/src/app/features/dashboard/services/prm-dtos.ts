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
