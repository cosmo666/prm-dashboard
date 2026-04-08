namespace PrmDashboard.Shared.Models;

public class PrmServiceRecord
{
    public int RowId { get; set; }
    public int Id { get; set; }
    public string Flight { get; set; } = string.Empty;
    public int FlightNumber { get; set; }
    public string? AgentName { get; set; }
    public string? AgentNo { get; set; }
    public string PassengerName { get; set; } = string.Empty;
    public string PrmAgentType { get; set; } = "SELF";
    public int StartTime { get; set; }
    public int? PausedAt { get; set; }
    public int EndTime { get; set; }
    public string Service { get; set; } = string.Empty;
    public string? SeatNumber { get; set; }
    public string? ScannedBy { get; set; }
    public string? ScannedByUser { get; set; }
    public string? Remarks { get; set; }
    public string? PosLocation { get; set; }
    public string? NoShowFlag { get; set; }
    public string LocName { get; set; } = string.Empty;
    public string? Arrival { get; set; }
    public string Airline { get; set; } = string.Empty;
    public string? EmpType { get; set; } = "Employee";
    public string? Departure { get; set; }
    public int Requested { get; set; }
    public DateOnly ServiceDate { get; set; }
}
