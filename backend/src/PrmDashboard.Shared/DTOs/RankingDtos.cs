namespace PrmDashboard.Shared.DTOs;

public record RankingItem(string Label, int Count, double Percentage);

public record AgentRankingItem(
    int Rank,
    string AgentNo,
    string AgentName,
    int PrmCount,
    double AvgDurationMinutes,
    string TopService,
    string TopAirline,
    int DaysActive
);

public record RankingsResponse(List<RankingItem> Items);

public record AgentRankingsResponse(List<AgentRankingItem> Items);
