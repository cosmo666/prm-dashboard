using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using PrmDashboard.PrmService.Middleware;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.Logging;
using PrmDashboard.Shared.Middleware;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

builder.AddPrmSerilog(serviceName: "prm");

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

// DuckDB + Parquet data path
builder.Services.Configure<PrmDashboard.Shared.Data.DataPathOptions>(o =>
{
    o.Root = Environment.GetEnvironmentVariable("PRM_DATA_PATH")
             ?? builder.Configuration["DataPath"]
             ?? throw new InvalidOperationException(
                 "Data path required: set PRM_DATA_PATH env var or DataPath in appsettings.");

    o.PoolSize = builder.Configuration.GetValue<int?>("DataPath:PoolSize")
                 ?? PrmDashboard.Shared.Data.DataPathOptions.DefaultPoolSize;

    if (o.PoolSize < PrmDashboard.Shared.Data.DataPathOptions.MinPoolSize
        || o.PoolSize > PrmDashboard.Shared.Data.DataPathOptions.MaxPoolSize)
        throw new InvalidOperationException(
            $"DataPath:PoolSize out of range [{PrmDashboard.Shared.Data.DataPathOptions.MinPoolSize}, "
            + $"{PrmDashboard.Shared.Data.DataPathOptions.MaxPoolSize}]: {o.PoolSize}");
});

builder.Services.AddHostedService<PrmDashboard.Shared.Data.DataPathValidator>();
builder.Services.AddSingleton<PrmDashboard.Shared.Data.IDuckDbContext, PrmDashboard.Shared.Data.DuckDbContext>();
builder.Services.AddSingleton<PrmDashboard.Shared.Data.TenantParquetPaths>();

// PRM query services
builder.Services.AddScoped<KpiService>();
builder.Services.AddScoped<FilterService>();
builder.Services.AddScoped<TrendService>();
builder.Services.AddScoped<RankingService>();
builder.Services.AddScoped<BreakdownService>();
builder.Services.AddScoped<PerformanceService>();
builder.Services.AddScoped<RecordService>();

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

app.UseMiddleware<ExceptionHandlerMiddleware>();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<TenantSlugClaimCheckMiddleware>();
app.UseMiddleware<AirportAccessMiddleware>();

app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "prm" }));
app.MapControllers();

app.Run();
