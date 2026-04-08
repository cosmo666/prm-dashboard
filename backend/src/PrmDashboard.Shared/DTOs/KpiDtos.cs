namespace PrmDashboard.Shared.DTOs;

public record KpiSummaryResponse(
    int TotalPrm,
    int TotalPrmPrevPeriod,
    int TotalAgents,
    int AgentsSelf,
    int AgentsOutsourced,
    double AvgServicesPerAgentPerDay,
    double AvgServicesPrevPeriod,
    double AvgDurationMinutes,
    double AvgDurationPrevPeriod,
    double FulfillmentPct
);

public record HandlingDistributionResponse(
    List<string> Labels,
    List<int> Values
);

public record RequestedVsProvidedKpiResponse(
    int TotalRequested,
    int TotalProvided,
    int ProvidedAgainstRequested,
    double FulfillmentRate,
    double WalkUpRate
);
