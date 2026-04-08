using Ocelot.DependencyInjection;
using Ocelot.Middleware;
using PrmDashboard.Gateway.Middleware;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.ConfigureKestrel(options =>
{
    options.ListenAnyIP(8080);
});

builder.Configuration.AddJsonFile("ocelot.json", optional: false, reloadOnChange: true);
builder.Services.AddOcelot(builder.Configuration);

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.SetIsOriginAllowed(_ => true)
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials();
    });
});

var app = builder.Build();

app.UseCors();

// Health endpoint before Ocelot (not routed through Ocelot)
app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "gateway" }));

app.UseTenantExtraction();

await app.UseOcelot();

// UseOcelot is terminal middleware — app.Run() is not needed
