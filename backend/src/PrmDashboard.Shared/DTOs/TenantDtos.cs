namespace PrmDashboard.Shared.DTOs;

public record TenantConfigResponse(
    int Id,
    string Name,
    string Slug,
    string? LogoUrl,
    string PrimaryColor
);

public record TenantResolveResponse(
    int TenantId,
    string DbHost,
    int DbPort,
    string DbName,
    string DbUser,
    string DbPassword
);
