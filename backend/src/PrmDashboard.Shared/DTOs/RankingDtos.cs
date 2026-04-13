namespace PrmDashboard.Shared.DTOs;

public record RankingItem(string Label, int Count, double Percentage);

public record FlightRankingItem(string Label, int ServicedCount, int RequestedCount, double Percentage);

public record AgentRankingItem(
    int Rank,
    string AgentNo,
    string AgentName,
    int PrmCount,
    double AvgDurationMinutes,
    string TopService,
    int TopServiceCount,
    string TopAirline,
    int DaysActive,
    double AvgPerDay
);

public record RankingsResponse(List<RankingItem> Items);

public record FlightRankingsResponse(List<FlightRankingItem> Items);

public record AgentRankingsResponse(List<AgentRankingItem> Items);
