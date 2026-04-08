namespace PrmDashboard.Shared.DTOs;

public record DailyTrendResponse(
    List<string> Dates,
    List<int> Values,
    double Average
);

public record MonthlyTrendResponse(
    List<string> Months,
    List<int> Values
);

public record HourlyHeatmapResponse(
    List<string> Days,
    List<int> Hours,
    List<List<int>> Values
);

public record RequestedVsProvidedTrendResponse(
    List<string> Dates,
    List<int> Provided,
    List<int> Requested
);
