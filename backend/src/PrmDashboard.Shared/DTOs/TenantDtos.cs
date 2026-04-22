namespace PrmDashboard.Shared.DTOs;

public record TenantConfigResponse(
    int Id,
    string Name,
    string Slug,
    string? LogoUrl,
    string PrimaryColor
);

