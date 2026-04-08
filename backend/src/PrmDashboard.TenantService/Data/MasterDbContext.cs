using Microsoft.EntityFrameworkCore;
using PrmDashboard.Shared.Models;

namespace PrmDashboard.TenantService.Data;

public class MasterDbContext : DbContext
{
    public MasterDbContext(DbContextOptions<MasterDbContext> options) : base(options) { }

    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<Employee> Employees => Set<Employee>();
    public DbSet<EmployeeAirport> EmployeeAirports => Set<EmployeeAirport>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Tenant>(e =>
        {
            e.ToTable("tenants");
            e.HasIndex(t => t.Slug).IsUnique();
        });

        modelBuilder.Entity<Employee>(e =>
        {
            e.ToTable("employees");
            e.HasIndex(emp => new { emp.TenantId, emp.Username }).IsUnique();
            e.HasOne(emp => emp.Tenant).WithMany(t => t.Employees).HasForeignKey(emp => emp.TenantId);
        });

        modelBuilder.Entity<EmployeeAirport>(e =>
        {
            e.ToTable("employee_airports");
            e.HasIndex(ea => new { ea.EmployeeId, ea.AirportCode }).IsUnique();
            e.HasOne(ea => ea.Employee).WithMany(emp => emp.Airports).HasForeignKey(ea => ea.EmployeeId);
        });

        // Map PascalCase properties to snake_case columns
        foreach (var entity in modelBuilder.Model.GetEntityTypes())
        {
            foreach (var property in entity.GetProperties())
            {
                property.SetColumnName(ToSnakeCase(property.Name));
            }
        }
    }

    private static string ToSnakeCase(string name) =>
        System.Text.RegularExpressions.Regex.Replace(
            System.Text.RegularExpressions.Regex.Replace(name, @"([A-Z]+)([A-Z][a-z])", "$1_$2"),
            @"([a-z\d])([A-Z])",
            "$1_$2"
        ).ToLower();
}
