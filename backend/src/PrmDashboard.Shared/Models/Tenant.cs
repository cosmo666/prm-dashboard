namespace PrmDashboard.Shared.Models;

public class Tenant
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string DbHost { get; set; } = "mysql";
    public int DbPort { get; set; } = 3306;
    public string DbName { get; set; } = string.Empty;
    public string DbUser { get; set; } = "root";
    public string DbPassword { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string? LogoUrl { get; set; }
    public string PrimaryColor { get; set; } = "#2563eb";

    public ICollection<Employee> Employees { get; set; } = new List<Employee>();

    public string GetConnectionString() =>
        $"Server={DbHost};Port={DbPort};Database={DbName};User={DbUser};Password={DbPassword}";
}
