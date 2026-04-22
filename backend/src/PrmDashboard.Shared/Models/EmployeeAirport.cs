namespace PrmDashboard.Shared.Models;

public class EmployeeAirport
{
    public int Id { get; set; }
    public int EmployeeId { get; set; }
    public string AirportCode { get; set; } = string.Empty;
    public string AirportName { get; set; } = string.Empty;
}
