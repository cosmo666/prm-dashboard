using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using DuckDB.NET.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.IdentityModel.Tokens;
using PrmDashboard.PrmService;
using Xunit;

namespace PrmDashboard.Tests.PrmService;

/// <summary>
/// WebApplicationFactory-based integration tests that drive the full HTTP
/// pipeline of PrmService.  Every test sends a real HTTP request through
/// the three middlewares:
///   - TenantSlugClaimCheckMiddleware (Shared)
///   - AirportAccessMiddleware (PrmService)
///   - ExceptionHandlerMiddleware (PrmService)
/// </summary>
public sealed class MiddlewareIntegrationTests : IAsyncLifetime
{
    // ── Test JWT configuration ────────────────────────────────────────────
    private const string TestSecret = "test-secret-key-at-least-32-bytes-long-for-hs256";
    private const string TestIssuer = "prm-test";
    private const string TestAudience = "prm-test-audience";

    // Tenant that has a parquet file on disk (written in InitializeAsync).
    private const string FixtureTenant = "fixture";

    // Tenant whose slug is JWT-valid but has no parquet file on disk.
    private const string MissingTenant = "not-onboarded-yet";

    private string _tempRoot = "";
    private WebApplicationFactory<PrmServiceEntryPoint> _factory = null!;
    private HttpClient _client = null!;

    // ── Lifecycle ─────────────────────────────────────────────────────────

    public async Task InitializeAsync()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), $"mw-it-{Guid.NewGuid():N}");

        // Create the directory layout the DataPathValidator expects.
        Directory.CreateDirectory(Path.Combine(_tempRoot, "master"));
        Directory.CreateDirectory(Path.Combine(_tempRoot, FixtureTenant));

        // Write a minimal parquet file so valid requests can actually reach a controller.
        await WriteMinimalParquet(Path.Combine(_tempRoot, FixtureTenant, "prm_services.parquet"));

        // Inject config via environment variables — these are read by WebApplication.CreateBuilder
        // before Program.cs calls JwtStartupValidator.ReadAndValidate, so they're guaranteed to be
        // present regardless of WebApplicationFactory config-override timing.
        Environment.SetEnvironmentVariable("Jwt__Secret", TestSecret);
        Environment.SetEnvironmentVariable("Jwt__Issuer", TestIssuer);
        Environment.SetEnvironmentVariable("Jwt__Audience", TestAudience);
        Environment.SetEnvironmentVariable("PRM_DATA_PATH", _tempRoot);
        Environment.SetEnvironmentVariable("Cors__AllowedOrigins__0", "http://localhost:4200");

        _factory = new WebApplicationFactory<PrmServiceEntryPoint>();

        _client = _factory.CreateClient();
    }

    public Task DisposeAsync()
    {
        _client.Dispose();
        _factory.Dispose();
        // Clean up env vars so they don't bleed into other test classes.
        Environment.SetEnvironmentVariable("Jwt__Secret", null);
        Environment.SetEnvironmentVariable("Jwt__Issuer", null);
        Environment.SetEnvironmentVariable("Jwt__Audience", null);
        Environment.SetEnvironmentVariable("PRM_DATA_PATH", null);
        Environment.SetEnvironmentVariable("Cors__AllowedOrigins__0", null);
        try { Directory.Delete(_tempRoot, recursive: true); } catch { /* best-effort */ }
        return Task.CompletedTask;
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    /// <summary>
    /// Generates a signed JWT with the given tenant slug and airport list.
    /// Subject is always "1" so the controller can call GetTenantSlug() safely.
    /// </summary>
    private static string BuildToken(string tenantSlug, string airports)
    {
        var key = new SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(TestSecret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: TestIssuer,
            audience: TestAudience,
            claims: new[]
            {
                new Claim(ClaimTypes.NameIdentifier, "1"),
                new Claim("tenant_id", "1"),
                new Claim("tenant_slug", tenantSlug),
                new Claim("name", "Test User"),
                new Claim("airports", airports),
            },
            expires: DateTime.UtcNow.AddMinutes(15),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// <summary>
    /// Builds an authorized GET request for /api/prm/kpis/summary.
    /// Callers set the tenant-slug header and airport param individually.
    /// </summary>
    private static HttpRequestMessage SummaryRequest(
        string? bearerToken,
        string? tenantSlugHeader,
        string? airportParam)
    {
        var url = "/api/prm/kpis/summary";
        if (airportParam is not null)
            url += $"?airport={Uri.EscapeDataString(airportParam)}";

        var req = new HttpRequestMessage(HttpMethod.Get, url);

        if (bearerToken is not null)
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearerToken);

        if (tenantSlugHeader is not null)
            req.Headers.TryAddWithoutValidation("X-Tenant-Slug", tenantSlugHeader);

        return req;
    }

    /// <summary>
    /// Writes a one-row prm_services.parquet using an in-memory DuckDB connection.
    /// Just enough schema for the KPI query to execute without error.
    /// </summary>
    private static async Task WriteMinimalParquet(string destPath)
    {
        await using var conn = new DuckDBConnection("DataSource=:memory:");
        await conn.OpenAsync();

        await ExecNonQuery(conn, @"
            CREATE TABLE prm_services (
                row_id INTEGER, id INTEGER, flight VARCHAR, flight_number INTEGER,
                agent_name VARCHAR, agent_no VARCHAR, passenger_name VARCHAR,
                prm_agent_type VARCHAR, start_time INTEGER, paused_at INTEGER,
                end_time INTEGER, service VARCHAR, seat_number VARCHAR,
                pos_location VARCHAR, no_show_flag VARCHAR, loc_name VARCHAR,
                arrival VARCHAR, airline VARCHAR, departure VARCHAR,
                requested INTEGER, service_date DATE
            )");

        var escaped = destPath.Replace("'", "''");
        await ExecNonQuery(conn, $@"
            INSERT INTO prm_services VALUES
                (1, 1, 'AI101', 101, 'Agent', 'A001', 'Pax', 'SELF',
                 900, NULL, 1000, 'WCHR', NULL, NULL, 'Y',
                 'DEL', 'DEL', 'AI', 'BOM', 1, DATE '2026-03-01')");

        await ExecNonQuery(conn, $"COPY prm_services TO '{escaped}' (FORMAT 'parquet')");
    }

    private static async Task ExecNonQuery(DuckDBConnection conn, string sql)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        await cmd.ExecuteNonQueryAsync();
    }

    // ── Tests ─────────────────────────────────────────────────────────────

    /// <summary>
    /// No Authorization header → ASP.NET Core authentication returns 401 before
    /// any of our custom middleware has a chance to run.
    /// </summary>
    [Fact]
    public async Task UnauthenticatedRequest_Returns401()
    {
        var req = SummaryRequest(bearerToken: null, tenantSlugHeader: null, airportParam: "DEL");
        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    /// <summary>
    /// Valid JWT but the gateway-injected X-Tenant-Slug header is absent.
    /// TenantSlugClaimCheckMiddleware must reject with 400.
    /// </summary>
    [Fact]
    public async Task AuthenticatedRequest_NoTenantSlugHeader_Returns400()
    {
        var token = BuildToken(FixtureTenant, "DEL,BOM");
        var req = SummaryRequest(token, tenantSlugHeader: null, airportParam: "DEL");
        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        Assert.Equal("application/problem+json", resp.Content.Headers.ContentType?.MediaType);
    }

    /// <summary>
    /// JWT claim says "fixture" but the header says "attacker".
    /// TenantSlugClaimCheckMiddleware must reject with 403.
    /// </summary>
    [Fact]
    public async Task AuthenticatedRequest_TenantSlugMismatch_Returns403()
    {
        var token = BuildToken(FixtureTenant, "DEL,BOM");
        var req = SummaryRequest(token, tenantSlugHeader: "attacker", airportParam: "DEL");
        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
        Assert.Equal("application/problem+json", resp.Content.Headers.ContentType?.MediaType);
    }

    /// <summary>
    /// Tenant slug header matches the claim but the ?airport= param is missing.
    /// AirportAccessMiddleware must reject with 400.
    /// </summary>
    [Fact]
    public async Task AuthenticatedRequest_NoAirportQuery_Returns400()
    {
        var token = BuildToken(FixtureTenant, "DEL,BOM");
        // Pass airportParam: null so no ?airport= is appended to the URL.
        var req = SummaryRequest(token, tenantSlugHeader: FixtureTenant, airportParam: null);
        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        Assert.Equal("application/problem+json", resp.Content.Headers.ContentType?.MediaType);
    }

    /// <summary>
    /// JWT airports claim is only "DEL" but request asks for "SYD".
    /// AirportAccessMiddleware must reject with 403.
    /// </summary>
    [Fact]
    public async Task AuthenticatedRequest_AirportNotInClaim_Returns403()
    {
        var token = BuildToken(FixtureTenant, "DEL");
        var req = SummaryRequest(token, tenantSlugHeader: FixtureTenant, airportParam: "SYD");
        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
        Assert.Equal("application/problem+json", resp.Content.Headers.ContentType?.MediaType);
    }

    /// <summary>
    /// JWT airports claim is "DEL,BOM" but request asks for "DEL,SYD".
    /// AirportAccessMiddleware validates every airport; SYD is not in the claim
    /// so it must reject with 403.
    /// </summary>
    [Fact]
    public async Task AuthenticatedRequest_MultiAirportOneOutsideClaim_Returns403()
    {
        var token = BuildToken(FixtureTenant, "DEL,BOM");
        var req = SummaryRequest(token, tenantSlugHeader: FixtureTenant, airportParam: "DEL,SYD");
        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
        Assert.Equal("application/problem+json", resp.Content.Headers.ContentType?.MediaType);
    }

    /// <summary>
    /// All middleware guards pass and the parquet file is present.
    /// The controller must return 200 with real JSON data.
    /// </summary>
    [Fact]
    public async Task AuthenticatedRequest_ValidSetup_Returns200()
    {
        var token = BuildToken(FixtureTenant, "DEL,BOM");
        var req = SummaryRequest(token, tenantSlugHeader: FixtureTenant, airportParam: "DEL");
        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    /// <summary>
    /// JWT claim and header both say "not-onboarded-yet" (valid slug format) but
    /// no parquet file exists on disk.  ExceptionHandlerMiddleware must catch the
    /// TenantParquetNotFoundException thrown by the service and return 404 with
    /// application/problem+json.
    /// </summary>
    [Fact]
    public async Task AuthenticatedRequest_TenantParquetMissing_Returns404()
    {
        // Build a token for the not-yet-provisioned tenant.
        var token = BuildToken(MissingTenant, "DEL,BOM");
        var req = SummaryRequest(token, tenantSlugHeader: MissingTenant, airportParam: "DEL");
        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
        Assert.Equal("application/problem+json", resp.Content.Headers.ContentType?.MediaType);
    }
}
