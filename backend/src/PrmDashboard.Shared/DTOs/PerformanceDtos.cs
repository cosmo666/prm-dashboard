namespace PrmDashboard.Shared.DTOs;

public record DurationStatsResponse(
    double Min,
    double Max,
    double Avg,
    double Median,
    double P90,
    double P95
);

public record DurationBucket(string Label, int Count, double Percentage);

public record DurationDistributionResponse(
    List<DurationBucket> Buckets,
    double P50,
    double P90,
    double Avg
);

public record NoShowItem(string Airline, int Total, int NoShows, double Rate);

public record NoShowResponse(List<NoShowItem> Items);

public record PauseAnalysisResponse(
    int TotalPaused,
    double PauseRate,
    double AvgPauseDurationMinutes,
    List<BreakdownItem> ByServiceType
);

public record DurationByAgentTypeResponse(
    List<string> ServiceTypes,
    List<double> Self,
    List<double> Outsourced);
