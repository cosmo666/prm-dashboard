namespace PrmDashboard.PrmService.Data;

public class TenantNotFoundException : Exception
{
    public string TenantSlug { get; }
    public TenantNotFoundException(string tenantSlug)
        : base($"Tenant '{tenantSlug}' not found")
    {
        TenantSlug = tenantSlug;
    }
}
