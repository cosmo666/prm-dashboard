using System.IO;
using System.Threading.Tasks;
using DuckDB.NET.Data;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using PrmDashboard.AuthService.Services;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.DTOs;
using Xunit;

namespace PrmDashboard.Tests.AuthService;

public class AuthenticationServiceTests : IAsyncLifetime
{
    private string _tempRoot = "";
    private AuthenticationService _sut = null!;
    private InMemoryRefreshTokenStore _store = null!;

    // Fixture data values
    private const int TenantId = 7;
    private const string TenantSlug = "testco";
    private const int EmployeeId = 42;
    private const string Username = "alice";
    private const string Password = "correct-horse-battery-staple";
    private const string DisplayName = "Alice Tester";
    private const string Email = "alice@example.com";

    public async Task InitializeAsync()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), $"authsvc-test-{System.Guid.NewGuid():N}");
        var masterDir = Path.Combine(_tempRoot, "master");
        Directory.CreateDirectory(masterDir);

        var tenantsPath = Path.Combine(masterDir, "tenants.parquet");
        var employeesPath = Path.Combine(masterDir, "employees.parquet");
        var airportsPath = Path.Combine(masterDir, "employee_airports.parquet");

        // Build a tiny master fixture via DuckDB's COPY statements.
        await using var setupConn = new DuckDBConnection("DataSource=:memory:");
        await setupConn.OpenAsync();

        var bcryptHash = BCrypt.Net.BCrypt.HashPassword(Password);

        await using (var cmd = setupConn.CreateCommand())
        {
            cmd.CommandText = $"""
                COPY (
                    SELECT {TenantId}::INTEGER AS id,
                           'Test Co'::VARCHAR AS name,
                           '{TenantSlug}'::VARCHAR AS slug,
                           TRUE::BOOLEAN AS is_active,
                           TIMESTAMP '2026-01-01 00:00:00' AS created_at,
                           NULL::VARCHAR AS logo_url,
                           '#000000'::VARCHAR AS primary_color
                ) TO '{tenantsPath.Replace("'", "''")}' (FORMAT 'parquet');
                """;
            await cmd.ExecuteNonQueryAsync();
        }

        await using (var cmd = setupConn.CreateCommand())
        {
            cmd.CommandText = $"""
                COPY (
                    SELECT {EmployeeId}::INTEGER AS id,
                           {TenantId}::INTEGER AS tenant_id,
                           '{Username}'::VARCHAR AS username,
                           '{bcryptHash.Replace("'", "''")}'::VARCHAR AS password_hash,
                           '{DisplayName}'::VARCHAR AS display_name,
                           '{Email}'::VARCHAR AS email,
                           TRUE::BOOLEAN AS is_active,
                           TIMESTAMP '2026-01-01 00:00:00' AS created_at,
                           NULL::TIMESTAMP AS last_login
                    UNION ALL
                    SELECT 43, {TenantId}, 'bob_pending',
                           'BCRYPT_PENDING:plainpass',
                           'Bob Bootstrap', 'bob@example.com',
                           TRUE, TIMESTAMP '2026-01-01 00:00:00', NULL
                ) TO '{employeesPath.Replace("'", "''")}' (FORMAT 'parquet');
                """;
            await cmd.ExecuteNonQueryAsync();
        }

        await using (var cmd = setupConn.CreateCommand())
        {
            cmd.CommandText = $"""
                COPY (
                    SELECT 1::INTEGER AS id, {EmployeeId}::INTEGER AS employee_id,
                           'DEL'::VARCHAR AS airport_code, 'Delhi'::VARCHAR AS airport_name
                    UNION ALL
                    SELECT 2, {EmployeeId}, 'BOM', 'Mumbai'
                ) TO '{airportsPath.Replace("'", "''")}' (FORMAT 'parquet');
                """;
            await cmd.ExecuteNonQueryAsync();
        }

        // Wire up the SUT with real foundation primitives pointed at the fixture.
        var options = Options.Create(new DataPathOptions { Root = _tempRoot, PoolSize = 4 });
        var duck = new DuckDbContext(options);
        var paths = new TenantParquetPaths(options);
        _store = new InMemoryRefreshTokenStore();

        var jwtConfig = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Secret"] = "test-secret-key-at-least-32-bytes-long-for-hs256",
                ["Jwt:Issuer"] = "test-issuer",
                ["Jwt:Audience"] = "test-audience",
                ["Jwt:AccessTokenMinutes"] = "15",
                ["Jwt:RefreshTokenDays"] = "7",
            })
            .Build();

        var jwt = new JwtService(jwtConfig);

        _sut = new AuthenticationService(
            duck,
            paths,
            _store,
            jwt,
            jwtConfig,
            NullLogger<AuthenticationService>.Instance);
    }

    public Task DisposeAsync()
    {
        try { Directory.Delete(_tempRoot, recursive: true); } catch { /* best-effort */ }
        return Task.CompletedTask;
    }

    [Fact]
    public async Task LoginAsync_ValidCredentials_ReturnsResponse()
    {
        var result = await _sut.LoginAsync(TenantSlug, new LoginRequest(Username, Password), CancellationToken.None);

        Assert.NotNull(result);
        Assert.False(string.IsNullOrEmpty(result!.AccessToken));
        Assert.Equal(EmployeeId, result.Employee.Id);
        Assert.Equal(DisplayName, result.Employee.DisplayName);
        Assert.Equal(2, result.Employee.Airports.Count);
        Assert.Contains(result.Employee.Airports, a => a.Code == "DEL");
        Assert.Contains(result.Employee.Airports, a => a.Code == "BOM");
    }

    [Fact]
    public async Task LoginAsync_UnknownTenant_ReturnsNull()
    {
        var result = await _sut.LoginAsync("ghost-tenant", new LoginRequest(Username, Password), CancellationToken.None);
        Assert.Null(result);
    }

    [Fact]
    public async Task LoginAsync_UnknownUser_ReturnsNull()
    {
        var result = await _sut.LoginAsync(TenantSlug, new LoginRequest("nobody", Password), CancellationToken.None);
        Assert.Null(result);
    }

    [Fact]
    public async Task LoginAsync_WrongPassword_ReturnsNull()
    {
        var result = await _sut.LoginAsync(TenantSlug, new LoginRequest(Username, "nope"), CancellationToken.None);
        Assert.Null(result);
    }

    [Fact]
    public async Task LoginAsync_BcryptPendingPrefix_VerifiesViaPlaintext()
    {
        var result = await _sut.LoginAsync(TenantSlug, new LoginRequest("bob_pending", "plainpass"), CancellationToken.None);
        Assert.NotNull(result);
        Assert.Equal(43, result!.Employee.Id);
    }

    [Fact]
    public async Task RefreshAsync_ValidToken_RotatesAndReturnsNewToken()
    {
        var issued = await _sut.CreateRefreshTokenAsync(EmployeeId, TenantSlug, CancellationToken.None);
        var (accessToken, newToken, newExpires) = await _sut.RefreshAsync(issued.Token, CancellationToken.None);

        Assert.False(string.IsNullOrEmpty(accessToken));
        Assert.False(string.IsNullOrEmpty(newToken));
        Assert.NotEqual(issued.Token, newToken); // rotated
        Assert.NotNull(newExpires);
    }

    [Fact]
    public async Task RefreshAsync_DoubleUse_SecondAttemptFails()
    {
        // Atomic rotation regression: consuming the same refresh token twice must yield
        // exactly one success. Sequential is enough; concurrent is covered in store unit tests.
        var issued = await _sut.CreateRefreshTokenAsync(EmployeeId, TenantSlug, CancellationToken.None);

        var first = await _sut.RefreshAsync(issued.Token, CancellationToken.None);
        var second = await _sut.RefreshAsync(issued.Token, CancellationToken.None);

        Assert.NotNull(first.accessToken);
        Assert.Null(second.accessToken);
        Assert.Null(second.newRefreshToken);
    }

    [Fact]
    public async Task GetProfileAsync_ValidEmployee_ReturnsDto()
    {
        var profile = await _sut.GetProfileAsync(EmployeeId, CancellationToken.None);
        Assert.NotNull(profile);
        Assert.Equal(EmployeeId, profile!.Id);
        Assert.Equal(DisplayName, profile.DisplayName);
        Assert.Equal(2, profile.Airports.Count);
    }
}
