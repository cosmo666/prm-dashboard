using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Ocelot.DependencyInjection;
using Ocelot.Middleware;
using PrmDashboard.Gateway.Middleware;
using PrmDashboard.Shared.Logging;
using PrmDashboard.Shared.Middleware;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

builder.AddPrmSerilog(serviceName: "gateway");

builder.WebHost.ConfigureKestrel(options =>
{
    options.ListenAnyIP(8080);
});

builder.Configuration.AddJsonFile("ocelot.json", optional: false, reloadOnChange: true);
builder.Services.AddOcelot(builder.Configuration);

// Fail-fast JWT config (length + placeholder check via shared validator)
var jwt = PrmDashboard.Shared.Extensions.JwtStartupValidator.ReadAndValidate(builder.Configuration, "gateway");
var jwtSecret = jwt.Secret;
var jwtIssuer = jwt.Issuer;
var jwtAudience = jwt.Audience;

builder.Services.AddAuthentication("Bearer")
    .AddJwtBearer("Bearer", options =>
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

app.UseMiddleware<CorrelationIdMiddleware>();
app.UseSerilogRequestLogging(opts =>
{
    opts.MessageTemplate =
        "HTTP {RequestMethod} {RequestPath} responded {StatusCode} in {Elapsed:0}ms [corr={CorrelationId}]";
});

app.UseCors();

// Health endpoint as a middleware branch — short-circuits BEFORE Ocelot so the
// catch-all upstream doesn't swallow /health and return 404.
app.MapWhen(ctx => ctx.Request.Path == "/health", branch =>
{
    branch.Run(async ctx =>
    {
        ctx.Response.StatusCode = 200;
        ctx.Response.ContentType = "application/json";
        await ctx.Response.WriteAsync("{\"status\":\"healthy\",\"service\":\"gateway\"}");
    });
});

// Swagger UI aggregator — renders the UI from the gateway and loads each service's
// OpenAPI document via the Ocelot-proxied JSON routes below. The SwaggerUI middleware
// only matches its own static asset paths (index.html, swagger-ui.css/js, etc.) so
// requests like /swagger/auth/swagger.json fall through to Ocelot for proxying.
app.UseSwaggerUI(options =>
{
    options.RoutePrefix = "swagger";
    options.SwaggerEndpoint("/swagger/auth/swagger.json", "Auth Service v1");
    options.SwaggerEndpoint("/swagger/tenant/swagger.json", "Tenant Service v1");
    options.SwaggerEndpoint("/swagger/prm/swagger.json", "PRM Service v1");
    options.DocumentTitle = "PRM Dashboard — API Explorer";
});

app.UseAuthentication();
app.UseAuthorization();
app.UseTenantExtraction();

await app.UseOcelot();

app.Run();
