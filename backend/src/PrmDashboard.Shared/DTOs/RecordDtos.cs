namespace PrmDashboard.Shared.DTOs;

public record PrmRecordDto(
    int RowId,
    int Id,
    string Flight,
    string? AgentName,
    string PassengerName,
    string PrmAgentType,
    int StartTime,
    int? PausedAt,
    int EndTime,
    string Service,
    string? SeatNumber,
    string? PosLocation,
    string? NoShowFlag,
    string LocName,
    string? Arrival,
    string Airline,
    string? Departure,
    int Requested,
    DateOnly ServiceDate
);

public record PaginatedResponse<T>(
    List<T> Items,
    int TotalCount,
    int Page,
    int PageSize,
    int TotalPages
);

public record FilterOptionsResponse(
    List<string> Airlines,
    List<string> Services,
    List<string> HandledBy,
    List<string> Flights,
    DateOnly? MinDate,
    DateOnly? MaxDate
);

public record PrmSegmentDto(
    int RowId,
    int StartTime,
    int? PausedAt,
    int EndTime,
    double ActiveMinutes
);
