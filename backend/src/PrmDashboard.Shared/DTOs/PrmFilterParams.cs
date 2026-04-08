namespace PrmDashboard.Shared.DTOs;

public class PrmFilterParams
{
    public string Airport { get; set; } = string.Empty;
    public DateOnly? DateFrom { get; set; }
    public DateOnly? DateTo { get; set; }
    public string? Airline { get; set; }
    public string? Service { get; set; }
    public string? HandledBy { get; set; }
    public string? Flight { get; set; }
    public string? AgentNo { get; set; }
}
