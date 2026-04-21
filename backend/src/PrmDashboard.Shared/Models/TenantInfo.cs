namespace PrmDashboard.Shared.Models;

/// <summary>
/// Post-migration tenant metadata shape. Drops the DB-connection columns
/// (DbHost/DbPort/DbName/DbUser/DbPassword) and EF navigation collections
/// that lived on the legacy <see cref="Tenant"/> entity. Services read these
/// from <c>master/tenants.parquet</c> via DuckDB.
/// </summary>
public sealed record TenantInfo(
    int Id,
    string Name,
    string Slug,
    bool IsActive,
    DateTime CreatedAt,
    string? LogoUrl,
    string PrimaryColor);
