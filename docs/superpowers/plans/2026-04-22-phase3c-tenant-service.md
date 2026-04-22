# Phase 3c — TenantService Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap `PrmDashboard.TenantService` from EF Core + MySQL to DuckDB + Parquet. Delete `SchemaMigrator` and the embedded SQL migrations. Preserve all three endpoint contracts verbatim so PrmService (still on EF+MySQL until 3d) keeps working.

**Architecture:** New `TenantsLoader : IHostedService` loads a startup dictionary `IReadOnlyDictionary<string, TenantInfo>` from `master/tenants.parquet WHERE is_active`; injected into `TenantResolutionService` for the hot `/config` path. `ResolveAsync` and `GetAirportsForEmployeeAsync` do per-call DuckDB queries via the Phase 3a `IDuckDbContext` + `TenantParquetPaths`. The `/resolve/{slug}` endpoint continues to return the legacy `TenantResolveResponse` (DbHost/DbPort/DbName/DbUser/DbPassword) so PrmService's `TenantDbContextFactory` keeps resolving MySQL connections through it until 3d rewrites that caller.

**Tech Stack:**
- .NET 8 TenantService project (already exists)
- Phase 3a foundation from `PrmDashboard.Shared` (`IDuckDbContext`, `TenantParquetPaths`, `DataPathOptions`, `DataPathValidator`, `TenantInfo`) — all available via the existing `<ProjectReference>` to Shared
- `DuckDB.NET.Data` 1.5.0 + `DuckDB.NET.Bindings.Full` 1.5.0 (transitively via Shared)
- xUnit in the existing `PrmDashboard.Tests` project

---

## Spec resolutions baked into this plan

The Phase 3c spec (`docs/superpowers/specs/2026-04-22-phase3c-tenant-service-design.md`) lists three open items. This plan locks them:

1. **Hosted service ordering.** `DataPathValidator` is registered first; `TenantsLoader`'s hosted-service entry is registered second. ASP.NET Core runs hosted services in registration order during startup. If the data path is missing, `DataPathValidator` throws before `TenantsLoader` runs.
2. **`Lazy<T>` vs nullable field for the startup dict.** Simpler form used: `private IReadOnlyDictionary<string, TenantInfo>? _configsBySlug;` with a throw-on-access-before-start getter. `StartAsync` eagerly populates the field. The dict is always ready by the time any HTTP handler runs because hosted services complete `StartAsync` before the app begins accepting requests.
3. **`WebApplicationFactory` end-to-end test.** Not included. Per-service integration tests against real Parquet fixtures (same `IAsyncLifetime` pattern as Phase 3a/3b) are sufficient for the swap.

---

## Files to create/modify/delete

Create:
- `backend/src/PrmDashboard.TenantService/Services/TenantsLoader.cs`
- `backend/tests/PrmDashboard.Tests/TenantService/TenantsLoaderTests.cs`
- `backend/tests/PrmDashboard.Tests/TenantService/TenantResolutionServiceTests.cs`

Modify:
- `backend/src/PrmDashboard.TenantService/Services/TenantResolutionService.cs` — major rewrite (EF → DuckDB + TenantsLoader)
- `backend/src/PrmDashboard.TenantService/Program.cs` — swap DI wiring
- `backend/src/PrmDashboard.TenantService/PrmDashboard.TenantService.csproj` — remove 3 EF/MySQL packages + the `<EmbeddedResource>` line
- `backend/src/PrmDashboard.TenantService/appsettings.Development.json` — replace `ConnectionStrings:MasterDb` with `DataPath`

Delete:
- `backend/src/PrmDashboard.TenantService/Services/SchemaMigrator.cs`
- `backend/src/PrmDashboard.TenantService/Schema/Migrations/001_create_prm_services.sql`
- `backend/src/PrmDashboard.TenantService/Schema/` (empty folder afterward)
- `backend/src/PrmDashboard.TenantService/Data/MasterDbContext.cs`
- `backend/src/PrmDashboard.TenantService/Data/` (empty folder afterward)
- `backend/tests/PrmDashboard.Tests/TenantService/SchemaMigratorFilenameTests.cs` — 3 tests for the deleted migrator

**No other files touched.** In particular, no `TenantController.cs` changes — the new `ResolveAsync` return type's field names match the old `Tenant` entity's (`Id`, `DbHost`, `DbPort`, `DbName`, `DbUser`, `DbPassword`), so the controller's `var tenant = ...; tenant.DbHost` pattern works without modification.

---

## Pre-task: branch state

Expected latest commit on `phase3c-tenant-service` branch when this plan runs: `dacfa84 docs(spec): phase 3c TenantService swap design`. Plus the plan-doc commit when you check.

```bash
git log --oneline -3
```

All Phase-3c work lands on `phase3c-tenant-service`.

---

### Task 1: `TenantsLoader` hosted service + unit tests

Pure, isolated helper that compiles alongside the existing MasterDbContext/SchemaMigrator. Strict TDD.

**Files:**
- Create: `backend/src/PrmDashboard.TenantService/Services/TenantsLoader.cs`
- Create: `backend/tests/PrmDashboard.Tests/TenantService/TenantsLoaderTests.cs`

- [ ] **Step 1: Write the failing tests**

Write `backend/tests/PrmDashboard.Tests/TenantService/TenantsLoaderTests.cs`:

```csharp
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using DuckDB.NET.Data;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using PrmDashboard.Shared.Data;
using PrmDashboard.TenantService.Services;
using Xunit;

namespace PrmDashboard.Tests.TenantService;

public class TenantsLoaderTests : IAsyncLifetime
{
    private string _tempRoot = "";
    private string _tenantsParquet = "";

    public Task InitializeAsync()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), $"tenants-loader-{System.Guid.NewGuid():N}");
        Directory.CreateDirectory(Path.Combine(_tempRoot, "master"));
        _tenantsParquet = Path.Combine(_tempRoot, "master", "tenants.parquet");
        return Task.CompletedTask;
    }

    public Task DisposeAsync()
    {
        try { Directory.Delete(_tempRoot, recursive: true); } catch { /* best-effort */ }
        return Task.CompletedTask;
    }

    private async Task WriteTenantsFixtureAsync(string sqlRows)
    {
        await using var conn = new DuckDBConnection("DataSource=:memory:");
        await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = $"COPY ({sqlRows}) TO '{_tenantsParquet.Replace("'", "''")}' (FORMAT 'parquet')";
        await cmd.ExecuteNonQueryAsync();
    }

    private TenantsLoader BuildLoader()
    {
        var options = Options.Create(new DataPathOptions { Root = _tempRoot, PoolSize = 4 });
        var duck = new DuckDbContext(options);
        var paths = new TenantParquetPaths(options);
        return new TenantsLoader(duck, paths, NullLogger<TenantsLoader>.Instance);
    }

    [Fact]
    public async Task StartAsync_ValidParquet_PopulatesDict()
    {
        await WriteTenantsFixtureAsync("""
            SELECT 1::INTEGER AS id, 'Tenant One'::VARCHAR AS name, 'one'::VARCHAR AS slug,
                   TRUE::BOOLEAN AS is_active, TIMESTAMP '2026-01-01 00:00:00' AS created_at,
                   NULL::VARCHAR AS logo_url, '#111111'::VARCHAR AS primary_color
            UNION ALL
            SELECT 2, 'Tenant Two', 'two', TRUE, TIMESTAMP '2026-01-01 00:00:00',
                   'https://logo/two.png', '#222222'
            UNION ALL
            SELECT 3, 'Inactive', 'gone', FALSE, TIMESTAMP '2026-01-01 00:00:00',
                   NULL, '#333333'
            """);

        var loader = BuildLoader();
        await loader.StartAsync(CancellationToken.None);

        Assert.Equal(2, loader.ConfigBySlug.Count); // inactive is filtered out
        Assert.True(loader.ConfigBySlug.ContainsKey("one"));
        Assert.True(loader.ConfigBySlug.ContainsKey("two"));
        Assert.False(loader.ConfigBySlug.ContainsKey("gone"));

        var one = loader.ConfigBySlug["one"];
        Assert.Equal(1, one.Id);
        Assert.Equal("Tenant One", one.Name);
        Assert.Null(one.LogoUrl);
        Assert.Equal("#111111", one.PrimaryColor);

        var two = loader.ConfigBySlug["two"];
        Assert.Equal("https://logo/two.png", two.LogoUrl);
    }

    [Fact]
    public async Task StartAsync_NoActiveTenants_ReturnsEmptyDict()
    {
        await WriteTenantsFixtureAsync("""
            SELECT 1::INTEGER AS id, 'Inactive'::VARCHAR AS name, 'gone'::VARCHAR AS slug,
                   FALSE::BOOLEAN AS is_active, TIMESTAMP '2026-01-01 00:00:00' AS created_at,
                   NULL::VARCHAR AS logo_url, '#000000'::VARCHAR AS primary_color
            """);

        var loader = BuildLoader();
        await loader.StartAsync(CancellationToken.None);

        Assert.Empty(loader.ConfigBySlug);
    }

    [Fact]
    public void ConfigBySlug_BeforeStartAsync_Throws()
    {
        var loader = BuildLoader();
        var ex = Assert.Throws<InvalidOperationException>(() => _ = loader.ConfigBySlug);
        Assert.Contains("StartAsync", ex.Message);
    }
}
```

- [ ] **Step 2: Run tests — must fail (type doesn't exist)**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter "FullyQualifiedName~TenantsLoaderTests"
```

Expected: compile error citing `TenantsLoader`.

- [ ] **Step 3: Implement `TenantsLoader`**

Write `backend/src/PrmDashboard.TenantService/Services/TenantsLoader.cs`:

```csharp
using Microsoft.Extensions.Hosting;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.Models;

namespace PrmDashboard.TenantService.Services;

/// <summary>
/// Startup gate + injectable cache: loads active tenants from
/// <c>master/tenants.parquet</c> once at <see cref="StartAsync"/>, then exposes
/// them as an immutable dictionary for the hot <c>/config</c> lookup path.
/// Process restart (which a Parquet rebuild requires anyway) is the only way
/// to refresh the dict — replaces the legacy 5-minute <c>IMemoryCache</c>.
///
/// Registered twice in DI: once as a singleton (so <see cref="TenantResolutionService"/>
/// can inject it), once as a hosted service (so the runtime calls
/// <see cref="StartAsync"/> during app startup).
/// </summary>
public sealed class TenantsLoader : IHostedService
{
    private readonly IDuckDbContext _duck;
    private readonly TenantParquetPaths _paths;
    private readonly ILogger<TenantsLoader> _logger;

    private IReadOnlyDictionary<string, TenantInfo>? _configsBySlug;

    public TenantsLoader(IDuckDbContext duck, TenantParquetPaths paths, ILogger<TenantsLoader> logger)
    {
        _duck = duck;
        _paths = paths;
        _logger = logger;
    }

    /// <summary>
    /// Snapshot of active tenants keyed by slug. Throws if accessed before
    /// <see cref="StartAsync"/> has populated the dict.
    /// </summary>
    public IReadOnlyDictionary<string, TenantInfo> ConfigBySlug =>
        _configsBySlug ?? throw new InvalidOperationException(
            "TenantsLoader not initialized. StartAsync must run first.");

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _configsBySlug = await LoadAsync(cancellationToken);
        _logger.LogInformation("Loaded {Count} active tenants at startup", _configsBySlug.Count);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private async Task<IReadOnlyDictionary<string, TenantInfo>> LoadAsync(CancellationToken ct)
    {
        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $"""
            SELECT id, name, slug, is_active, created_at, logo_url, primary_color
            FROM '{EscapeSingleQuotes(_paths.MasterTenants)}'
            WHERE is_active
            """;

        var result = new Dictionary<string, TenantInfo>(StringComparer.Ordinal);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var info = new TenantInfo(
                Id: reader.GetInt32(0),
                Name: reader.GetString(1),
                Slug: reader.GetString(2),
                IsActive: reader.GetBoolean(3),
                CreatedAt: reader.GetDateTime(4),
                LogoUrl: reader.IsDBNull(5) ? null : reader.GetString(5),
                PrimaryColor: reader.GetString(6));
            result[info.Slug] = info;
        }
        return result;
    }

    private static string EscapeSingleQuotes(string path) => path.Replace("'", "''");
}
```

- [ ] **Step 4: Run tests — must pass**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter "FullyQualifiedName~TenantsLoaderTests"
```

Expected: `Passed: 3`. Zero failures.

- [ ] **Step 5: Commit**

```bash
git add backend/src/PrmDashboard.TenantService/Services/TenantsLoader.cs backend/tests/PrmDashboard.Tests/TenantService/TenantsLoaderTests.cs
git commit -m "feat(tenant): add TenantsLoader IHostedService for startup tenant dict"
```

---

### Task 2: Rewrite `TenantResolutionService`

Replace EF-based lookups with DuckDB + `TenantsLoader`. Adds a new internal record `LegacyTenantResolveData` with field names matching the legacy `Tenant` entity so the controller needs zero changes.

**Files:**
- Modify: `backend/src/PrmDashboard.TenantService/Services/TenantResolutionService.cs`

- [ ] **Step 1: Replace the file contents**

Write `backend/src/PrmDashboard.TenantService/Services/TenantResolutionService.cs` (overwrites existing):

```csharp
using System.Data;
using DuckDB.NET.Data;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.DTOs;
using PrmDashboard.Shared.Models;

namespace PrmDashboard.TenantService.Services;

/// <summary>
/// Minimal DTO-like record returned by <see cref="TenantResolutionService.ResolveAsync"/>
/// so the <see cref="Controllers.TenantController.Resolve"/> handler can build
/// its legacy <c>TenantResolveResponse</c> without referencing the EF
/// <c>Tenant</c> entity. Field names match the legacy entity so the controller
/// code does not need to change.
/// </summary>
public sealed record LegacyTenantResolveData(
    int Id,
    string Slug,
    string DbHost,
    int DbPort,
    string DbName,
    string DbUser,
    string DbPassword);

public class TenantResolutionService
{
    private readonly IDuckDbContext _duck;
    private readonly TenantParquetPaths _paths;
    private readonly TenantsLoader _tenants;
    private readonly ILogger<TenantResolutionService> _logger;

    public TenantResolutionService(
        IDuckDbContext duck,
        TenantParquetPaths paths,
        TenantsLoader tenants,
        ILogger<TenantResolutionService> logger)
    {
        _duck = duck;
        _paths = paths;
        _tenants = tenants;
        _logger = logger;
    }

    /// <summary>
    /// Returns tenant config for the login page (public, no credentials).
    /// Served from the startup-loaded dictionary — no per-request Parquet read.
    /// </summary>
    public Task<TenantConfigResponse?> GetConfigAsync(string slug, CancellationToken ct = default)
    {
        if (!_tenants.ConfigBySlug.TryGetValue(slug, out var info))
        {
            _logger.LogWarning("Tenant config not found for slug {Slug}", slug);
            return Task.FromResult<TenantConfigResponse?>(null);
        }

        return Task.FromResult<TenantConfigResponse?>(new TenantConfigResponse(
            info.Id,
            info.Name,
            info.Slug,
            info.LogoUrl,
            info.PrimaryColor));
    }

    /// <summary>
    /// Returns the legacy DB-connection fields for PrmService's internal
    /// tenant resolution path. Preserved verbatim during Phase 3c so
    /// PrmService (still on EF+MySQL) keeps working. Phase 3d retires both
    /// this endpoint and its caller.
    /// </summary>
    public async Task<LegacyTenantResolveData?> ResolveAsync(string slug, CancellationToken ct = default)
    {
        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $"""
            SELECT id, slug, db_host, db_port, db_name, db_user, db_password
            FROM '{EscapeSingleQuotes(_paths.MasterTenants)}'
            WHERE slug = $slug AND is_active
            LIMIT 1
            """;
        cmd.Parameters.Add(new DuckDBParameter("slug", slug));

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
        {
            _logger.LogWarning("Tenant not found for slug {Slug}", slug);
            return null;
        }

        return new LegacyTenantResolveData(
            Id: reader.GetInt32(0),
            Slug: reader.GetString(1),
            DbHost: reader.GetString(2),
            DbPort: reader.GetInt32(3),
            DbName: reader.GetString(4),
            DbUser: reader.GetString(5),
            DbPassword: reader.GetString(6));
    }

    /// <summary>
    /// Returns airports assigned to an employee (for RBAC).
    /// </summary>
    public async Task<List<AirportDto>> GetAirportsForEmployeeAsync(int employeeId, CancellationToken ct = default)
    {
        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $"""
            SELECT airport_code, airport_name
            FROM '{EscapeSingleQuotes(_paths.MasterEmployeeAirports)}'
            WHERE employee_id = $eid
            ORDER BY airport_code
            """;
        cmd.Parameters.Add(new DuckDBParameter("eid", employeeId));

        var result = new List<AirportDto>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            result.Add(new AirportDto(
                Code: reader.GetString(0),
                Name: reader.IsDBNull(1) ? string.Empty : reader.GetString(1)));
        }
        return result;
    }

    private static string EscapeSingleQuotes(string path) => path.Replace("'", "''");
}
```

- [ ] **Step 2: Build — must succeed**

```bash
dotnet build backend/src/PrmDashboard.TenantService/PrmDashboard.TenantService.csproj
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`. The service compiles because `MasterDbContext` and `SchemaMigrator` still exist (deleted in Task 3), but `TenantResolutionService` no longer references them. The DI registration in `Program.cs` is still the old one — runtime would fail. That's fixed in Task 3.

- [ ] **Step 3: Verify `TenantController.cs` needs no changes**

```bash
grep "DbHost\|DbPort\|DbName\|DbUser\|DbPassword" backend/src/PrmDashboard.TenantService/Controllers/TenantController.cs
```

Expected: the field accesses still reference `tenant.DbHost`, `tenant.DbPort`, etc. — and these property names match the new `LegacyTenantResolveData` record. No changes needed.

- [ ] **Step 4: Run test suite — must still pass**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --nologo --verbosity minimal
```

Expected: `Passed: 86` (83 pre-existing + 3 from Task 1). Zero failures.

- [ ] **Step 5: Commit**

```bash
git add backend/src/PrmDashboard.TenantService/Services/TenantResolutionService.cs
git commit -m "feat(tenant): rewrite TenantResolutionService to use DuckDB + TenantsLoader"
```

---

### Task 3: Swap `Program.cs` wiring, delete `SchemaMigrator` + `MasterDbContext` + their tests, drop MySQL/EF packages

End state: TenantService runs entirely on DuckDB + Parquet.

**Files:**
- Modify: `backend/src/PrmDashboard.TenantService/Program.cs`
- Modify: `backend/src/PrmDashboard.TenantService/PrmDashboard.TenantService.csproj`
- Modify: `backend/src/PrmDashboard.TenantService/appsettings.Development.json`
- Delete: `backend/src/PrmDashboard.TenantService/Services/SchemaMigrator.cs`
- Delete: `backend/src/PrmDashboard.TenantService/Schema/Migrations/001_create_prm_services.sql`
- Delete: `backend/src/PrmDashboard.TenantService/Schema/` (empty folder)
- Delete: `backend/src/PrmDashboard.TenantService/Data/MasterDbContext.cs`
- Delete: `backend/src/PrmDashboard.TenantService/Data/` (empty folder)
- Delete: `backend/tests/PrmDashboard.Tests/TenantService/SchemaMigratorFilenameTests.cs`

- [ ] **Step 1: Rewrite `Program.cs`**

Write `backend/src/PrmDashboard.TenantService/Program.cs` (full replacement):

```csharp
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.Logging;
using PrmDashboard.Shared.Middleware;
using PrmDashboard.TenantService.Services;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

builder.AddPrmSerilog(serviceName: "tenant");

// Bind to port 8080 inside the container
builder.WebHost.ConfigureKestrel(o => o.ListenAnyIP(8080));

// Services
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var jwtSecret = builder.Configuration["Jwt:Secret"];
if (string.IsNullOrEmpty(jwtSecret))
    throw new InvalidOperationException("Jwt:Secret is required");

var jwtIssuer = builder.Configuration["Jwt:Issuer"];
if (string.IsNullOrEmpty(jwtIssuer))
    throw new InvalidOperationException("Jwt:Issuer is required");

var jwtAudience = builder.Configuration["Jwt:Audience"];
if (string.IsNullOrEmpty(jwtAudience))
    throw new InvalidOperationException("Jwt:Audience is required");

// Phase 3a foundation: DuckDB + Parquet data path
builder.Services.Configure<DataPathOptions>(o =>
{
    o.Root = Environment.GetEnvironmentVariable("PRM_DATA_PATH")
             ?? builder.Configuration["DataPath"]
             ?? throw new InvalidOperationException(
                 "Data path required: set PRM_DATA_PATH env var or DataPath in appsettings.");

    o.PoolSize = builder.Configuration.GetValue<int?>("DataPath:PoolSize")
                 ?? DataPathOptions.DefaultPoolSize;

    if (o.PoolSize < DataPathOptions.MinPoolSize || o.PoolSize > DataPathOptions.MaxPoolSize)
        throw new InvalidOperationException(
            $"DataPath:PoolSize out of range [{DataPathOptions.MinPoolSize}, {DataPathOptions.MaxPoolSize}]: {o.PoolSize}");
});

// DataPathValidator MUST register before TenantsLoader — it runs first and
// fails startup on missing data/ so TenantsLoader gets a clean error path.
builder.Services.AddHostedService<DataPathValidator>();
builder.Services.AddSingleton<IDuckDbContext, DuckDbContext>();
builder.Services.AddSingleton<TenantParquetPaths>();

// TenantsLoader is BOTH injected into TenantResolutionService AND run as a
// hosted service. The second registration points the host lifecycle at the
// same singleton instance.
builder.Services.AddSingleton<TenantsLoader>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<TenantsLoader>());

// JWT Authentication
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret))
        };
    });

builder.Services.AddAuthorization();

// Tenant services
builder.Services.AddScoped<TenantResolutionService>();

// CORS — allowlist from config
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        if (allowedOrigins.Length > 0)
        {
            policy.WithOrigins(allowedOrigins)
                  .AllowAnyMethod()
                  .AllowAnyHeader()
                  .AllowCredentials();
        }
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseMiddleware<CorrelationIdMiddleware>();
app.UseSerilogRequestLogging(opts =>
{
    opts.MessageTemplate =
        "HTTP {RequestMethod} {RequestPath} responded {StatusCode} in {Elapsed:0}ms [corr={CorrelationId}]";
});

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<TenantSlugClaimCheckMiddleware>();

app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "tenant" }));
app.MapControllers();

app.Run();
```

Key diff from the old file: removed `using Microsoft.EntityFrameworkCore;`, `using PrmDashboard.TenantService.Data;`, the `connStr` read, `AddDbContext<MasterDbContext>`, `AddMemoryCache`, `AddSingleton<SchemaMigrator>`. Added the Phase 3a foundation block + `AddSingleton<TenantsLoader>` + `AddHostedService(sp => sp.GetRequiredService<TenantsLoader>())`.

- [ ] **Step 2: Delete `SchemaMigrator.cs` and the Schema/ folder**

```bash
rm backend/src/PrmDashboard.TenantService/Services/SchemaMigrator.cs
rm backend/src/PrmDashboard.TenantService/Schema/Migrations/001_create_prm_services.sql
rmdir backend/src/PrmDashboard.TenantService/Schema/Migrations 2>/dev/null || true
rmdir backend/src/PrmDashboard.TenantService/Schema 2>/dev/null || true
```

- [ ] **Step 3: Delete `MasterDbContext.cs` and the Data/ folder**

```bash
rm backend/src/PrmDashboard.TenantService/Data/MasterDbContext.cs
rmdir backend/src/PrmDashboard.TenantService/Data 2>/dev/null || true
```

- [ ] **Step 4: Delete `SchemaMigratorFilenameTests.cs`**

```bash
rm backend/tests/PrmDashboard.Tests/TenantService/SchemaMigratorFilenameTests.cs
```

(The `TenantService/` test folder is kept — Task 1's TenantsLoaderTests.cs lives there, and Task 4 will add more.)

- [ ] **Step 5: Remove MySQL/EF packages from csproj**

```bash
dotnet remove backend/src/PrmDashboard.TenantService/PrmDashboard.TenantService.csproj package Pomelo.EntityFrameworkCore.MySql
dotnet remove backend/src/PrmDashboard.TenantService/PrmDashboard.TenantService.csproj package Microsoft.EntityFrameworkCore
dotnet remove backend/src/PrmDashboard.TenantService/PrmDashboard.TenantService.csproj package MySqlConnector
```

Expected: each command succeeds or prints a benign warning if the package wasn't a direct reference.

- [ ] **Step 6: Remove the `<EmbeddedResource>` line from csproj**

Read the current csproj:

```bash
cat backend/src/PrmDashboard.TenantService/PrmDashboard.TenantService.csproj
```

Find and delete the `<ItemGroup>` block containing:

```xml
<ItemGroup>
    <EmbeddedResource Include="Schema\Migrations\*.sql" />
</ItemGroup>
```

Use the Edit tool to remove the entire `<ItemGroup>`. If the block contains only that one element, delete the whole `<ItemGroup>`. If the block contains other elements, delete only the `<EmbeddedResource>` line.

- [ ] **Step 7: Update `appsettings.Development.json`**

Read the file:

```bash
cat backend/src/PrmDashboard.TenantService/appsettings.Development.json
```

Replace the `ConnectionStrings` block with a `DataPath` entry. Preserve all other settings (Logging, Cors, Jwt if present — and add a Jwt block with dev-placeholder values if the file has none, matching the Phase 3b precedent so `dotnet run` works locally without env vars).

Target file:

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Debug",
      "Microsoft.AspNetCore": "Information"
    }
  },
  "DataPath": "../../../data",
  "Jwt": {
    "Secret": "dev-secret-do-not-use-in-production-this-is-a-long-string-for-hs256",
    "Issuer": "prm-dashboard",
    "Audience": "prm-dashboard-client"
  },
  "Cors": {
    "AllowedOrigins": [
      "http://localhost:4200",
      "http://aeroground.localhost:4200",
      "http://skyserve.localhost:4200",
      "http://globalprm.localhost:4200"
    ]
  }
}
```

If the file already has a `Jwt` block, preserve its values. If not, use the placeholder above.

- [ ] **Step 8: Build full solution — must succeed**

```bash
dotnet build backend/PrmDashboard.sln
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`. If you see compile errors citing `MasterDbContext` or `SchemaMigrator`, something still references them — grep the TenantService directory.

- [ ] **Step 9: Grep-verify the swap is complete**

```bash
grep -rE "MySqlConnector|Pomelo|EntityFrameworkCore|MasterDbContext|SchemaMigrator" backend/src/PrmDashboard.TenantService --include="*.cs" --include="*.csproj" --include="*.json" 2>/dev/null || echo "TenantService source is clean"
```

Expected: `TenantService source is clean`.

- [ ] **Step 10: Run tests — must pass**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --nologo --verbosity minimal
```

Expected: `Passed: 83` (86 after Task 1 minus 3 deleted SchemaMigratorFilenameTests).

- [ ] **Step 11: Commit**

```bash
git add backend/src/PrmDashboard.TenantService/Program.cs
git add backend/src/PrmDashboard.TenantService/PrmDashboard.TenantService.csproj
git add backend/src/PrmDashboard.TenantService/appsettings.Development.json
git add -u backend/src/PrmDashboard.TenantService/Schema
git add -u backend/src/PrmDashboard.TenantService/Data
git add -u backend/src/PrmDashboard.TenantService/Services/SchemaMigrator.cs
git add -u backend/tests/PrmDashboard.Tests/TenantService/SchemaMigratorFilenameTests.cs
git commit -m "chore(tenant): wire DuckDB, drop EF/MySQL + SchemaMigrator + embedded migrations"
```

The `-u` flag stages deletions (including untracked-delete of the empty folders).

---

### Task 4: Integration tests for `TenantResolutionService` against real Parquet

Exercises the three methods end-to-end with real Parquet fixtures. Same `IAsyncLifetime` pattern as Phase 3a/3b.

**Files:**
- Create: `backend/tests/PrmDashboard.Tests/TenantService/TenantResolutionServiceTests.cs`

- [ ] **Step 1: Write the test file**

Write `backend/tests/PrmDashboard.Tests/TenantService/TenantResolutionServiceTests.cs`:

```csharp
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using DuckDB.NET.Data;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using PrmDashboard.Shared.Data;
using PrmDashboard.TenantService.Services;
using Xunit;

namespace PrmDashboard.Tests.TenantService;

public class TenantResolutionServiceTests : IAsyncLifetime
{
    private string _tempRoot = "";
    private TenantResolutionService _sut = null!;

    // Fixture values
    private const int TenantId = 7;
    private const string ActiveSlug = "active";
    private const string InactiveSlug = "gone";
    private const string UnknownSlug = "ghost";
    private const int EmployeeWithAirports = 42;
    private const int EmployeeWithoutAirports = 43;
    private const int UnknownEmployeeId = 999;

    public async Task InitializeAsync()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), $"tenantres-test-{System.Guid.NewGuid():N}");
        var masterDir = Path.Combine(_tempRoot, "master");
        Directory.CreateDirectory(masterDir);
        var tenantsPath = Path.Combine(masterDir, "tenants.parquet");
        var airportsPath = Path.Combine(masterDir, "employee_airports.parquet");

        await using var setupConn = new DuckDBConnection("DataSource=:memory:");
        await setupConn.OpenAsync();

        // Two rows — one active, one inactive — so inactive-slug and unknown-slug scenarios
        // can both be exercised.
        await using (var cmd = setupConn.CreateCommand())
        {
            cmd.CommandText = $"""
                COPY (
                    SELECT {TenantId}::INTEGER AS id,
                           'Active Co'::VARCHAR AS name,
                           '{ActiveSlug}'::VARCHAR AS slug,
                           'mysql-host'::VARCHAR AS db_host,
                           3306::INTEGER AS db_port,
                           'active_db'::VARCHAR AS db_name,
                           'root'::VARCHAR AS db_user,
                           'rootpw'::VARCHAR AS db_password,
                           TRUE::BOOLEAN AS is_active,
                           TIMESTAMP '2026-01-01 00:00:00' AS created_at,
                           NULL::VARCHAR AS logo_url,
                           '#111111'::VARCHAR AS primary_color
                    UNION ALL
                    SELECT 99, 'Gone Co', '{InactiveSlug}',
                           'mysql-host', 3306, 'gone_db', 'root', 'rootpw',
                           FALSE, TIMESTAMP '2026-01-01 00:00:00', NULL, '#222222'
                ) TO '{tenantsPath.Replace("'", "''")}' (FORMAT 'parquet');
                """;
            await cmd.ExecuteNonQueryAsync();
        }

        await using (var cmd = setupConn.CreateCommand())
        {
            cmd.CommandText = $"""
                COPY (
                    SELECT 1::INTEGER AS id, {EmployeeWithAirports}::INTEGER AS employee_id,
                           'DEL'::VARCHAR AS airport_code, 'Delhi'::VARCHAR AS airport_name
                    UNION ALL
                    SELECT 2, {EmployeeWithAirports}, 'BOM', 'Mumbai'
                    UNION ALL
                    SELECT 3, 100, 'BLR', 'Bangalore'  -- belongs to some other employee
                ) TO '{airportsPath.Replace("'", "''")}' (FORMAT 'parquet');
                """;
            await cmd.ExecuteNonQueryAsync();
        }

        var options = Options.Create(new DataPathOptions { Root = _tempRoot, PoolSize = 4 });
        var duck = new DuckDbContext(options);
        var paths = new TenantParquetPaths(options);

        // TenantsLoader needs its StartAsync to populate the dict — call it manually.
        var loader = new TenantsLoader(duck, paths, NullLogger<TenantsLoader>.Instance);
        await loader.StartAsync(CancellationToken.None);

        _sut = new TenantResolutionService(
            duck,
            paths,
            loader,
            NullLogger<TenantResolutionService>.Instance);
    }

    public Task DisposeAsync()
    {
        try { Directory.Delete(_tempRoot, recursive: true); } catch { /* best-effort */ }
        return Task.CompletedTask;
    }

    // ---- GetConfigAsync ----

    [Fact]
    public async Task GetConfigAsync_KnownSlug_ReturnsConfig()
    {
        var result = await _sut.GetConfigAsync(ActiveSlug, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(TenantId, result!.Id);
        Assert.Equal("Active Co", result.Name);
        Assert.Equal(ActiveSlug, result.Slug);
        Assert.Null(result.LogoUrl);
        Assert.Equal("#111111", result.PrimaryColor);
    }

    [Fact]
    public async Task GetConfigAsync_UnknownSlug_ReturnsNull()
    {
        var result = await _sut.GetConfigAsync(UnknownSlug, CancellationToken.None);
        Assert.Null(result);
    }

    [Fact]
    public async Task GetConfigAsync_InactiveSlug_ReturnsNull()
    {
        // Inactive row is filtered at startup load
        var result = await _sut.GetConfigAsync(InactiveSlug, CancellationToken.None);
        Assert.Null(result);
    }

    // ---- ResolveAsync ----

    [Fact]
    public async Task ResolveAsync_KnownSlug_ReturnsDbConnectionFields()
    {
        var data = await _sut.ResolveAsync(ActiveSlug, CancellationToken.None);

        Assert.NotNull(data);
        Assert.Equal(TenantId, data!.Id);
        Assert.Equal(ActiveSlug, data.Slug);
        Assert.Equal("mysql-host", data.DbHost);
        Assert.Equal(3306, data.DbPort);
        Assert.Equal("active_db", data.DbName);
        Assert.Equal("root", data.DbUser);
        Assert.Equal("rootpw", data.DbPassword);
    }

    [Fact]
    public async Task ResolveAsync_UnknownSlug_ReturnsNull()
    {
        var data = await _sut.ResolveAsync(UnknownSlug, CancellationToken.None);
        Assert.Null(data);
    }

    [Fact]
    public async Task ResolveAsync_InactiveSlug_ReturnsNull()
    {
        var data = await _sut.ResolveAsync(InactiveSlug, CancellationToken.None);
        Assert.Null(data);
    }

    // ---- GetAirportsForEmployeeAsync ----

    [Fact]
    public async Task GetAirportsForEmployeeAsync_WithAirports_ReturnsList()
    {
        var airports = await _sut.GetAirportsForEmployeeAsync(EmployeeWithAirports, CancellationToken.None);

        Assert.Equal(2, airports.Count);
        Assert.Contains(airports, a => a.Code == "BOM" && a.Name == "Mumbai");
        Assert.Contains(airports, a => a.Code == "DEL" && a.Name == "Delhi");
    }

    [Fact]
    public async Task GetAirportsForEmployeeAsync_UnknownEmployee_ReturnsEmpty()
    {
        var airports = await _sut.GetAirportsForEmployeeAsync(UnknownEmployeeId, CancellationToken.None);
        Assert.Empty(airports);
    }
}
```

Note: fixture intentionally has no row for `EmployeeWithoutAirports` — the unknown-employee test covers the empty-list case. No separate empty-but-known-employee test is needed because the SQL query doesn't distinguish between them (both return zero rows).

- [ ] **Step 2: Run tests — must pass**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter "FullyQualifiedName~TenantResolutionServiceTests"
```

Expected: `Passed: 8`. Zero failures.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/PrmDashboard.Tests/TenantService/TenantResolutionServiceTests.cs
git commit -m "test(tenant): add TenantResolutionService integration tests"
```

---

### Task 5: Final verification (no commit)

- [ ] **Step 1: Full solution build**

```bash
dotnet build backend/PrmDashboard.sln --nologo
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`.

- [ ] **Step 2: Full test suite**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --nologo --verbosity minimal
```

Expected: **91 total, 0 failed.** Breakdown: 83 pre-existing (Phase 3b state) + 3 TenantsLoader + 8 TenantResolutionService - 3 deleted SchemaMigratorFilenameTests = 91.

- [ ] **Step 3: Confirm TenantService source clean**

```bash
grep -rE "MySqlConnector|Pomelo|EntityFrameworkCore|MasterDbContext|SchemaMigrator" backend/src/PrmDashboard.TenantService --include="*.cs" --include="*.csproj" --include="*.json" 2>/dev/null || echo "TenantService source is clean"
```

Expected: `TenantService source is clean`.

- [ ] **Step 4: Confirm no scope leakage into other services**

```bash
git diff --stat main..HEAD -- backend/src/PrmDashboard.AuthService backend/src/PrmDashboard.PrmService backend/src/PrmDashboard.Gateway backend/src/PrmDashboard.Shared
```

Expected: empty. Phase 3c only touches TenantService + tests + docs.

- [ ] **Step 5: Confirm PrmService's `TenantDbContextFactory` still calls `/resolve`**

```bash
grep -n "tenants/resolve" backend/src/PrmDashboard.PrmService/Data/TenantDbContextFactory.cs
```

Expected: the line `$"/api/tenants/resolve/{tenantSlug}"` still appears. Phase 3c preserves this inter-service contract.

- [ ] **Step 6: Confirm `Schema/` and `Data/` folders are gone**

```bash
ls backend/src/PrmDashboard.TenantService/Schema 2>/dev/null && echo "STILL EXISTS" || echo "Schema/ removed"
ls backend/src/PrmDashboard.TenantService/Data 2>/dev/null && echo "STILL EXISTS" || echo "Data/ removed"
```

Expected: `Schema/ removed` and `Data/ removed`.

- [ ] **Step 7: Confirm csproj clean**

```bash
grep -E "MySql|Pomelo|EntityFramework|EmbeddedResource" backend/src/PrmDashboard.TenantService/PrmDashboard.TenantService.csproj || echo "csproj is clean"
```

Expected: `csproj is clean`.

- [ ] **Step 8: Report**

No commit this task. Report build result, test tally, and verification command outputs.

---

## Success criteria (recap from spec)

- [x] No `MySqlConnector` / `Pomelo` / `EntityFrameworkCore` / `MasterDbContext` / `SchemaMigrator` references anywhere in `backend/src/PrmDashboard.TenantService/*.cs` or `*.csproj`
- [x] `Schema/`, `Data/`, `SchemaMigrator.cs`, `MasterDbContext.cs`, `SchemaMigratorFilenameTests.cs` all deleted
- [x] Three endpoints (`/config`, `/resolve/{slug}`, `/airports`) retain their DTOs, status codes, and auth requirements (controller unchanged)
- [x] PrmService's `TenantDbContextFactory` still calls `/resolve` and still opens MySQL via the returned fields (Phase 3d unwires it)
- [x] Solution builds 0/0; test count 91 (83 + 11 - 3 deleted)
- [x] No scope leakage into AuthService / PrmService / Gateway / Shared
