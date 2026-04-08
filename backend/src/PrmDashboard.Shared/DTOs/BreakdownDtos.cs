namespace PrmDashboard.Shared.DTOs;

public record ServiceTypeMatrixRow(
    string MonthYear,
    Dictionary<string, int> ServiceCounts,
    int Total
);

public record ServiceTypeMatrixResponse(
    List<string> ServiceTypes,
    List<ServiceTypeMatrixRow> Rows
);

public record SankeyNode(string Name, int Value);
public record SankeyLink(string Source, string Target, int Value);

public record SankeyResponse(
    List<SankeyNode> Nodes,
    List<SankeyLink> Links
);

public record BreakdownItem(string Label, int Count, double Percentage);

public record BreakdownResponse(List<BreakdownItem> Items);

public record RouteItem(string Departure, string Arrival, int Count, double Percentage);

public record RouteBreakdownResponse(List<RouteItem> Items);
