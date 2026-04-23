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

var jwt = PrmDashboard.Shared.Extensions.JwtStartupValidator.ReadAndValidate(builder.Configuration, "tenant");
var jwtSecret = jwt.Secret;
var jwtIssuer = jwt.Issuer;
var jwtAudience = jwt.Audience;

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
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ClockSkew = TimeSpan.Zero
        };
    });

builder.Services.AddAuthorization();

// Tenant services
builder.Services.AddScoped<TenantResolutionService>();

// CORS — allowlist from config
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
if (allowedOrigins.Length == 0) Console.Error.WriteLine("[startup] WARN: Cors:AllowedOrigins is empty; cross-origin browser requests will fail. Set it via config or env (e.g. Cors__AllowedOrigins__0=http://localhost:4200).");
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
