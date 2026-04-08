namespace PrmDashboard.Shared.Models;

public class RefreshToken
{
    public int Id { get; set; }
    public int EmployeeId { get; set; }
    public string Token { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool Revoked { get; set; }

    public Employee Employee { get; set; } = null!;
}
