using Microsoft.EntityFrameworkCore;
using PrmDashboard.AuthService.Data;

var builder = WebApplication.CreateBuilder(args);

// Bind to port 8080 inside the container
builder.WebHost.ConfigureKestrel(o => o.ListenAnyIP(8080));

// Services
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var connStr = builder.Configuration.GetConnectionString("MasterDb")
    ?? throw new InvalidOperationException("ConnectionStrings:MasterDb is required");

builder.Services.AddDbContext<MasterDbContext>(opt =>
    opt.UseMySql(connStr, new MySqlServerVersion(new Version(8, 0, 36))));

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "auth" }));
app.MapControllers();

app.Run();
