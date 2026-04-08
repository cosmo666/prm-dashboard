# PRM Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-tenant PRM analytics dashboard with Angular 17+ frontend, .NET 8 microservice backend, MySQL databases, and Docker Compose infrastructure.

**Architecture:** 4 .NET 8 microservices (Gateway, Auth, Tenant, PRM) behind an Ocelot API Gateway. Angular 17+ SPA with Material 3, ECharts, NgRx Signal Store. MySQL 8.0 with 1 master DB + 3 tenant DBs. Docker Compose for local dev.

**Tech Stack:** .NET 8, ASP.NET Core, Ocelot, EF Core + Pomelo MySQL, BCrypt.Net, JWT | Angular 17+, Angular Material 3, ngx-echarts, NgRx Signal Store | MySQL 8.0, Docker Compose

**Spec:** `docs/superpowers/specs/2026-04-08-prm-dashboard-design.md`

---

## Phase 1: Infrastructure & Scaffolding

### Task 1: Docker Compose & MySQL Init Scripts

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `database/init/01-master-schema.sql`
- Create: `database/init/02-tenant-schema.sql`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
# .NET
bin/
obj/
*.user
*.suo
.vs/

# Angular
frontend/node_modules/
frontend/dist/
frontend/.angular/

# Environment
.env
*.db

# IDE
.idea/
.vscode/

# Docker
docker-data/

# Superpowers
.superpowers/
```

- [ ] **Step 2: Create `.env.example`**

```env
# MySQL
MYSQL_ROOT_PASSWORD=rootpassword
MYSQL_MASTER_DB=prm_master

# JWT
JWT_SECRET=your-256-bit-secret-key-change-in-production
JWT_ISSUER=prm-dashboard
JWT_AUDIENCE=prm-dashboard-client
JWT_ACCESS_TOKEN_MINUTES=15
JWT_REFRESH_TOKEN_DAYS=7

# Tenant DBs
TENANT1_DB=aeroground_db
TENANT2_DB=skyserve_db
TENANT3_DB=globalprm_db

# Service Ports
GATEWAY_PORT=5000
AUTH_PORT=5001
TENANT_PORT=5002
PRM_PORT=5003
```

- [ ] **Step 3: Create `database/init/01-master-schema.sql`**

```sql
CREATE DATABASE IF NOT EXISTS prm_master;
USE prm_master;

CREATE TABLE tenants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    db_host VARCHAR(255) NOT NULL DEFAULT 'mysql',
    db_port INT NOT NULL DEFAULT 3306,
    db_name VARCHAR(100) NOT NULL,
    db_user VARCHAR(100) NOT NULL DEFAULT 'root',
    db_password VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    logo_url VARCHAR(500) NULL,
    primary_color VARCHAR(7) NOT NULL DEFAULT '#2563eb'
);

CREATE TABLE employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    UNIQUE KEY uq_tenant_username (tenant_id, username)
);

CREATE TABLE employee_airports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    airport_code VARCHAR(10) NOT NULL,
    airport_name VARCHAR(100) NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    UNIQUE KEY uq_employee_airport (employee_id, airport_code)
);

CREATE TABLE refresh_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    token VARCHAR(500) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
);
```

- [ ] **Step 4: Create `database/init/02-tenant-schema.sql`**

```sql
-- Creates all 3 tenant databases with identical schema

CREATE DATABASE IF NOT EXISTS aeroground_db;
CREATE DATABASE IF NOT EXISTS skyserve_db;
CREATE DATABASE IF NOT EXISTS globalprm_db;

-- Template applied to each tenant DB
DELIMITER //
CREATE PROCEDURE create_tenant_tables(IN db_name VARCHAR(100))
BEGIN
    SET @sql = CONCAT('
        CREATE TABLE IF NOT EXISTS ', db_name, '.prm_services (
            row_id INT AUTO_INCREMENT PRIMARY KEY,
            id INT NOT NULL,
            flight VARCHAR(20) NOT NULL,
            flight_number INT NOT NULL,
            agent_name VARCHAR(100) NULL,
            agent_no VARCHAR(20) NULL,
            passenger_name VARCHAR(200) NOT NULL,
            prm_agent_type VARCHAR(20) NOT NULL DEFAULT ''SELF'',
            start_time INT NOT NULL,
            paused_at INT NULL,
            end_time INT NOT NULL,
            service VARCHAR(20) NOT NULL,
            seat_number VARCHAR(10) NULL,
            scanned_by VARCHAR(50) NULL,
            scanned_by_user VARCHAR(100) NULL,
            remarks TEXT NULL,
            pos_location VARCHAR(50) NULL,
            no_show_flag VARCHAR(5) NULL,
            loc_name VARCHAR(10) NOT NULL,
            arrival VARCHAR(10) NULL,
            airline VARCHAR(10) NOT NULL,
            emp_type VARCHAR(20) NULL DEFAULT ''Employee'',
            departure VARCHAR(10) NULL,
            requested INT NOT NULL DEFAULT 0,
            service_date DATE NOT NULL,
            INDEX idx_loc_date (loc_name, service_date),
            INDEX idx_date_range (service_date, loc_name, airline),
            INDEX idx_id (id),
            INDEX idx_airline (airline),
            INDEX idx_service (service),
            INDEX idx_agent (agent_no),
            INDEX idx_prm_type (prm_agent_type)
        )');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
END //
DELIMITER ;

CALL create_tenant_tables('aeroground_db');
CALL create_tenant_tables('skyserve_db');
CALL create_tenant_tables('globalprm_db');

DROP PROCEDURE create_tenant_tables;
```

- [ ] **Step 5: Create `docker-compose.yml`**

```yaml
version: "3.8"

services:
  mysql:
    image: mysql:8.0
    container_name: prm-mysql
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-rootpassword}
    ports:
      - "3306:3306"
    volumes:
      - ./database/init:/docker-entrypoint-initdb.d
      - mysql-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  gateway:
    build:
      context: ./backend
      dockerfile: src/PrmDashboard.Gateway/Dockerfile
    container_name: prm-gateway
    ports:
      - "${GATEWAY_PORT:-5000}:8080"
    environment:
      - ASPNETCORE_ENVIRONMENT=Development
      - AUTH_SERVICE_URL=http://auth:8080
      - TENANT_SERVICE_URL=http://tenant:8080
      - PRM_SERVICE_URL=http://prm:8080
    depends_on:
      auth:
        condition: service_started
      tenant:
        condition: service_started
      prm:
        condition: service_started

  auth:
    build:
      context: ./backend
      dockerfile: src/PrmDashboard.AuthService/Dockerfile
    container_name: prm-auth
    environment:
      - ASPNETCORE_ENVIRONMENT=Development
      - ConnectionStrings__MasterDb=Server=mysql;Port=3306;Database=prm_master;User=root;Password=${MYSQL_ROOT_PASSWORD:-rootpassword}
      - Jwt__Secret=${JWT_SECRET:-your-256-bit-secret-key-change-in-production}
      - Jwt__Issuer=${JWT_ISSUER:-prm-dashboard}
      - Jwt__Audience=${JWT_AUDIENCE:-prm-dashboard-client}
      - Jwt__AccessTokenMinutes=${JWT_ACCESS_TOKEN_MINUTES:-15}
      - Jwt__RefreshTokenDays=${JWT_REFRESH_TOKEN_DAYS:-7}
    depends_on:
      mysql:
        condition: service_healthy

  tenant:
    build:
      context: ./backend
      dockerfile: src/PrmDashboard.TenantService/Dockerfile
    container_name: prm-tenant
    environment:
      - ASPNETCORE_ENVIRONMENT=Development
      - ConnectionStrings__MasterDb=Server=mysql;Port=3306;Database=prm_master;User=root;Password=${MYSQL_ROOT_PASSWORD:-rootpassword}
    depends_on:
      mysql:
        condition: service_healthy

  prm:
    build:
      context: ./backend
      dockerfile: src/PrmDashboard.PrmService/Dockerfile
    container_name: prm-prm
    environment:
      - ASPNETCORE_ENVIRONMENT=Development
      - ConnectionStrings__MasterDb=Server=mysql;Port=3306;Database=prm_master;User=root;Password=${MYSQL_ROOT_PASSWORD:-rootpassword}
      - TenantServiceUrl=http://tenant:8080
    depends_on:
      mysql:
        condition: service_healthy
      tenant:
        condition: service_started

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: prm-frontend
    ports:
      - "4200:80"
    depends_on:
      - gateway

volumes:
  mysql-data:
```

- [ ] **Step 6: Verify MySQL starts with schema**

```bash
cp .env.example .env
docker compose up mysql -d
# Wait for healthy
docker compose exec mysql mysql -uroot -prootpassword -e "SHOW DATABASES;"
# Expected: prm_master, aeroground_db, skyserve_db, globalprm_db
docker compose exec mysql mysql -uroot -prootpassword prm_master -e "SHOW TABLES;"
# Expected: tenants, employees, employee_airports, refresh_tokens
docker compose down
```

- [ ] **Step 7: Commit**

```bash
git init
git add .gitignore .env.example docker-compose.yml database/
git commit -m "feat: docker compose infrastructure with MySQL schema"
```

---

### Task 2: .NET Solution & Shared Library

**Files:**
- Create: `backend/PrmDashboard.sln`
- Create: `backend/src/PrmDashboard.Shared/PrmDashboard.Shared.csproj`
- Create: `backend/src/PrmDashboard.Shared/Models/Tenant.cs`
- Create: `backend/src/PrmDashboard.Shared/Models/Employee.cs`
- Create: `backend/src/PrmDashboard.Shared/Models/EmployeeAirport.cs`
- Create: `backend/src/PrmDashboard.Shared/Models/RefreshToken.cs`
- Create: `backend/src/PrmDashboard.Shared/Models/PrmService.cs`
- Create: `backend/src/PrmDashboard.Shared/DTOs/AuthDtos.cs`
- Create: `backend/src/PrmDashboard.Shared/DTOs/TenantDtos.cs`
- Create: `backend/src/PrmDashboard.Shared/DTOs/PrmFilterParams.cs`
- Create: `backend/src/PrmDashboard.Shared/DTOs/KpiDtos.cs`
- Create: `backend/src/PrmDashboard.Shared/DTOs/TrendDtos.cs`
- Create: `backend/src/PrmDashboard.Shared/DTOs/RankingDtos.cs`
- Create: `backend/src/PrmDashboard.Shared/DTOs/BreakdownDtos.cs`
- Create: `backend/src/PrmDashboard.Shared/DTOs/PerformanceDtos.cs`
- Create: `backend/src/PrmDashboard.Shared/DTOs/RecordDtos.cs`
- Create: `backend/src/PrmDashboard.Shared/Extensions/TimeHelpers.cs`

- [ ] **Step 1: Create .NET solution and Shared project**

```bash
cd backend
dotnet new sln -n PrmDashboard
mkdir -p src/PrmDashboard.Shared
cd src/PrmDashboard.Shared
dotnet new classlib
dotnet add package Pomelo.EntityFrameworkCore.MySql --version 8.0.2
dotnet add package Microsoft.EntityFrameworkCore --version 8.0.11
cd ../..
dotnet sln add src/PrmDashboard.Shared/PrmDashboard.Shared.csproj
```

- [ ] **Step 2: Create EF Core entity models**

`backend/src/PrmDashboard.Shared/Models/Tenant.cs`:
```csharp
namespace PrmDashboard.Shared.Models;

public class Tenant
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string DbHost { get; set; } = "mysql";
    public int DbPort { get; set; } = 3306;
    public string DbName { get; set; } = string.Empty;
    public string DbUser { get; set; } = "root";
    public string DbPassword { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string? LogoUrl { get; set; }
    public string PrimaryColor { get; set; } = "#2563eb";

    public ICollection<Employee> Employees { get; set; } = [];

    public string GetConnectionString() =>
        $"Server={DbHost};Port={DbPort};Database={DbName};User={DbUser};Password={DbPassword}";
}
```

`backend/src/PrmDashboard.Shared/Models/Employee.cs`:
```csharp
namespace PrmDashboard.Shared.Models;

public class Employee
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastLogin { get; set; }

    public Tenant Tenant { get; set; } = null!;
    public ICollection<EmployeeAirport> Airports { get; set; } = [];
    public ICollection<RefreshToken> RefreshTokens { get; set; } = [];
}
```

`backend/src/PrmDashboard.Shared/Models/EmployeeAirport.cs`:
```csharp
namespace PrmDashboard.Shared.Models;

public class EmployeeAirport
{
    public int Id { get; set; }
    public int EmployeeId { get; set; }
    public string AirportCode { get; set; } = string.Empty;
    public string AirportName { get; set; } = string.Empty;

    public Employee Employee { get; set; } = null!;
}
```

`backend/src/PrmDashboard.Shared/Models/RefreshToken.cs`:
```csharp
namespace PrmDashboard.Shared.Models;

public class RefreshToken
{
    public int Id { get; set; }
    public int EmployeeId { get; set; }
    public string Token { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool Revoked { get; set; }

    public Employee Employee { get; set; } = null!;
}
```

`backend/src/PrmDashboard.Shared/Models/PrmServiceRecord.cs`:
```csharp
namespace PrmDashboard.Shared.Models;

public class PrmServiceRecord
{
    public int RowId { get; set; }
    public int Id { get; set; }
    public string Flight { get; set; } = string.Empty;
    public int FlightNumber { get; set; }
    public string? AgentName { get; set; }
    public string? AgentNo { get; set; }
    public string PassengerName { get; set; } = string.Empty;
    public string PrmAgentType { get; set; } = "SELF";
    public int StartTime { get; set; }
    public int? PausedAt { get; set; }
    public int EndTime { get; set; }
    public string Service { get; set; } = string.Empty;
    public string? SeatNumber { get; set; }
    public string? ScannedBy { get; set; }
    public string? ScannedByUser { get; set; }
    public string? Remarks { get; set; }
    public string? PosLocation { get; set; }
    public string? NoShowFlag { get; set; }
    public string LocName { get; set; } = string.Empty;
    public string? Arrival { get; set; }
    public string Airline { get; set; } = string.Empty;
    public string? EmpType { get; set; } = "Employee";
    public string? Departure { get; set; }
    public int Requested { get; set; }
    public DateOnly ServiceDate { get; set; }
}
```

- [ ] **Step 3: Create shared DTOs**

`backend/src/PrmDashboard.Shared/DTOs/AuthDtos.cs`:
```csharp
namespace PrmDashboard.Shared.DTOs;

public record LoginRequest(string Username, string Password);

public record LoginResponse(string AccessToken, EmployeeDto Employee);

public record RefreshResponse(string AccessToken);

public record EmployeeDto(
    int Id,
    string DisplayName,
    string? Email,
    List<AirportDto> Airports
);

public record AirportDto(string Code, string Name);
```

`backend/src/PrmDashboard.Shared/DTOs/TenantDtos.cs`:
```csharp
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
    string DbConnectionString
);
```

`backend/src/PrmDashboard.Shared/DTOs/PrmFilterParams.cs`:
```csharp
namespace PrmDashboard.Shared.DTOs;

public class PrmFilterParams
{
    public string Airport { get; set; } = string.Empty;
    public DateOnly? DateFrom { get; set; }
    public DateOnly? DateTo { get; set; }
    public string? Airline { get; set; }
    public string? Service { get; set; }
    public string? HandledBy { get; set; }
    public string? Flight { get; set; }
    public string? AgentNo { get; set; }
}
```

`backend/src/PrmDashboard.Shared/DTOs/KpiDtos.cs`:
```csharp
namespace PrmDashboard.Shared.DTOs;

public record KpiSummaryResponse(
    int TotalPrm,
    int TotalPrmPrevPeriod,
    int TotalAgents,
    int AgentsSelf,
    int AgentsOutsourced,
    double AvgServicesPerAgentPerDay,
    double AvgServicesPrevPeriod,
    double AvgDurationMinutes,
    double AvgDurationPrevPeriod,
    double FulfillmentPct
);

public record HandlingDistributionResponse(
    List<string> Labels,
    List<int> Values
);

public record RequestedVsProvidedKpiResponse(
    int TotalRequested,
    int TotalProvided,
    int ProvidedAgainstRequested,
    double FulfillmentRate,
    double WalkUpRate
);
```

`backend/src/PrmDashboard.Shared/DTOs/TrendDtos.cs`:
```csharp
namespace PrmDashboard.Shared.DTOs;

public record DailyTrendResponse(
    List<string> Dates,
    List<int> Values,
    double Average
);

public record MonthlyTrendResponse(
    List<string> Months,
    List<int> Values
);

public record HourlyHeatmapResponse(
    List<string> Days,
    List<int> Hours,
    List<List<int>> Values
);

public record RequestedVsProvidedTrendResponse(
    List<string> Dates,
    List<int> Provided,
    List<int> Requested
);
```

`backend/src/PrmDashboard.Shared/DTOs/RankingDtos.cs`:
```csharp
namespace PrmDashboard.Shared.DTOs;

public record RankingItem(string Label, int Count, double Percentage);

public record AgentRankingItem(
    int Rank,
    string AgentNo,
    string AgentName,
    int PrmCount,
    double AvgDurationMinutes,
    string TopService,
    string TopAirline,
    int DaysActive
);

public record RankingsResponse(List<RankingItem> Items);

public record AgentRankingsResponse(List<AgentRankingItem> Items);
```

`backend/src/PrmDashboard.Shared/DTOs/BreakdownDtos.cs`:
```csharp
namespace PrmDashboard.Shared.DTOs;

public record ServiceTypeMatrixRow(
    string MonthYear,
    Dictionary<string, int> ServiceCounts,
    int Total
);

public record ServiceTypeMatrixResponse(
    List<string> ServiceTypes,
    List<ServiceTypeMatrixRow> Rows
);

public record SankeyNode(string Name, int Value);
public record SankeyLink(string Source, string Target, int Value);

public record SankeyResponse(
    List<SankeyNode> Nodes,
    List<SankeyLink> Links
);

public record BreakdownItem(string Label, int Count, double Percentage);

public record BreakdownResponse(List<BreakdownItem> Items);

public record RouteItem(string Departure, string Arrival, int Count, double Percentage);

public record RouteBreakdownResponse(List<RouteItem> Items);
```

`backend/src/PrmDashboard.Shared/DTOs/PerformanceDtos.cs`:
```csharp
namespace PrmDashboard.Shared.DTOs;

public record DurationStatsResponse(
    double Min,
    double Max,
    double Avg,
    double Median,
    double P90,
    double P95
);

public record DurationBucket(string Label, int Count, double Percentage);

public record DurationDistributionResponse(
    List<DurationBucket> Buckets,
    double P50,
    double P90,
    double Avg
);

public record NoShowItem(string Airline, int Total, int NoShows, double Rate);

public record NoShowResponse(List<NoShowItem> Items);

public record PauseAnalysisResponse(
    int TotalPaused,
    double PauseRate,
    double AvgPauseDurationMinutes,
    List<BreakdownItem> ByServiceType
);
```

`backend/src/PrmDashboard.Shared/DTOs/RecordDtos.cs`:
```csharp
namespace PrmDashboard.Shared.DTOs;

public record PrmRecordDto(
    int RowId,
    int Id,
    string Flight,
    string? AgentName,
    string PassengerName,
    string PrmAgentType,
    int StartTime,
    int? PausedAt,
    int EndTime,
    string Service,
    string? SeatNumber,
    string? PosLocation,
    string? NoShowFlag,
    string LocName,
    string? Arrival,
    string Airline,
    string? Departure,
    int Requested,
    DateOnly ServiceDate
);

public record PaginatedResponse<T>(
    List<T> Items,
    int TotalCount,
    int Page,
    int PageSize,
    int TotalPages
);

public record FilterOptionsResponse(
    List<string> Airlines,
    List<string> Services,
    List<string> HandledBy,
    List<string> Flights,
    DateOnly? MinDate,
    DateOnly? MaxDate
);

public record PrmSegmentDto(
    int RowId,
    int StartTime,
    int? PausedAt,
    int EndTime,
    double ActiveMinutes
);
```

- [ ] **Step 4: Create time helper**

`backend/src/PrmDashboard.Shared/Extensions/TimeHelpers.cs`:
```csharp
namespace PrmDashboard.Shared.Extensions;

public static class TimeHelpers
{
    /// <summary>
    /// Converts HHMM integer (e.g., 237 = 02:37) to minutes since midnight.
    /// </summary>
    public static double HhmmToMinutes(int hhmm)
    {
        int hours = hhmm / 100;
        int minutes = hhmm % 100;
        return hours * 60 + minutes;
    }

    /// <summary>
    /// Calculates active service duration in minutes for a single row.
    /// If paused: returns start→pause duration. If not paused: returns start→end.
    /// </summary>
    public static double CalculateActiveMinutes(int startTime, int? pausedAt, int endTime)
    {
        if (pausedAt.HasValue)
            return HhmmToMinutes(pausedAt.Value) - HhmmToMinutes(startTime);

        return HhmmToMinutes(endTime) - HhmmToMinutes(startTime);
    }

    /// <summary>
    /// Formats HHMM integer to "HH:MM" string.
    /// </summary>
    public static string FormatHhmm(int hhmm)
    {
        int hours = hhmm / 100;
        int minutes = hhmm % 100;
        return $"{hours:D2}:{minutes:D2}";
    }
}
```

- [ ] **Step 5: Build and verify**

```bash
cd backend
dotnet build
# Expected: Build succeeded. 0 Error(s)
```

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "feat: .NET solution with shared library, models, and DTOs"
```

---

## Phase 2: Auth Service

### Task 3: Auth Service — Project Setup & DbContext

**Files:**
- Create: `backend/src/PrmDashboard.AuthService/PrmDashboard.AuthService.csproj`
- Create: `backend/src/PrmDashboard.AuthService/Program.cs`
- Create: `backend/src/PrmDashboard.AuthService/Data/MasterDbContext.cs`
- Create: `backend/src/PrmDashboard.AuthService/appsettings.json`
- Create: `backend/src/PrmDashboard.AuthService/appsettings.Development.json`
- Create: `backend/src/PrmDashboard.AuthService/Dockerfile`

- [ ] **Step 1: Create Auth Service project**

```bash
cd backend/src
mkdir PrmDashboard.AuthService
cd PrmDashboard.AuthService
dotnet new webapi --no-https
dotnet add reference ../PrmDashboard.Shared/PrmDashboard.Shared.csproj
dotnet add package Pomelo.EntityFrameworkCore.MySql --version 8.0.2
dotnet add package BCrypt.Net-Next --version 4.0.3
dotnet add package Microsoft.AspNetCore.Authentication.JwtBearer --version 8.0.11
cd ../..
dotnet sln add src/PrmDashboard.AuthService/PrmDashboard.AuthService.csproj
```

- [ ] **Step 2: Create MasterDbContext**

`backend/src/PrmDashboard.AuthService/Data/MasterDbContext.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using PrmDashboard.Shared.Models;

namespace PrmDashboard.AuthService.Data;

public class MasterDbContext : DbContext
{
    public MasterDbContext(DbContextOptions<MasterDbContext> options) : base(options) { }

    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<Employee> Employees => Set<Employee>();
    public DbSet<EmployeeAirport> EmployeeAirports => Set<EmployeeAirport>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Tenant>(e =>
        {
            e.ToTable("tenants");
            e.HasIndex(t => t.Slug).IsUnique();
        });

        modelBuilder.Entity<Employee>(e =>
        {
            e.ToTable("employees");
            e.HasIndex(emp => new { emp.TenantId, emp.Username }).IsUnique();
            e.HasOne(emp => emp.Tenant).WithMany(t => t.Employees).HasForeignKey(emp => emp.TenantId);
        });

        modelBuilder.Entity<EmployeeAirport>(e =>
        {
            e.ToTable("employee_airports");
            e.HasIndex(ea => new { ea.EmployeeId, ea.AirportCode }).IsUnique();
            e.HasOne(ea => ea.Employee).WithMany(emp => emp.Airports).HasForeignKey(ea => ea.EmployeeId);
        });

        modelBuilder.Entity<RefreshToken>(e =>
        {
            e.ToTable("refresh_tokens");
            e.HasIndex(rt => rt.Token).IsUnique();
            e.HasOne(rt => rt.Employee).WithMany(emp => emp.RefreshTokens).HasForeignKey(rt => rt.EmployeeId);
        });

        // Map PascalCase properties to snake_case columns
        foreach (var entity in modelBuilder.Model.GetEntityTypes())
        {
            foreach (var property in entity.GetProperties())
            {
                property.SetColumnName(ToSnakeCase(property.Name));
            }
        }
    }

    private static string ToSnakeCase(string name)
    {
        return string.Concat(name.Select((c, i) =>
            i > 0 && char.IsUpper(c) ? "_" + c : c.ToString()
        )).ToLower();
    }
}
```

- [ ] **Step 3: Create appsettings**

`backend/src/PrmDashboard.AuthService/appsettings.json`:
```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "Jwt": {
    "Secret": "your-256-bit-secret-key-change-in-production",
    "Issuer": "prm-dashboard",
    "Audience": "prm-dashboard-client",
    "AccessTokenMinutes": 15,
    "RefreshTokenDays": 7
  }
}
```

`backend/src/PrmDashboard.AuthService/appsettings.Development.json`:
```json
{
  "ConnectionStrings": {
    "MasterDb": "Server=localhost;Port=3306;Database=prm_master;User=root;Password=rootpassword"
  }
}
```

- [ ] **Step 4: Create Dockerfile**

`backend/src/PrmDashboard.AuthService/Dockerfile`:
```dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY src/PrmDashboard.Shared/PrmDashboard.Shared.csproj src/PrmDashboard.Shared/
COPY src/PrmDashboard.AuthService/PrmDashboard.AuthService.csproj src/PrmDashboard.AuthService/
RUN dotnet restore src/PrmDashboard.AuthService/PrmDashboard.AuthService.csproj
COPY src/PrmDashboard.Shared/ src/PrmDashboard.Shared/
COPY src/PrmDashboard.AuthService/ src/PrmDashboard.AuthService/
RUN dotnet publish src/PrmDashboard.AuthService/PrmDashboard.AuthService.csproj -c Release -o /app/publish

FROM base AS final
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "PrmDashboard.AuthService.dll"]
```

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat(auth): auth service project setup with DbContext and Dockerfile"
```

---

### Task 4: Auth Service — JWT & Login

**Files:**
- Create: `backend/src/PrmDashboard.AuthService/Services/JwtService.cs`
- Create: `backend/src/PrmDashboard.AuthService/Services/AuthService.cs`
- Create: `backend/src/PrmDashboard.AuthService/Controllers/AuthController.cs`
- Modify: `backend/src/PrmDashboard.AuthService/Program.cs`

- [ ] **Step 1: Create JwtService**

`backend/src/PrmDashboard.AuthService/Services/JwtService.cs`:
```csharp
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using PrmDashboard.Shared.Models;

namespace PrmDashboard.AuthService.Services;

public class JwtService
{
    private readonly IConfiguration _config;

    public JwtService(IConfiguration config)
    {
        _config = config;
    }

    public string GenerateAccessToken(Employee employee, string tenantSlug)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Secret"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var airportCodes = employee.Airports.Select(a => a.AirportCode).ToList();

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, employee.Id.ToString()),
            new("tenant_id", employee.TenantId.ToString()),
            new("tenant_slug", tenantSlug),
            new("name", employee.DisplayName),
            new("airports", string.Join(",", airportCodes)),
        };

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(int.Parse(_config["Jwt:AccessTokenMinutes"] ?? "15")),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public string GenerateRefreshToken()
    {
        var randomBytes = new byte[64];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomBytes);
        return Convert.ToBase64String(randomBytes);
    }

    public ClaimsPrincipal? ValidateToken(string token)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Secret"]!));
        var handler = new JwtSecurityTokenHandler();

        try
        {
            return handler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = _config["Jwt:Issuer"],
                ValidAudience = _config["Jwt:Audience"],
                IssuerSigningKey = key
            }, out _);
        }
        catch
        {
            return null;
        }
    }
}
```

- [ ] **Step 2: Create AuthService**

`backend/src/PrmDashboard.AuthService/Services/AuthenticationService.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using PrmDashboard.AuthService.Data;
using PrmDashboard.Shared.DTOs;
using PrmDashboard.Shared.Models;

namespace PrmDashboard.AuthService.Services;

public class AuthenticationService
{
    private readonly MasterDbContext _db;
    private readonly JwtService _jwt;
    private readonly IConfiguration _config;

    public AuthenticationService(MasterDbContext db, JwtService jwt, IConfiguration config)
    {
        _db = db;
        _jwt = jwt;
        _config = config;
    }

    public async Task<LoginResponse?> LoginAsync(string tenantSlug, LoginRequest request)
    {
        var tenant = await _db.Tenants.FirstOrDefaultAsync(t => t.Slug == tenantSlug && t.IsActive);
        if (tenant == null) return null;

        var employee = await _db.Employees
            .Include(e => e.Airports)
            .FirstOrDefaultAsync(e => e.TenantId == tenant.Id && e.Username == request.Username && e.IsActive);

        if (employee == null || !BCrypt.Net.BCrypt.Verify(request.Password, employee.PasswordHash))
            return null;

        employee.LastLogin = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var accessToken = _jwt.GenerateAccessToken(employee, tenantSlug);

        var employeeDto = new EmployeeDto(
            employee.Id,
            employee.DisplayName,
            employee.Email,
            employee.Airports.Select(a => new AirportDto(a.AirportCode, a.AirportName)).ToList()
        );

        return new LoginResponse(accessToken, employeeDto);
    }

    public async Task<RefreshToken> CreateRefreshTokenAsync(int employeeId)
    {
        var refreshDays = int.Parse(_config["Jwt:RefreshTokenDays"] ?? "7");
        var refreshToken = new RefreshToken
        {
            EmployeeId = employeeId,
            Token = _jwt.GenerateRefreshToken(),
            ExpiresAt = DateTime.UtcNow.AddDays(refreshDays)
        };

        _db.RefreshTokens.Add(refreshToken);
        await _db.SaveChangesAsync();
        return refreshToken;
    }

    public async Task<(string? accessToken, RefreshToken? newRefreshToken)> RefreshAsync(string token)
    {
        var existing = await _db.RefreshTokens
            .Include(rt => rt.Employee)
                .ThenInclude(e => e.Airports)
            .Include(rt => rt.Employee)
                .ThenInclude(e => e.Tenant)
            .FirstOrDefaultAsync(rt => rt.Token == token && !rt.Revoked && rt.ExpiresAt > DateTime.UtcNow);

        if (existing == null) return (null, null);

        // Revoke old token
        existing.Revoked = true;

        // Create new tokens
        var accessToken = _jwt.GenerateAccessToken(existing.Employee, existing.Employee.Tenant.Slug);
        var newRefresh = await CreateRefreshTokenAsync(existing.EmployeeId);

        return (accessToken, newRefresh);
    }

    public async Task RevokeRefreshTokenAsync(string token)
    {
        var existing = await _db.RefreshTokens.FirstOrDefaultAsync(rt => rt.Token == token);
        if (existing != null)
        {
            existing.Revoked = true;
            await _db.SaveChangesAsync();
        }
    }

    public async Task<EmployeeDto?> GetProfileAsync(int employeeId)
    {
        var employee = await _db.Employees
            .Include(e => e.Airports)
            .FirstOrDefaultAsync(e => e.Id == employeeId && e.IsActive);

        if (employee == null) return null;

        return new EmployeeDto(
            employee.Id,
            employee.DisplayName,
            employee.Email,
            employee.Airports.Select(a => new AirportDto(a.AirportCode, a.AirportName)).ToList()
        );
    }
}
```

- [ ] **Step 3: Create AuthController**

`backend/src/PrmDashboard.AuthService/Controllers/AuthController.cs`:
```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PrmDashboard.AuthService.Services;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.AuthService.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly AuthenticationService _authService;

    public AuthController(AuthenticationService authService)
    {
        _authService = authService;
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var tenantSlug = Request.Headers["X-Tenant-Slug"].FirstOrDefault();
        if (string.IsNullOrEmpty(tenantSlug))
            return BadRequest(new { error = "Missing X-Tenant-Slug header" });

        var result = await _authService.LoginAsync(tenantSlug, request);
        if (result == null)
            return Unauthorized(new { error = "Invalid credentials" });

        // Create refresh token and set as httpOnly cookie
        var refreshToken = await _authService.CreateRefreshTokenAsync(result.Employee.Id);
        SetRefreshTokenCookie(refreshToken.Token, refreshToken.ExpiresAt);

        return Ok(result);
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh()
    {
        var token = Request.Cookies["refreshToken"];
        if (string.IsNullOrEmpty(token))
            return Unauthorized(new { error = "No refresh token" });

        var (accessToken, newRefreshToken) = await _authService.RefreshAsync(token);
        if (accessToken == null || newRefreshToken == null)
            return Unauthorized(new { error = "Invalid or expired refresh token" });

        SetRefreshTokenCookie(newRefreshToken.Token, newRefreshToken.ExpiresAt);
        return Ok(new RefreshResponse(accessToken));
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        var token = Request.Cookies["refreshToken"];
        if (!string.IsNullOrEmpty(token))
        {
            await _authService.RevokeRefreshTokenAsync(token);
            Response.Cookies.Delete("refreshToken");
        }
        return Ok(new { message = "Logged out" });
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var employeeIdClaim = User.FindFirst("sub")?.Value;
        if (employeeIdClaim == null || !int.TryParse(employeeIdClaim, out var employeeId))
            return Unauthorized();

        var profile = await _authService.GetProfileAsync(employeeId);
        if (profile == null) return NotFound();

        return Ok(profile);
    }

    private void SetRefreshTokenCookie(string token, DateTime expires)
    {
        Response.Cookies.Append("refreshToken", token, new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Strict,
            Expires = expires
        });
    }
}
```

- [ ] **Step 4: Configure Program.cs**

`backend/src/PrmDashboard.AuthService/Program.cs`:
```csharp
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using PrmDashboard.AuthService.Data;
using PrmDashboard.AuthService.Services;

var builder = WebApplication.CreateBuilder(args);

// Database
var connectionString = builder.Configuration.GetConnectionString("MasterDb");
builder.Services.AddDbContext<MasterDbContext>(options =>
    options.UseMySql(connectionString, ServerVersion.AutoDetect(connectionString)));

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
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Secret"]!))
        };
    });

builder.Services.AddAuthorization();

// Services
builder.Services.AddSingleton<JwtService>();
builder.Services.AddScoped<AuthenticationService>();

builder.Services.AddControllers();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.SetIsOriginAllowed(_ => true)
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials());
});

var app = builder.Build();

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
```

- [ ] **Step 5: Build and verify**

```bash
cd backend
dotnet build
# Expected: Build succeeded. 0 Error(s)
```

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "feat(auth): JWT authentication, login, refresh, logout, profile endpoints"
```

---

## Phase 3: Tenant Service

### Task 5: Tenant Service — Complete

> **Multi-tenant onboarding contract:** Task 5 must make it possible to onboard a new tenant at runtime by (1) attaching a new MySQL database — possibly on a different MySQL instance — and (2) inserting one row in `prm_master.tenants`. No code changes, no restarts, no manual schema work. This is enforced by a migration runner (`SchemaMigrator`) that auto-applies versioned SQL migrations against any tenant database on first use.

**Files:**
- Create: `backend/src/PrmDashboard.TenantService/PrmDashboard.TenantService.csproj`
- Create: `backend/src/PrmDashboard.TenantService/Program.cs`
- Create: `backend/src/PrmDashboard.TenantService/Data/MasterDbContext.cs`
- Create: `backend/src/PrmDashboard.TenantService/Services/TenantResolutionService.cs`
- Create: `backend/src/PrmDashboard.TenantService/Services/SchemaMigrator.cs`
- Create: `backend/src/PrmDashboard.TenantService/Schema/Migrations/001_create_prm_services.sql` (embedded resource)
- Create: `backend/src/PrmDashboard.TenantService/Controllers/TenantController.cs`
- Create: `backend/src/PrmDashboard.TenantService/appsettings.json`
- Create: `backend/src/PrmDashboard.TenantService/appsettings.Development.json`
- Create: `backend/src/PrmDashboard.TenantService/Dockerfile`

**Multi-tenant design notes:**
- `Tenant.GetConnectionString()` already supports arbitrary `db_host`/`db_port`/`db_name`/`db_user`/`db_password` — each tenant DB can live on a completely separate MySQL instance with different credentials. Nothing in the code assumes "same MySQL container".
- `SchemaMigrator` runs idempotent versioned migrations. Every time `EnsureTenantReady()` is called for a tenant (on cache miss), it connects to that tenant's DB, creates the `schema_migrations` tracker table if missing, diffs against the embedded migration files, and runs any unapplied ones inside a transaction.
- To add a new schema change in the future: drop a new file like `002_add_cost_center.sql` into `Schema/Migrations/`, commit, deploy. All existing and future tenants get it on next request. Never edit a committed migration file — always add a new one.
- Migration file naming: zero-padded 3-digit version + snake_case description, e.g., `001_create_prm_services.sql`, `002_add_cost_center.sql`. The runner sorts by filename and processes in order.

**Sub-task structure:**
Steps 1-7 build the original Tenant Service (project, DbContext, resolution service, controller, config, Dockerfile). **New Steps 8-10 add the migration runner** before the commit step.

- [ ] **Step 1: Create Tenant Service project**

```bash
cd backend/src
mkdir PrmDashboard.TenantService
cd PrmDashboard.TenantService
dotnet new webapi --no-https
dotnet add reference ../PrmDashboard.Shared/PrmDashboard.Shared.csproj
dotnet add package Pomelo.EntityFrameworkCore.MySql --version 8.0.2
dotnet add package Microsoft.AspNetCore.Authentication.JwtBearer --version 8.0.11
cd ../..
dotnet sln add src/PrmDashboard.TenantService/PrmDashboard.TenantService.csproj
```

- [ ] **Step 2: Create MasterDbContext (same as Auth but in Tenant namespace)**

`backend/src/PrmDashboard.TenantService/Data/MasterDbContext.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using PrmDashboard.Shared.Models;

namespace PrmDashboard.TenantService.Data;

public class MasterDbContext : DbContext
{
    public MasterDbContext(DbContextOptions<MasterDbContext> options) : base(options) { }

    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<Employee> Employees => Set<Employee>();
    public DbSet<EmployeeAirport> EmployeeAirports => Set<EmployeeAirport>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Tenant>(e => e.ToTable("tenants"));
        modelBuilder.Entity<Employee>(e =>
        {
            e.ToTable("employees");
            e.HasOne(emp => emp.Tenant).WithMany(t => t.Employees).HasForeignKey(emp => emp.TenantId);
        });
        modelBuilder.Entity<EmployeeAirport>(e =>
        {
            e.ToTable("employee_airports");
            e.HasOne(ea => ea.Employee).WithMany(emp => emp.Airports).HasForeignKey(ea => ea.EmployeeId);
        });

        foreach (var entity in modelBuilder.Model.GetEntityTypes())
            foreach (var property in entity.GetProperties())
                property.SetColumnName(string.Concat(property.Name.Select((c, i) =>
                    i > 0 && char.IsUpper(c) ? "_" + c : c.ToString())).ToLower());
    }
}
```

- [ ] **Step 3: Create TenantResolutionService**

`backend/src/PrmDashboard.TenantService/Services/TenantResolutionService.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using PrmDashboard.Shared.DTOs;
using PrmDashboard.TenantService.Data;

namespace PrmDashboard.TenantService.Services;

public class TenantResolutionService
{
    private readonly MasterDbContext _db;
    private readonly IMemoryCache _cache;

    public TenantResolutionService(MasterDbContext db, IMemoryCache cache)
    {
        _db = db;
        _cache = cache;
    }

    public async Task<TenantConfigResponse?> GetConfigAsync(string slug)
    {
        var cacheKey = $"tenant_config_{slug}";
        if (_cache.TryGetValue(cacheKey, out TenantConfigResponse? cached))
            return cached;

        var tenant = await _db.Tenants.FirstOrDefaultAsync(t => t.Slug == slug && t.IsActive);
        if (tenant == null) return null;

        var result = new TenantConfigResponse(tenant.Id, tenant.Name, tenant.Slug, tenant.LogoUrl, tenant.PrimaryColor);
        _cache.Set(cacheKey, result, TimeSpan.FromMinutes(10));
        return result;
    }

    public async Task<TenantResolveResponse?> ResolveAsync(string slug)
    {
        var cacheKey = $"tenant_resolve_{slug}";
        if (_cache.TryGetValue(cacheKey, out TenantResolveResponse? cached))
            return cached;

        var tenant = await _db.Tenants.FirstOrDefaultAsync(t => t.Slug == slug && t.IsActive);
        if (tenant == null) return null;

        var result = new TenantResolveResponse(tenant.Id, tenant.GetConnectionString());
        _cache.Set(cacheKey, result, TimeSpan.FromMinutes(5));
        return result;
    }

    public async Task<List<AirportDto>> GetAirportsForEmployeeAsync(int employeeId)
    {
        return await _db.EmployeeAirports
            .Where(ea => ea.EmployeeId == employeeId)
            .Select(ea => new AirportDto(ea.AirportCode, ea.AirportName))
            .ToListAsync();
    }
}
```

- [ ] **Step 4: Create TenantController**

`backend/src/PrmDashboard.TenantService/Controllers/TenantController.cs`:
```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PrmDashboard.TenantService.Services;

namespace PrmDashboard.TenantService.Controllers;

[ApiController]
[Route("api/tenants")]
public class TenantController : ControllerBase
{
    private readonly TenantResolutionService _tenantService;

    public TenantController(TenantResolutionService tenantService)
    {
        _tenantService = tenantService;
    }

    [HttpGet("config")]
    public async Task<IActionResult> GetConfig([FromQuery] string slug)
    {
        if (string.IsNullOrEmpty(slug))
            return BadRequest(new { error = "slug is required" });

        var config = await _tenantService.GetConfigAsync(slug);
        if (config == null) return NotFound(new { error = "Tenant not found" });

        return Ok(config);
    }

    [HttpGet("resolve/{slug}")]
    public async Task<IActionResult> Resolve(string slug)
    {
        // Internal endpoint — in production, restrict to service-to-service only
        var result = await _tenantService.ResolveAsync(slug);
        if (result == null) return NotFound(new { error = "Tenant not found" });

        return Ok(result);
    }

    [Authorize]
    [HttpGet("airports")]
    public async Task<IActionResult> GetAirports()
    {
        var employeeIdClaim = User.FindFirst("sub")?.Value;
        if (employeeIdClaim == null || !int.TryParse(employeeIdClaim, out var employeeId))
            return Unauthorized();

        var airports = await _tenantService.GetAirportsForEmployeeAsync(employeeId);
        return Ok(airports);
    }
}
```

- [ ] **Step 5: Configure Program.cs**

`backend/src/PrmDashboard.TenantService/Program.cs`:
```csharp
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using PrmDashboard.TenantService.Data;
using PrmDashboard.TenantService.Services;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("MasterDb");
builder.Services.AddDbContext<MasterDbContext>(options =>
    options.UseMySql(connectionString, ServerVersion.AutoDetect(connectionString)));

builder.Services.AddMemoryCache();
builder.Services.AddScoped<TenantResolutionService>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Secret"]!))
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddControllers();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.SetIsOriginAllowed(_ => true).AllowAnyMethod().AllowAnyHeader().AllowCredentials());
});

var app = builder.Build();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();
```

- [ ] **Step 6: Create appsettings + Dockerfile (same pattern as Auth)**

Copy appsettings.json and appsettings.Development.json from AuthService, identical content.

`backend/src/PrmDashboard.TenantService/Dockerfile`:
```dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY src/PrmDashboard.Shared/PrmDashboard.Shared.csproj src/PrmDashboard.Shared/
COPY src/PrmDashboard.TenantService/PrmDashboard.TenantService.csproj src/PrmDashboard.TenantService/
RUN dotnet restore src/PrmDashboard.TenantService/PrmDashboard.TenantService.csproj
COPY src/PrmDashboard.Shared/ src/PrmDashboard.Shared/
COPY src/PrmDashboard.TenantService/ src/PrmDashboard.TenantService/
RUN dotnet publish src/PrmDashboard.TenantService/PrmDashboard.TenantService.csproj -c Release -o /app/publish

FROM base AS final
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "PrmDashboard.TenantService.dll"]
```

- [ ] **Step 7: Extract initial migration file**

Create `backend/src/PrmDashboard.TenantService/Schema/Migrations/001_create_prm_services.sql`. This is the canonical DDL for tenant databases — the same schema as `database/init/02-tenant-schema.sql` but stripped of the `DELIMITER` / stored-procedure wrapper since we apply it to one DB at a time.

```sql
-- Tenant schema v001 — creates the prm_services table and its indexes
-- Idempotent: CREATE TABLE IF NOT EXISTS is safe against existing tenants

CREATE TABLE IF NOT EXISTS prm_services (
    row_id INT AUTO_INCREMENT PRIMARY KEY,
    id INT NOT NULL,  -- source-system PRM service ID; can repeat across rows when paused/resumed (spec §3.3)
    flight VARCHAR(20) NOT NULL,
    flight_number INT NOT NULL,
    agent_name VARCHAR(100) NULL,
    agent_no VARCHAR(20) NULL,
    passenger_name VARCHAR(200) NOT NULL,
    prm_agent_type VARCHAR(20) NOT NULL DEFAULT 'SELF',
    start_time INT NOT NULL,
    paused_at INT NULL,
    end_time INT NOT NULL,
    service VARCHAR(20) NOT NULL,
    seat_number VARCHAR(10) NULL,
    scanned_by VARCHAR(50) NULL,
    scanned_by_user VARCHAR(100) NULL,
    remarks TEXT NULL,
    pos_location VARCHAR(50) NULL,
    no_show_flag VARCHAR(5) NULL,
    loc_name VARCHAR(10) NOT NULL,
    arrival VARCHAR(10) NULL,
    airline VARCHAR(10) NOT NULL,
    emp_type VARCHAR(20) NULL DEFAULT 'Employee',
    departure VARCHAR(10) NULL,
    requested INT NOT NULL DEFAULT 0,
    service_date DATE NOT NULL,
    INDEX idx_loc_date (loc_name, service_date),
    INDEX idx_date_range (service_date, loc_name, airline),
    INDEX idx_id (id),
    INDEX idx_airline (airline),
    INDEX idx_service (service),
    INDEX idx_agent (agent_no),
    INDEX idx_prm_type (prm_agent_type)
);
```

Mark the file as embedded in the `.csproj`:

```xml
<ItemGroup>
  <EmbeddedResource Include="Schema\Migrations\*.sql" />
</ItemGroup>
```

- [ ] **Step 8: Create SchemaMigrator**

`backend/src/PrmDashboard.TenantService/Services/SchemaMigrator.cs`:

```csharp
using System.Reflection;
using MySqlConnector;

namespace PrmDashboard.TenantService.Services;

/// <summary>
/// Applies versioned SQL migrations to a tenant database.
/// Reads migration files from embedded resources (Schema/Migrations/*.sql),
/// tracks applied versions in a per-tenant `schema_migrations` table, and
/// runs any missing migrations in order inside a transaction.
///
/// Idempotent: safe to call on every cache miss. A tenant DB that already has
/// all migrations applied is a no-op (~5ms for the tracker table read).
///
/// Thread-safety: guarded by a semaphore keyed on connection string so two
/// concurrent first-hit requests for the same tenant don't race.
/// </summary>
public class SchemaMigrator
{
    private readonly ILogger<SchemaMigrator> _logger;
    private static readonly SemaphoreSlim _migrationLock = new(1, 1);
    private const string TrackerTableDdl = @"
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version VARCHAR(10) PRIMARY KEY,
            applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )";

    public SchemaMigrator(ILogger<SchemaMigrator> logger)
    {
        _logger = logger;
    }

    public async Task RunAsync(string connectionString, CancellationToken ct = default)
    {
        await _migrationLock.WaitAsync(ct);
        try
        {
            await using var conn = new MySqlConnection(connectionString);
            await conn.OpenAsync(ct);

            // 1. Ensure tracker table exists
            await using (var cmd = new MySqlCommand(TrackerTableDdl, conn))
                await cmd.ExecuteNonQueryAsync(ct);

            // 2. Read applied versions
            var applied = new HashSet<string>();
            await using (var cmd = new MySqlCommand("SELECT version FROM schema_migrations", conn))
            await using (var reader = await cmd.ExecuteReaderAsync(ct))
            {
                while (await reader.ReadAsync(ct))
                    applied.Add(reader.GetString(0));
            }

            // 3. Discover migrations from embedded resources
            var migrations = LoadEmbeddedMigrations();

            // 4. Apply missing ones in order
            foreach (var (version, ddl) in migrations)
            {
                if (applied.Contains(version)) continue;

                _logger.LogInformation("Applying migration {Version} to tenant DB (host={Host})",
                    version, conn.DataSource);

                await using var tx = await conn.BeginTransactionAsync(ct);
                try
                {
                    await using (var cmd = new MySqlCommand(ddl, conn, tx))
                        await cmd.ExecuteNonQueryAsync(ct);

                    await using (var insert = new MySqlCommand(
                        "INSERT INTO schema_migrations (version) VALUES (@v)", conn, tx))
                    {
                        insert.Parameters.AddWithValue("@v", version);
                        await insert.ExecuteNonQueryAsync(ct);
                    }

                    await tx.CommitAsync(ct);
                    _logger.LogInformation("Migration {Version} applied successfully", version);
                }
                catch (Exception ex)
                {
                    await tx.RollbackAsync(ct);
                    _logger.LogError(ex, "Migration {Version} failed", version);
                    throw;
                }
            }
        }
        finally
        {
            _migrationLock.Release();
        }
    }

    private static IReadOnlyList<(string Version, string Ddl)> LoadEmbeddedMigrations()
    {
        var asm = Assembly.GetExecutingAssembly();
        var prefix = $"{asm.GetName().Name}.Schema.Migrations.";
        var names = asm.GetManifestResourceNames()
            .Where(n => n.StartsWith(prefix) && n.EndsWith(".sql"))
            .OrderBy(n => n, StringComparer.Ordinal)
            .ToList();

        var result = new List<(string, string)>();
        foreach (var name in names)
        {
            // Filename: 001_create_prm_services.sql → version "001"
            var fileName = name.Substring(prefix.Length);
            var version = fileName.Split('_')[0];

            using var stream = asm.GetManifestResourceStream(name)!;
            using var reader = new StreamReader(stream);
            var ddl = reader.ReadToEnd();
            result.Add((version, ddl));
        }
        return result;
    }
}
```

Add the `MySqlConnector` package (Pomelo's underlying driver — lighter than pulling EF Core for raw SQL):

```bash
cd backend/src/PrmDashboard.TenantService
dotnet add package MySqlConnector --version 2.3.7
```

- [ ] **Step 9: Wire SchemaMigrator into TenantResolutionService**

Modify `TenantResolutionService.cs` to call `SchemaMigrator.RunAsync()` on every cache miss, **before** returning the connection string.

Add constructor dependency:
```csharp
public TenantResolutionService(
    MasterDbContext db,
    IMemoryCache cache,
    SchemaMigrator migrator,       // ← new
    ILogger<TenantResolutionService> logger)
{
    _db = db;
    _cache = cache;
    _migrator = migrator;
    _logger = logger;
}
```

Modify the `ResolveAsync` method (or whatever the equivalent is in the Task 5 step-5 scaffold) so that after decrypting the connection string and before caching/returning it:

```csharp
public async Task<Tenant?> ResolveAsync(string slug, CancellationToken ct = default)
{
    if (_cache.TryGetValue<Tenant>($"tenant:{slug}", out var cached))
        return cached;

    var tenant = await _db.Tenants
        .Include(t => t.Employees)
        .FirstOrDefaultAsync(t => t.Slug == slug && t.IsActive, ct);

    if (tenant is null) return null;

    // Decrypt password if needed (PLAINTEXT: bootstrap convention from Task 4)
    tenant.DbPassword = DecryptOrBootstrap(tenant.DbPassword);

    // Ensure the tenant database has the latest schema before anyone tries to query it.
    // Idempotent — no-op for already-migrated tenants (~5ms), runs missing migrations for new ones.
    var connStr = tenant.GetConnectionString();
    await _migrator.RunAsync(connStr, ct);

    _cache.Set($"tenant:{slug}", tenant, TimeSpan.FromMinutes(5));
    return tenant;
}
```

Register SchemaMigrator in `Program.cs`:
```csharp
builder.Services.AddSingleton<SchemaMigrator>();
```

- [ ] **Step 10: Build and commit**

```bash
cd backend && dotnet build
git add backend/
git -c user.email="claude@anthropic.com" -c user.name="Claude Code" commit -m "feat(tenant): tenant resolution with runtime schema migrator

- Resolve tenant by slug, decrypt DB credentials from master DB
- SchemaMigrator runs versioned embedded migrations on cache miss
- Supports runtime tenant onboarding: attach a new DB + INSERT a tenant
  row and the schema bootstraps automatically on first request
- Each tenant DB can live on a different MySQL instance

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push origin main
```

---

## Phase 4: PRM Service

### Task 6: PRM Service — Project Setup & Tenant DB Connection

**Files:**
- Create: `backend/src/PrmDashboard.PrmService/PrmDashboard.PrmService.csproj`
- Create: `backend/src/PrmDashboard.PrmService/Program.cs`
- Create: `backend/src/PrmDashboard.PrmService/Data/TenantDbContext.cs`
- Create: `backend/src/PrmDashboard.PrmService/Data/TenantDbContextFactory.cs`
- Create: `backend/src/PrmDashboard.PrmService/Middleware/AirportAccessMiddleware.cs`
- Create: `backend/src/PrmDashboard.PrmService/appsettings.json`
- Create: `backend/src/PrmDashboard.PrmService/appsettings.Development.json`
- Create: `backend/src/PrmDashboard.PrmService/Dockerfile`

- [ ] **Step 1: Create PRM Service project**

```bash
cd backend/src
mkdir PrmDashboard.PrmService
cd PrmDashboard.PrmService
dotnet new webapi --no-https
dotnet add reference ../PrmDashboard.Shared/PrmDashboard.Shared.csproj
dotnet add package Pomelo.EntityFrameworkCore.MySql --version 8.0.2
dotnet add package Microsoft.AspNetCore.Authentication.JwtBearer --version 8.0.11
cd ../..
dotnet sln add src/PrmDashboard.PrmService/PrmDashboard.PrmService.csproj
```

- [ ] **Step 2: Create TenantDbContext**

`backend/src/PrmDashboard.PrmService/Data/TenantDbContext.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using PrmDashboard.Shared.Models;

namespace PrmDashboard.PrmService.Data;

public class TenantDbContext : DbContext
{
    public TenantDbContext(DbContextOptions<TenantDbContext> options) : base(options) { }

    public DbSet<PrmServiceRecord> PrmServices => Set<PrmServiceRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PrmServiceRecord>(e =>
        {
            e.ToTable("prm_services");
            e.HasKey(p => p.RowId);
            e.Property(p => p.RowId).HasColumnName("row_id");
            e.Property(p => p.Id).HasColumnName("id");
            e.Property(p => p.Flight).HasColumnName("flight");
            e.Property(p => p.FlightNumber).HasColumnName("flight_number");
            e.Property(p => p.AgentName).HasColumnName("agent_name");
            e.Property(p => p.AgentNo).HasColumnName("agent_no");
            e.Property(p => p.PassengerName).HasColumnName("passenger_name");
            e.Property(p => p.PrmAgentType).HasColumnName("prm_agent_type");
            e.Property(p => p.StartTime).HasColumnName("start_time");
            e.Property(p => p.PausedAt).HasColumnName("paused_at");
            e.Property(p => p.EndTime).HasColumnName("end_time");
            e.Property(p => p.Service).HasColumnName("service");
            e.Property(p => p.SeatNumber).HasColumnName("seat_number");
            e.Property(p => p.ScannedBy).HasColumnName("scanned_by");
            e.Property(p => p.ScannedByUser).HasColumnName("scanned_by_user");
            e.Property(p => p.Remarks).HasColumnName("remarks");
            e.Property(p => p.PosLocation).HasColumnName("pos_location");
            e.Property(p => p.NoShowFlag).HasColumnName("no_show_flag");
            e.Property(p => p.LocName).HasColumnName("loc_name");
            e.Property(p => p.Arrival).HasColumnName("arrival");
            e.Property(p => p.Airline).HasColumnName("airline");
            e.Property(p => p.EmpType).HasColumnName("emp_type");
            e.Property(p => p.Departure).HasColumnName("departure");
            e.Property(p => p.Requested).HasColumnName("requested");
            e.Property(p => p.ServiceDate).HasColumnName("service_date");
        });
    }
}
```

- [ ] **Step 3: Create TenantDbContextFactory**

`backend/src/PrmDashboard.PrmService/Data/TenantDbContextFactory.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace PrmDashboard.PrmService.Data;

public class TenantDbContextFactory
{
    private readonly IMemoryCache _cache;
    private readonly HttpClient _httpClient;
    private readonly ILogger<TenantDbContextFactory> _logger;

    public TenantDbContextFactory(IMemoryCache cache, HttpClient httpClient, ILogger<TenantDbContextFactory> logger)
    {
        _cache = cache;
        _httpClient = httpClient;
        _logger = logger;
    }

    public async Task<TenantDbContext> CreateAsync(string tenantSlug)
    {
        var cacheKey = $"tenant_conn_{tenantSlug}";

        if (!_cache.TryGetValue(cacheKey, out string? connectionString))
        {
            var response = await _httpClient.GetAsync($"/api/tenants/resolve/{tenantSlug}");
            response.EnsureSuccessStatusCode();

            var result = await response.Content.ReadFromJsonAsync<TenantResolveResult>();
            connectionString = result!.DbConnectionString;

            _cache.Set(cacheKey, connectionString, TimeSpan.FromMinutes(5));
            _logger.LogInformation("Resolved DB connection for tenant {Slug}", tenantSlug);
        }

        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseMySql(connectionString!, ServerVersion.AutoDetect(connectionString!))
            .Options;

        return new TenantDbContext(options);
    }

    private record TenantResolveResult(int TenantId, string DbConnectionString);
}
```

- [ ] **Step 4: Create AirportAccessMiddleware**

`backend/src/PrmDashboard.PrmService/Middleware/AirportAccessMiddleware.cs`:
```csharp
namespace PrmDashboard.PrmService.Middleware;

public class AirportAccessMiddleware
{
    private readonly RequestDelegate _next;

    public AirportAccessMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Only check PRM endpoints that require airport param
        if (!context.Request.Path.StartsWithSegments("/api/prm"))
        {
            await _next(context);
            return;
        }

        var airportParam = context.Request.Query["airport"].FirstOrDefault();
        if (string.IsNullOrEmpty(airportParam))
        {
            context.Response.StatusCode = 400;
            await context.Response.WriteAsJsonAsync(new { error = "airport parameter is required" });
            return;
        }

        var airportsClaim = context.User.FindFirst("airports")?.Value;
        if (string.IsNullOrEmpty(airportsClaim))
        {
            context.Response.StatusCode = 403;
            await context.Response.WriteAsJsonAsync(new { error = "No airport access" });
            return;
        }

        var allowedAirports = airportsClaim.Split(',');
        if (!allowedAirports.Contains(airportParam, StringComparer.OrdinalIgnoreCase))
        {
            context.Response.StatusCode = 403;
            await context.Response.WriteAsJsonAsync(new { error = $"No access to airport {airportParam}" });
            return;
        }

        await _next(context);
    }
}
```

- [ ] **Step 5: Configure Program.cs**

`backend/src/PrmDashboard.PrmService/Program.cs`:
```csharp
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using PrmDashboard.PrmService.Data;
using PrmDashboard.PrmService.Middleware;
using PrmDashboard.PrmService.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddMemoryCache();

// HttpClient for Tenant Service
builder.Services.AddHttpClient<TenantDbContextFactory>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["TenantServiceUrl"] ?? "http://localhost:5002");
});

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Secret"]!))
        };
    });

builder.Services.AddAuthorization();

// PRM Services
builder.Services.AddScoped<KpiService>();
builder.Services.AddScoped<TrendService>();
builder.Services.AddScoped<RankingService>();
builder.Services.AddScoped<BreakdownService>();
builder.Services.AddScoped<PerformanceService>();
builder.Services.AddScoped<RecordService>();

builder.Services.AddControllers();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.SetIsOriginAllowed(_ => true).AllowAnyMethod().AllowAnyHeader().AllowCredentials());
});

var app = builder.Build();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<AirportAccessMiddleware>();
app.MapControllers();
app.Run();
```

- [ ] **Step 6: Create appsettings + Dockerfile, build, commit**

appsettings.Development.json — add `TenantServiceUrl`:
```json
{
  "ConnectionStrings": {
    "MasterDb": "Server=localhost;Port=3306;Database=prm_master;User=root;Password=rootpassword"
  },
  "TenantServiceUrl": "http://localhost:5002",
  "Jwt": {
    "Secret": "your-256-bit-secret-key-change-in-production",
    "Issuer": "prm-dashboard",
    "Audience": "prm-dashboard-client"
  }
}
```

Dockerfile follows same pattern as Auth/Tenant (replace service name).

```bash
cd backend && dotnet build
git add backend/
git commit -m "feat(prm): PRM service setup with tenant DB factory and airport middleware"
```

---

### Task 7: PRM Service — KPI & Filter Endpoints

**Files:**
- Create: `backend/src/PrmDashboard.PrmService/Services/BaseQueryService.cs`
- Create: `backend/src/PrmDashboard.PrmService/Services/KpiService.cs`
- Create: `backend/src/PrmDashboard.PrmService/Services/FilterService.cs`
- Create: `backend/src/PrmDashboard.PrmService/Controllers/KpisController.cs`
- Create: `backend/src/PrmDashboard.PrmService/Controllers/FiltersController.cs`

- [ ] **Step 1: Create BaseQueryService with shared filtering logic**

`backend/src/PrmDashboard.PrmService/Services/BaseQueryService.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using PrmDashboard.PrmService.Data;
using PrmDashboard.Shared.DTOs;
using PrmDashboard.Shared.Models;

namespace PrmDashboard.PrmService.Services;

public abstract class BaseQueryService
{
    protected readonly TenantDbContextFactory _factory;

    protected BaseQueryService(TenantDbContextFactory factory)
    {
        _factory = factory;
    }

    protected IQueryable<PrmServiceRecord> ApplyFilters(TenantDbContext db, PrmFilterParams filters)
    {
        var query = db.PrmServices.AsNoTracking()
            .Where(p => p.LocName == filters.Airport);

        if (filters.DateFrom.HasValue)
            query = query.Where(p => p.ServiceDate >= filters.DateFrom.Value);
        if (filters.DateTo.HasValue)
            query = query.Where(p => p.ServiceDate <= filters.DateTo.Value);
        if (!string.IsNullOrEmpty(filters.Airline))
            query = query.Where(p => p.Airline == filters.Airline);
        if (!string.IsNullOrEmpty(filters.Service))
            query = query.Where(p => p.Service == filters.Service);
        if (!string.IsNullOrEmpty(filters.HandledBy))
            query = query.Where(p => p.PrmAgentType == filters.HandledBy);
        if (!string.IsNullOrEmpty(filters.Flight))
            query = query.Where(p => p.Flight == filters.Flight);
        if (!string.IsNullOrEmpty(filters.AgentNo))
            query = query.Where(p => p.AgentNo == filters.AgentNo);

        return query;
    }

    protected static DateOnly GetPrevPeriodStart(DateOnly from, DateOnly to)
    {
        var days = to.DayNumber - from.DayNumber;
        return from.AddDays(-(days + 1));
    }
}
```

- [ ] **Step 2: Create KpiService**

`backend/src/PrmDashboard.PrmService/Services/KpiService.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using PrmDashboard.PrmService.Data;
using PrmDashboard.Shared.DTOs;
using PrmDashboard.Shared.Extensions;

namespace PrmDashboard.PrmService.Services;

public class KpiService : BaseQueryService
{
    public KpiService(TenantDbContextFactory factory) : base(factory) { }

    public async Task<KpiSummaryResponse> GetSummaryAsync(string tenantSlug, PrmFilterParams filters)
    {
        await using var db = await _factory.CreateAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        var rows = await query.ToListAsync();

        // Dedup by ID for counts
        var uniqueIds = rows.Select(r => r.Id).Distinct().Count();
        var agentsSelf = rows.Where(r => r.PrmAgentType == "SELF").Select(r => r.AgentNo).Distinct().Count();
        var agentsOutsourced = rows.Where(r => r.PrmAgentType == "OUTSOURCED").Select(r => r.AgentNo).Distinct().Count();
        var totalAgents = agentsSelf + agentsOutsourced;

        // Duration calculation with dedup
        var durationsByService = rows.GroupBy(r => r.Id)
            .Select(g => g.Sum(r => TimeHelpers.CalculateActiveMinutes(r.StartTime, r.PausedAt, r.EndTime)))
            .ToList();
        var avgDuration = durationsByService.Count > 0 ? durationsByService.Average() : 0;

        // Days in period
        var days = (filters.DateTo?.DayNumber - filters.DateFrom?.DayNumber + 1) ?? 30;
        var avgPerAgentPerDay = totalAgents > 0 && days > 0 ? (double)uniqueIds / totalAgents / days : 0;

        // Fulfillment
        var totalRequested = rows.GroupBy(r => r.Id).Sum(g => g.First().Requested);
        var fulfillmentPct = totalRequested > 0 ? (double)uniqueIds / totalRequested * 100 : 100;

        // Previous period
        var prevFrom = filters.DateFrom.HasValue && filters.DateTo.HasValue
            ? GetPrevPeriodStart(filters.DateFrom.Value, filters.DateTo.Value)
            : (DateOnly?)null;
        var prevTo = filters.DateFrom?.AddDays(-1);

        int prevPrm = 0;
        double prevAvgPerAgent = 0;
        double prevAvgDuration = 0;
        if (prevFrom.HasValue && prevTo.HasValue)
        {
            var prevFilters = new PrmFilterParams
            {
                Airport = filters.Airport,
                DateFrom = prevFrom,
                DateTo = prevTo
            };
            var prevRows = await ApplyFilters(db, prevFilters).ToListAsync();
            prevPrm = prevRows.Select(r => r.Id).Distinct().Count();
            var prevAgents = prevRows.Select(r => r.AgentNo).Distinct().Count();
            var prevDays = prevTo.Value.DayNumber - prevFrom.Value.DayNumber + 1;
            prevAvgPerAgent = prevAgents > 0 && prevDays > 0 ? (double)prevPrm / prevAgents / prevDays : 0;
            var prevDurations = prevRows.GroupBy(r => r.Id)
                .Select(g => g.Sum(r => TimeHelpers.CalculateActiveMinutes(r.StartTime, r.PausedAt, r.EndTime)))
                .ToList();
            prevAvgDuration = prevDurations.Count > 0 ? prevDurations.Average() : 0;
        }

        return new KpiSummaryResponse(
            uniqueIds, prevPrm, totalAgents, agentsSelf, agentsOutsourced,
            Math.Round(avgPerAgentPerDay, 1), Math.Round(prevAvgPerAgent, 1),
            Math.Round(avgDuration, 1), Math.Round(prevAvgDuration, 1),
            Math.Round(fulfillmentPct, 1)
        );
    }

    public async Task<HandlingDistributionResponse> GetHandlingDistributionAsync(string tenantSlug, PrmFilterParams filters)
    {
        await using var db = await _factory.CreateAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        // Dedup: take first row per ID for agent type
        var distribution = await query
            .GroupBy(r => r.Id)
            .Select(g => g.OrderBy(r => r.RowId).First().PrmAgentType)
            .GroupBy(t => t)
            .Select(g => new { Type = g.Key, Count = g.Count() })
            .ToListAsync();

        return new HandlingDistributionResponse(
            distribution.Select(d => d.Type).ToList(),
            distribution.Select(d => d.Count).ToList()
        );
    }

    public async Task<RequestedVsProvidedKpiResponse> GetRequestedVsProvidedAsync(string tenantSlug, PrmFilterParams filters)
    {
        await using var db = await _factory.CreateAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        var groups = await query.GroupBy(r => r.Id)
            .Select(g => new { g.Key, Requested = g.First().Requested })
            .ToListAsync();

        var totalProvided = groups.Count;
        var totalRequested = groups.Sum(g => g.Requested);
        var providedAgainstRequested = groups.Count(g => g.Requested > 0);
        var fulfillmentRate = totalRequested > 0 ? (double)providedAgainstRequested / totalRequested * 100 : 0;
        var walkUpRate = totalProvided > 0 ? (double)(totalProvided - providedAgainstRequested) / totalProvided * 100 : 0;

        return new RequestedVsProvidedKpiResponse(
            totalRequested, totalProvided, providedAgainstRequested,
            Math.Round(fulfillmentRate, 1), Math.Round(walkUpRate, 1)
        );
    }
}
```

- [ ] **Step 3: Create KpisController**

`backend/src/PrmDashboard.PrmService/Controllers/KpisController.cs`:
```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Controllers;

[Authorize]
[ApiController]
[Route("api/prm/kpis")]
public class KpisController : ControllerBase
{
    private readonly KpiService _kpiService;

    public KpisController(KpiService kpiService)
    {
        _kpiService = kpiService;
    }

    private string GetTenantSlug() => Request.Headers["X-Tenant-Slug"].FirstOrDefault() ?? "";

    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary([FromQuery] PrmFilterParams filters)
    {
        var result = await _kpiService.GetSummaryAsync(GetTenantSlug(), filters);
        return Ok(result);
    }

    [HttpGet("handling-distribution")]
    public async Task<IActionResult> GetHandlingDistribution([FromQuery] PrmFilterParams filters)
    {
        var result = await _kpiService.GetHandlingDistributionAsync(GetTenantSlug(), filters);
        return Ok(result);
    }

    [HttpGet("requested-vs-provided")]
    public async Task<IActionResult> GetRequestedVsProvided([FromQuery] PrmFilterParams filters)
    {
        var result = await _kpiService.GetRequestedVsProvidedAsync(GetTenantSlug(), filters);
        return Ok(result);
    }
}
```

- [ ] **Step 4: Create FilterService + Controller**

`backend/src/PrmDashboard.PrmService/Services/FilterService.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using PrmDashboard.PrmService.Data;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Services;

public class FilterService : BaseQueryService
{
    public FilterService(TenantDbContextFactory factory) : base(factory) { }

    public async Task<FilterOptionsResponse> GetOptionsAsync(string tenantSlug, string airport)
    {
        await using var db = await _factory.CreateAsync(tenantSlug);
        var query = db.PrmServices.AsNoTracking().Where(p => p.LocName == airport);

        var airlines = await query.Select(p => p.Airline).Distinct().OrderBy(a => a).ToListAsync();
        var services = await query.Select(p => p.Service).Distinct().OrderBy(s => s).ToListAsync();
        var handledBy = await query.Select(p => p.PrmAgentType).Distinct().OrderBy(h => h).ToListAsync();
        var flights = await query.Select(p => p.Flight).Distinct().OrderBy(f => f).ToListAsync();
        var minDate = await query.MinAsync(p => (DateOnly?)p.ServiceDate);
        var maxDate = await query.MaxAsync(p => (DateOnly?)p.ServiceDate);

        return new FilterOptionsResponse(airlines, services, handledBy, flights, minDate, maxDate);
    }
}
```

`backend/src/PrmDashboard.PrmService/Controllers/FiltersController.cs`:
```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PrmDashboard.PrmService.Services;

namespace PrmDashboard.PrmService.Controllers;

[Authorize]
[ApiController]
[Route("api/prm/filters")]
public class FiltersController : ControllerBase
{
    private readonly FilterService _filterService;

    public FiltersController(FilterService filterService)
    {
        _filterService = filterService;
    }

    [HttpGet("options")]
    public async Task<IActionResult> GetOptions([FromQuery] string airport)
    {
        var tenantSlug = Request.Headers["X-Tenant-Slug"].FirstOrDefault() ?? "";
        var result = await _filterService.GetOptionsAsync(tenantSlug, airport);
        return Ok(result);
    }
}
```

- [ ] **Step 5: Register FilterService in Program.cs, build, commit**

Add to Program.cs services:
```csharp
builder.Services.AddScoped<FilterService>();
```

```bash
cd backend && dotnet build
git add backend/
git commit -m "feat(prm): KPI summary, handling distribution, requested-vs-provided, filter options endpoints"
```

---

### Task 8: PRM Service — Trends, Rankings, Breakdowns, Performance, Records

**Files:**
- Create: `backend/src/PrmDashboard.PrmService/Services/TrendService.cs`
- Create: `backend/src/PrmDashboard.PrmService/Services/RankingService.cs`
- Create: `backend/src/PrmDashboard.PrmService/Services/BreakdownService.cs`
- Create: `backend/src/PrmDashboard.PrmService/Services/PerformanceService.cs`
- Create: `backend/src/PrmDashboard.PrmService/Services/RecordService.cs`
- Create: `backend/src/PrmDashboard.PrmService/Controllers/TrendsController.cs`
- Create: `backend/src/PrmDashboard.PrmService/Controllers/RankingsController.cs`
- Create: `backend/src/PrmDashboard.PrmService/Controllers/BreakdownsController.cs`
- Create: `backend/src/PrmDashboard.PrmService/Controllers/PerformanceController.cs`
- Create: `backend/src/PrmDashboard.PrmService/Controllers/RecordsController.cs`

This task creates the remaining 16 PRM endpoints. Each service follows the same pattern as KpiService: extend BaseQueryService, use TenantDbContextFactory, apply filters, return DTOs.

- [ ] **Step 1: Create TrendService**

`backend/src/PrmDashboard.PrmService/Services/TrendService.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using PrmDashboard.PrmService.Data;
using PrmDashboard.Shared.DTOs;
using PrmDashboard.Shared.Extensions;

namespace PrmDashboard.PrmService.Services;

public class TrendService : BaseQueryService
{
    public TrendService(TenantDbContextFactory factory) : base(factory) { }

    public async Task<DailyTrendResponse> GetDailyAsync(string tenantSlug, PrmFilterParams filters)
    {
        await using var db = await _factory.CreateAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        var daily = await query
            .GroupBy(r => r.ServiceDate)
            .Select(g => new { Date = g.Key, Count = g.Select(r => r.Id).Distinct().Count() })
            .OrderBy(d => d.Date)
            .ToListAsync();

        var dates = daily.Select(d => d.Date.ToString("yyyy-MM-dd")).ToList();
        var values = daily.Select(d => d.Count).ToList();
        var average = values.Count > 0 ? values.Average() : 0;

        return new DailyTrendResponse(dates, values, Math.Round(average, 1));
    }

    public async Task<MonthlyTrendResponse> GetMonthlyAsync(string tenantSlug, PrmFilterParams filters)
    {
        await using var db = await _factory.CreateAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        var monthly = await query
            .GroupBy(r => new { r.ServiceDate.Year, r.ServiceDate.Month })
            .Select(g => new { g.Key.Year, g.Key.Month, Count = g.Select(r => r.Id).Distinct().Count() })
            .OrderBy(m => m.Year).ThenBy(m => m.Month)
            .ToListAsync();

        return new MonthlyTrendResponse(
            monthly.Select(m => $"{m.Year}-{m.Month:D2}").ToList(),
            monthly.Select(m => m.Count).ToList()
        );
    }

    public async Task<HourlyHeatmapResponse> GetHourlyAsync(string tenantSlug, PrmFilterParams filters)
    {
        await using var db = await _factory.CreateAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        var rows = await query.Select(r => new { r.ServiceDate, r.StartTime, r.Id }).ToListAsync();
        var days = new[] { "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun" };
        var hours = Enumerable.Range(0, 24).ToList();

        var matrix = days.Select(day =>
            hours.Select(hour =>
            {
                return rows
                    .Where(r => r.ServiceDate.DayOfWeek == DayFromLabel(day) && r.StartTime / 100 == hour)
                    .Select(r => r.Id).Distinct().Count();
            }).ToList()
        ).ToList();

        return new HourlyHeatmapResponse(days.ToList(), hours, matrix);
    }

    public async Task<RequestedVsProvidedTrendResponse> GetRequestedVsProvidedAsync(string tenantSlug, PrmFilterParams filters)
    {
        await using var db = await _factory.CreateAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        var daily = await query
            .GroupBy(r => r.ServiceDate)
            .Select(g => new
            {
                Date = g.Key,
                Provided = g.Select(r => r.Id).Distinct().Count(),
                Requested = g.GroupBy(r => r.Id).Sum(ig => ig.First().Requested)
            })
            .OrderBy(d => d.Date)
            .ToListAsync();

        return new RequestedVsProvidedTrendResponse(
            daily.Select(d => d.Date.ToString("yyyy-MM-dd")).ToList(),
            daily.Select(d => d.Provided).ToList(),
            daily.Select(d => d.Requested).ToList()
        );
    }

    private static DayOfWeek DayFromLabel(string label) => label switch
    {
        "Mon" => DayOfWeek.Monday, "Tue" => DayOfWeek.Tuesday,
        "Wed" => DayOfWeek.Wednesday, "Thu" => DayOfWeek.Thursday,
        "Fri" => DayOfWeek.Friday, "Sat" => DayOfWeek.Saturday,
        "Sun" => DayOfWeek.Sunday, _ => DayOfWeek.Monday
    };
}
```

- [ ] **Step 2: Create RankingService**

`backend/src/PrmDashboard.PrmService/Services/RankingService.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using PrmDashboard.PrmService.Data;
using PrmDashboard.Shared.DTOs;
using PrmDashboard.Shared.Extensions;

namespace PrmDashboard.PrmService.Services;

public class RankingService : BaseQueryService
{
    public RankingService(TenantDbContextFactory factory) : base(factory) { }

    public async Task<RankingsResponse> GetTopAirlinesAsync(string tenantSlug, PrmFilterParams filters, int limit = 10)
    {
        await using var db = await _factory.CreateAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        var total = await query.Select(r => r.Id).Distinct().CountAsync();
        var ranked = await query
            .GroupBy(r => r.Airline)
            .Select(g => new { Airline = g.Key, Count = g.Select(r => r.Id).Distinct().Count() })
            .OrderByDescending(r => r.Count)
            .Take(limit)
            .ToListAsync();

        return new RankingsResponse(ranked.Select(r =>
            new RankingItem(r.Airline, r.Count, total > 0 ? Math.Round((double)r.Count / total * 100, 1) : 0)
        ).ToList());
    }

    public async Task<RankingsResponse> GetTopFlightsAsync(string tenantSlug, PrmFilterParams filters, int limit = 10)
    {
        await using var db = await _factory.CreateAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        var total = await query.Select(r => r.Id).Distinct().CountAsync();
        var ranked = await query
            .GroupBy(r => r.Flight)
            .Select(g => new { Flight = g.Key, Count = g.Select(r => r.Id).Distinct().Count() })
            .OrderByDescending(r => r.Count)
            .Take(limit)
            .ToListAsync();

        return new RankingsResponse(ranked.Select(r =>
            new RankingItem(r.Flight, r.Count, total > 0 ? Math.Round((double)r.Count / total * 100, 1) : 0)
        ).ToList());
    }

    public async Task<AgentRankingsResponse> GetTopAgentsAsync(string tenantSlug, PrmFilterParams filters, int limit = 10)
    {
        await using var db = await _factory.CreateAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        var rows = await query.ToListAsync();

        var agentGroups = rows
            .Where(r => r.AgentNo != null)
            .GroupBy(r => r.AgentNo!)
            .Select(g =>
            {
                var serviceIds = g.Select(r => r.Id).Distinct().ToList();
                var durations = g.GroupBy(r => r.Id)
                    .Select(ig => ig.Sum(r => TimeHelpers.CalculateActiveMinutes(r.StartTime, r.PausedAt, r.EndTime)))
                    .ToList();
                var topService = g.GroupBy(r => r.Service).OrderByDescending(sg => sg.Count()).First().Key;
                var topAirline = g.GroupBy(r => r.Airline).OrderByDescending(ag => ag.Count()).First().Key;
                var daysActive = g.Select(r => r.ServiceDate).Distinct().Count();

                return new AgentRankingItem(
                    0, g.Key, g.First().AgentName ?? "Unknown",
                    serviceIds.Count,
                    durations.Count > 0 ? Math.Round(durations.Average(), 0) : 0,
                    topService, topAirline, daysActive
                );
            })
            .OrderByDescending(a => a.PrmCount)
            .Take(limit)
            .Select((a, i) => a with { Rank = i + 1 })
            .ToList();

        return new AgentRankingsResponse(agentGroups);
    }

    public async Task<RankingsResponse> GetTopServicesAsync(string tenantSlug, PrmFilterParams filters)
    {
        await using var db = await _factory.CreateAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        var total = await query.Select(r => r.Id).Distinct().CountAsync();
        var ranked = await query
            .GroupBy(r => r.Service)
            .Select(g => new { Service = g.Key, Count = g.Select(r => r.Id).Distinct().Count() })
            .OrderByDescending(r => r.Count)
            .ToListAsync();

        return new RankingsResponse(ranked.Select(r =>
            new RankingItem(r.Service, r.Count, total > 0 ? Math.Round((double)r.Count / total * 100, 1) : 0)
        ).ToList());
    }
}
```

- [ ] **Step 3: Create BreakdownService**

`backend/src/PrmDashboard.PrmService/Services/BreakdownService.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using PrmDashboard.PrmService.Data;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Services;

public class BreakdownService : BaseQueryService
{
    public BreakdownService(TenantDbContextFactory factory) : base(factory) { }

    public async Task<ServiceTypeMatrixResponse> GetByServiceTypeAsync(string tenantSlug, PrmFilterParams filters)
    {
        await using var db = await _factory.CreateAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        var data = await query
            .GroupBy(r => new { r.ServiceDate.Year, r.ServiceDate.Month, r.Service })
            .Select(g => new { g.Key.Year, g.Key.Month, g.Key.Service, Count = g.Select(r => r.Id).Distinct().Count() })
            .ToListAsync();

        var serviceTypes = data.Select(d => d.Service).Distinct().OrderBy(s => s).ToList();
        var months = data.Select(d => new { d.Year, d.Month }).Distinct().OrderBy(m => m.Year).ThenBy(m => m.Month);

        var rows = months.Select(m =>
        {
            var monthData = data.Where(d => d.Year == m.Year && d.Month == m.Month);
            var counts = serviceTypes.ToDictionary(st => st, st => monthData.FirstOrDefault(d => d.Service == st)?.Count ?? 0);
            var monthLabel = new DateOnly(m.Year, m.Month, 1).ToString("MMM yyyy");
            return new ServiceTypeMatrixRow(monthLabel, counts, counts.Values.Sum());
        }).ToList();

        return new ServiceTypeMatrixResponse(serviceTypes, rows);
    }

    public async Task<SankeyResponse> GetByAgentTypeAsync(string tenantSlug, PrmFilterParams filters)
    {
        await using var db = await _factory.CreateAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        // Dedup: first row per ID
        var rows = await query.ToListAsync();
        var deduped = rows.GroupBy(r => r.Id).Select(g => g.OrderBy(r => r.RowId).First()).ToList();

        var nodes = new List<SankeyNode>();
        var links = new List<SankeyLink>();

        // Level 1: Agent Type
        var byAgentType = deduped.GroupBy(r => r.PrmAgentType);
        foreach (var ag in byAgentType)
        {
            nodes.Add(new SankeyNode(ag.Key, ag.Count()));

            // Level 2: Service Type
            var byService = ag.GroupBy(r => r.Service).OrderByDescending(s => s.Count()).Take(5);
            foreach (var sv in byService)
            {
                var serviceNode = sv.Key;
                if (!nodes.Any(n => n.Name == serviceNode))
                    nodes.Add(new SankeyNode(serviceNode, sv.Count()));
                links.Add(new SankeyLink(ag.Key, serviceNode, sv.Count()));

                // Level 3: Top flights
                var byFlight = sv.GroupBy(r => r.Flight).OrderByDescending(f => f.Count()).Take(4);
                foreach (var fl in byFlight)
                {
                    if (!nodes.Any(n => n.Name == fl.Key))
                        nodes.Add(new SankeyNode(fl.Key, fl.Count()));
                    links.Add(new SankeyLink(serviceNode, fl.Key, fl.Count()));
                }
            }
        }

        return new SankeyResponse(nodes, links);
    }

    public async Task<BreakdownResponse> GetByLocationAsync(string tenantSlug, PrmFilterParams filters)
    {
        await using var db = await _factory.CreateAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        var total = await query.Select(r => r.Id).Distinct().CountAsync();
        var items = await query
            .Where(r => r.PosLocation != null)
            .GroupBy(r => r.PosLocation!)
            .Select(g => new { Location = g.Key, Count = g.Select(r => r.Id).Distinct().Count() })
            .OrderByDescending(i => i.Count)
            .ToListAsync();

        return new BreakdownResponse(items.Select(i =>
            new BreakdownItem(i.Location, i.Count, total > 0 ? Math.Round((double)i.Count / total * 100, 1) : 0)
        ).ToList());
    }

    public async Task<RouteBreakdownResponse> GetByRouteAsync(string tenantSlug, PrmFilterParams filters, int limit = 10)
    {
        await using var db = await _factory.CreateAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        var total = await query.Select(r => r.Id).Distinct().CountAsync();
        var routes = await query
            .Where(r => r.Departure != null && r.Arrival != null)
            .GroupBy(r => new { r.Departure, r.Arrival })
            .Select(g => new { g.Key.Departure, g.Key.Arrival, Count = g.Select(r => r.Id).Distinct().Count() })
            .OrderByDescending(r => r.Count)
            .Take(limit)
            .ToListAsync();

        return new RouteBreakdownResponse(routes.Select(r =>
            new RouteItem(r.Departure!, r.Arrival!, r.Count, total > 0 ? Math.Round((double)r.Count / total * 100, 1) : 0)
        ).ToList());
    }

    public async Task<BreakdownResponse> GetByAirlineAsync(string tenantSlug, PrmFilterParams filters)
    {
        await using var db = await _factory.CreateAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        var total = await query.Select(r => r.Id).Distinct().CountAsync();
        var items = await query
            .GroupBy(r => r.Airline)
            .Select(g => new { Airline = g.Key, Count = g.Select(r => r.Id).Distinct().Count() })
            .OrderByDescending(i => i.Count)
            .ToListAsync();

        return new BreakdownResponse(items.Select(i =>
            new BreakdownItem(i.Airline, i.Count, total > 0 ? Math.Round((double)i.Count / total * 100, 1) : 0)
        ).ToList());
    }
}
```

- [ ] **Step 4: Create PerformanceService**

`backend/src/PrmDashboard.PrmService/Services/PerformanceService.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using PrmDashboard.PrmService.Data;
using PrmDashboard.Shared.DTOs;
using PrmDashboard.Shared.Extensions;

namespace PrmDashboard.PrmService.Services;

public class PerformanceService : BaseQueryService
{
    public PerformanceService(TenantDbContextFactory factory) : base(factory) { }

    public async Task<DurationDistributionResponse> GetDurationDistributionAsync(string tenantSlug, PrmFilterParams filters)
    {
        await using var db = await _factory.CreateAsync(tenantSlug);
        var rows = await ApplyFilters(db, filters).ToListAsync();

        var durations = rows.GroupBy(r => r.Id)
            .Select(g => g.Sum(r => TimeHelpers.CalculateActiveMinutes(r.StartTime, r.PausedAt, r.EndTime)))
            .OrderBy(d => d)
            .ToList();

        if (durations.Count == 0)
            return new DurationDistributionResponse([], 0, 0, 0);

        var buckets = new (string label, double min, double max)[]
        {
            ("0-15", 0, 15), ("15-30", 15, 30), ("30-45", 30, 45),
            ("45-60", 45, 60), ("60-90", 60, 90), ("90+", 90, double.MaxValue)
        };

        var total = durations.Count;
        var bucketItems = buckets.Select(b =>
        {
            var count = durations.Count(d => d >= b.min && d < b.max);
            return new DurationBucket(b.label, count, total > 0 ? Math.Round((double)count / total * 100, 1) : 0);
        }).ToList();

        var p50 = Percentile(durations, 50);
        var p90 = Percentile(durations, 90);
        var avg = durations.Average();

        return new DurationDistributionResponse(bucketItems, Math.Round(p50, 1), Math.Round(p90, 1), Math.Round(avg, 1));
    }

    public async Task<NoShowResponse> GetNoShowsAsync(string tenantSlug, PrmFilterParams filters)
    {
        await using var db = await _factory.CreateAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        var byAirline = await query
            .GroupBy(r => r.Airline)
            .Select(g => new
            {
                Airline = g.Key,
                Total = g.Select(r => r.Id).Distinct().Count(),
                NoShows = g.Where(r => r.NoShowFlag == "N").Select(r => r.Id).Distinct().Count()
            })
            .OrderByDescending(a => a.Total > 0 ? (double)a.NoShows / a.Total : 0)
            .ToListAsync();

        return new NoShowResponse(byAirline.Select(a =>
            new NoShowItem(a.Airline, a.Total, a.NoShows,
                a.Total > 0 ? Math.Round((double)a.NoShows / a.Total * 100, 1) : 0)
        ).ToList());
    }

    public async Task<PauseAnalysisResponse> GetPauseAnalysisAsync(string tenantSlug, PrmFilterParams filters)
    {
        await using var db = await _factory.CreateAsync(tenantSlug);
        var rows = await ApplyFilters(db, filters).ToListAsync();

        var totalServices = rows.Select(r => r.Id).Distinct().Count();
        var pausedServices = rows.Where(r => r.PausedAt.HasValue).Select(r => r.Id).Distinct().Count();
        var pauseRate = totalServices > 0 ? (double)pausedServices / totalServices * 100 : 0;

        var pauseRows = rows.Where(r => r.PausedAt.HasValue).ToList();
        var pauseDurations = pauseRows.Select(r =>
        {
            var nextRow = rows.Where(rr => rr.Id == r.Id && rr.RowId > r.RowId).OrderBy(rr => rr.RowId).FirstOrDefault();
            if (nextRow == null) return 0.0;
            return TimeHelpers.HhmmToMinutes(nextRow.StartTime) - TimeHelpers.HhmmToMinutes(r.PausedAt!.Value);
        }).Where(d => d > 0).ToList();

        var avgPauseDuration = pauseDurations.Count > 0 ? pauseDurations.Average() : 0;

        var byServiceType = rows.Where(r => r.PausedAt.HasValue)
            .GroupBy(r => r.Service)
            .Select(g => new BreakdownItem(g.Key, g.Select(r => r.Id).Distinct().Count(), 0))
            .OrderByDescending(i => i.Count)
            .ToList();

        return new PauseAnalysisResponse(pausedServices, Math.Round(pauseRate, 1), Math.Round(avgPauseDuration, 1), byServiceType);
    }

    public async Task<DurationStatsResponse> GetDurationStatsAsync(string tenantSlug, PrmFilterParams filters)
    {
        await using var db = await _factory.CreateAsync(tenantSlug);
        var rows = await ApplyFilters(db, filters).ToListAsync();

        var durations = rows.GroupBy(r => r.Id)
            .Select(g => g.Sum(r => TimeHelpers.CalculateActiveMinutes(r.StartTime, r.PausedAt, r.EndTime)))
            .OrderBy(d => d)
            .ToList();

        if (durations.Count == 0)
            return new DurationStatsResponse(0, 0, 0, 0, 0, 0);

        return new DurationStatsResponse(
            Math.Round(durations.Min(), 1),
            Math.Round(durations.Max(), 1),
            Math.Round(durations.Average(), 1),
            Math.Round(Percentile(durations, 50), 1),
            Math.Round(Percentile(durations, 90), 1),
            Math.Round(Percentile(durations, 95), 1)
        );
    }

    private static double Percentile(List<double> sorted, int percentile)
    {
        if (sorted.Count == 0) return 0;
        var index = (int)Math.Ceiling(percentile / 100.0 * sorted.Count) - 1;
        return sorted[Math.Max(0, Math.Min(index, sorted.Count - 1))];
    }
}
```

- [ ] **Step 5: Create RecordService**

`backend/src/PrmDashboard.PrmService/Services/RecordService.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using PrmDashboard.PrmService.Data;
using PrmDashboard.Shared.DTOs;
using PrmDashboard.Shared.Extensions;

namespace PrmDashboard.PrmService.Services;

public class RecordService : BaseQueryService
{
    public RecordService(TenantDbContextFactory factory) : base(factory) { }

    public async Task<PaginatedResponse<PrmRecordDto>> GetRecordsAsync(
        string tenantSlug, PrmFilterParams filters, int page = 1, int size = 50, string sort = "start_time:desc")
    {
        await using var db = await _factory.CreateAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        var totalCount = await query.CountAsync();

        // Sort
        query = sort switch
        {
            "start_time:asc" => query.OrderBy(r => r.StartTime),
            "service_date:asc" => query.OrderBy(r => r.ServiceDate),
            "service_date:desc" => query.OrderByDescending(r => r.ServiceDate),
            _ => query.OrderByDescending(r => r.StartTime)
        };

        var items = await query.Skip((page - 1) * size).Take(size)
            .Select(r => new PrmRecordDto(
                r.RowId, r.Id, r.Flight, r.AgentName, r.PassengerName,
                r.PrmAgentType, r.StartTime, r.PausedAt, r.EndTime,
                r.Service, r.SeatNumber, r.PosLocation, r.NoShowFlag,
                r.LocName, r.Arrival, r.Airline, r.Departure,
                r.Requested, r.ServiceDate
            ))
            .ToListAsync();

        return new PaginatedResponse<PrmRecordDto>(
            items, totalCount, page, size, (int)Math.Ceiling((double)totalCount / size)
        );
    }

    public async Task<List<PrmSegmentDto>> GetSegmentsAsync(string tenantSlug, string airport, int prmId)
    {
        await using var db = await _factory.CreateAsync(tenantSlug);

        var rows = await db.PrmServices.AsNoTracking()
            .Where(r => r.Id == prmId && r.LocName == airport)
            .OrderBy(r => r.RowId)
            .ToListAsync();

        return rows.Select(r => new PrmSegmentDto(
            r.RowId, r.StartTime, r.PausedAt, r.EndTime,
            Math.Round(TimeHelpers.CalculateActiveMinutes(r.StartTime, r.PausedAt, r.EndTime), 1)
        )).ToList();
    }
}
```

- [ ] **Step 6: Create remaining controllers**

`backend/src/PrmDashboard.PrmService/Controllers/TrendsController.cs`:
```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Controllers;

[Authorize]
[ApiController]
[Route("api/prm/trends")]
public class TrendsController : ControllerBase
{
    private readonly TrendService _service;
    public TrendsController(TrendService service) => _service = service;
    private string Slug() => Request.Headers["X-Tenant-Slug"].FirstOrDefault() ?? "";

    [HttpGet("daily")]
    public async Task<IActionResult> GetDaily([FromQuery] PrmFilterParams filters) =>
        Ok(await _service.GetDailyAsync(Slug(), filters));

    [HttpGet("monthly")]
    public async Task<IActionResult> GetMonthly([FromQuery] PrmFilterParams filters) =>
        Ok(await _service.GetMonthlyAsync(Slug(), filters));

    [HttpGet("hourly")]
    public async Task<IActionResult> GetHourly([FromQuery] PrmFilterParams filters) =>
        Ok(await _service.GetHourlyAsync(Slug(), filters));

    [HttpGet("requested-vs-provided")]
    public async Task<IActionResult> GetRequestedVsProvided([FromQuery] PrmFilterParams filters) =>
        Ok(await _service.GetRequestedVsProvidedAsync(Slug(), filters));
}
```

`backend/src/PrmDashboard.PrmService/Controllers/RankingsController.cs`:
```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Controllers;

[Authorize]
[ApiController]
[Route("api/prm/rankings")]
public class RankingsController : ControllerBase
{
    private readonly RankingService _service;
    public RankingsController(RankingService service) => _service = service;
    private string Slug() => Request.Headers["X-Tenant-Slug"].FirstOrDefault() ?? "";

    [HttpGet("airlines")]
    public async Task<IActionResult> Airlines([FromQuery] PrmFilterParams filters, [FromQuery] int limit = 10) =>
        Ok(await _service.GetTopAirlinesAsync(Slug(), filters, limit));

    [HttpGet("flights")]
    public async Task<IActionResult> Flights([FromQuery] PrmFilterParams filters, [FromQuery] int limit = 10) =>
        Ok(await _service.GetTopFlightsAsync(Slug(), filters, limit));

    [HttpGet("agents")]
    public async Task<IActionResult> Agents([FromQuery] PrmFilterParams filters, [FromQuery] int limit = 10) =>
        Ok(await _service.GetTopAgentsAsync(Slug(), filters, limit));

    [HttpGet("services")]
    public async Task<IActionResult> Services([FromQuery] PrmFilterParams filters) =>
        Ok(await _service.GetTopServicesAsync(Slug(), filters));
}
```

`backend/src/PrmDashboard.PrmService/Controllers/BreakdownsController.cs`:
```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Controllers;

[Authorize]
[ApiController]
[Route("api/prm/breakdowns")]
public class BreakdownsController : ControllerBase
{
    private readonly BreakdownService _service;
    public BreakdownsController(BreakdownService service) => _service = service;
    private string Slug() => Request.Headers["X-Tenant-Slug"].FirstOrDefault() ?? "";

    [HttpGet("by-service-type")]
    public async Task<IActionResult> ByServiceType([FromQuery] PrmFilterParams filters) =>
        Ok(await _service.GetByServiceTypeAsync(Slug(), filters));

    [HttpGet("by-agent-type")]
    public async Task<IActionResult> ByAgentType([FromQuery] PrmFilterParams filters) =>
        Ok(await _service.GetByAgentTypeAsync(Slug(), filters));

    [HttpGet("by-airline")]
    public async Task<IActionResult> ByAirline([FromQuery] PrmFilterParams filters) =>
        Ok(await _service.GetByAirlineAsync(Slug(), filters));

    [HttpGet("by-location")]
    public async Task<IActionResult> ByLocation([FromQuery] PrmFilterParams filters) =>
        Ok(await _service.GetByLocationAsync(Slug(), filters));

    [HttpGet("by-route")]
    public async Task<IActionResult> ByRoute([FromQuery] PrmFilterParams filters, [FromQuery] int limit = 10) =>
        Ok(await _service.GetByRouteAsync(Slug(), filters, limit));
}
```

`backend/src/PrmDashboard.PrmService/Controllers/PerformanceController.cs`:
```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Controllers;

[Authorize]
[ApiController]
[Route("api/prm/performance")]
public class PerformanceController : ControllerBase
{
    private readonly PerformanceService _service;
    public PerformanceController(PerformanceService service) => _service = service;
    private string Slug() => Request.Headers["X-Tenant-Slug"].FirstOrDefault() ?? "";

    [HttpGet("duration-stats")]
    public async Task<IActionResult> DurationStats([FromQuery] PrmFilterParams filters) =>
        Ok(await _service.GetDurationStatsAsync(Slug(), filters));

    [HttpGet("duration-distribution")]
    public async Task<IActionResult> DurationDistribution([FromQuery] PrmFilterParams filters) =>
        Ok(await _service.GetDurationDistributionAsync(Slug(), filters));

    [HttpGet("no-shows")]
    public async Task<IActionResult> NoShows([FromQuery] PrmFilterParams filters) =>
        Ok(await _service.GetNoShowsAsync(Slug(), filters));

    [HttpGet("pause-analysis")]
    public async Task<IActionResult> PauseAnalysis([FromQuery] PrmFilterParams filters) =>
        Ok(await _service.GetPauseAnalysisAsync(Slug(), filters));
}
```

`backend/src/PrmDashboard.PrmService/Controllers/RecordsController.cs`:
```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Controllers;

[Authorize]
[ApiController]
[Route("api/prm")]
public class RecordsController : ControllerBase
{
    private readonly RecordService _service;
    public RecordsController(RecordService service) => _service = service;
    private string Slug() => Request.Headers["X-Tenant-Slug"].FirstOrDefault() ?? "";

    [HttpGet("records")]
    public async Task<IActionResult> GetRecords(
        [FromQuery] PrmFilterParams filters, [FromQuery] int page = 1,
        [FromQuery] int size = 50, [FromQuery] string sort = "start_time:desc") =>
        Ok(await _service.GetRecordsAsync(Slug(), filters, page, size, sort));

    [HttpGet("records/{id}/segments")]
    public async Task<IActionResult> GetSegments(int id, [FromQuery] string airport) =>
        Ok(await _service.GetSegmentsAsync(Slug(), airport, id));
}
```

- [ ] **Step 7: Register all services in Program.cs, build, commit**

Ensure Program.cs registers: `KpiService`, `TrendService`, `RankingService`, `BreakdownService`, `PerformanceService`, `RecordService`, `FilterService`.

```bash
cd backend && dotnet build
git add backend/
git commit -m "feat(prm): all 19 PRM endpoints — trends, rankings, breakdowns, performance, records"
```

---

## Phase 5: API Gateway

### Task 9: Ocelot API Gateway

**Files:**
- Create: `backend/src/PrmDashboard.Gateway/PrmDashboard.Gateway.csproj`
- Create: `backend/src/PrmDashboard.Gateway/Program.cs`
- Create: `backend/src/PrmDashboard.Gateway/ocelot.json`
- Create: `backend/src/PrmDashboard.Gateway/Middleware/TenantExtractionMiddleware.cs`
- Create: `backend/src/PrmDashboard.Gateway/Dockerfile`

- [ ] **Step 1: Create Gateway project**

```bash
cd backend/src
mkdir PrmDashboard.Gateway
cd PrmDashboard.Gateway
dotnet new webapi --no-https
dotnet add package Ocelot --version 23.4.2
cd ../..
dotnet sln add src/PrmDashboard.Gateway/PrmDashboard.Gateway.csproj
```

- [ ] **Step 2: Create TenantExtractionMiddleware**

`backend/src/PrmDashboard.Gateway/Middleware/TenantExtractionMiddleware.cs`:
```csharp
namespace PrmDashboard.Gateway.Middleware;

public class TenantExtractionMiddleware
{
    private readonly RequestDelegate _next;

    public TenantExtractionMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var host = context.Request.Host.Host;

        // Extract subdomain: aeroground.prm-app.com → aeroground
        // For localhost dev: use X-Tenant-Slug header or default
        string tenantSlug;

        if (host.Contains('.') && !host.StartsWith("localhost") && !host.StartsWith("127."))
        {
            tenantSlug = host.Split('.')[0];
        }
        else
        {
            // Dev fallback: check header or use query param
            tenantSlug = context.Request.Headers["X-Tenant-Slug"].FirstOrDefault()
                      ?? context.Request.Query["tenant_slug"].FirstOrDefault()
                      ?? "aeroground";
        }

        context.Request.Headers["X-Tenant-Slug"] = tenantSlug;
        await _next(context);
    }
}
```

- [ ] **Step 3: Create ocelot.json**

`backend/src/PrmDashboard.Gateway/ocelot.json`:
```json
{
  "Routes": [
    {
      "DownstreamPathTemplate": "/api/auth/{everything}",
      "DownstreamScheme": "http",
      "DownstreamHostAndPorts": [{ "Host": "auth", "Port": 8080 }],
      "UpstreamPathTemplate": "/api/auth/{everything}",
      "UpstreamHttpMethod": [ "GET", "POST", "PUT", "DELETE" ]
    },
    {
      "DownstreamPathTemplate": "/api/tenants/{everything}",
      "DownstreamScheme": "http",
      "DownstreamHostAndPorts": [{ "Host": "tenant", "Port": 8080 }],
      "UpstreamPathTemplate": "/api/tenants/{everything}",
      "UpstreamHttpMethod": [ "GET" ]
    },
    {
      "DownstreamPathTemplate": "/api/prm/{everything}",
      "DownstreamScheme": "http",
      "DownstreamHostAndPorts": [{ "Host": "prm", "Port": 8080 }],
      "UpstreamPathTemplate": "/api/prm/{everything}",
      "UpstreamHttpMethod": [ "GET" ]
    }
  ],
  "GlobalConfiguration": {
    "BaseUrl": "http://localhost:5000"
  }
}
```

- [ ] **Step 4: Create Program.cs**

`backend/src/PrmDashboard.Gateway/Program.cs`:
```csharp
using Ocelot.DependencyInjection;
using Ocelot.Middleware;
using PrmDashboard.Gateway.Middleware;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddJsonFile("ocelot.json", optional: false, reloadOnChange: true);
builder.Services.AddOcelot();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.SetIsOriginAllowed(_ => true)
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials());
});

var app = builder.Build();

app.UseCors();
app.UseMiddleware<TenantExtractionMiddleware>();
await app.UseOcelot();

app.Run();
```

- [ ] **Step 5: Create Dockerfile, build, commit**

`backend/src/PrmDashboard.Gateway/Dockerfile`:
```dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY src/PrmDashboard.Gateway/PrmDashboard.Gateway.csproj src/PrmDashboard.Gateway/
RUN dotnet restore src/PrmDashboard.Gateway/PrmDashboard.Gateway.csproj
COPY src/PrmDashboard.Gateway/ src/PrmDashboard.Gateway/
RUN dotnet publish src/PrmDashboard.Gateway/PrmDashboard.Gateway.csproj -c Release -o /app/publish

FROM base AS final
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "PrmDashboard.Gateway.dll"]
```

```bash
cd backend && dotnet build
git add backend/
git commit -m "feat(gateway): Ocelot API gateway with tenant extraction middleware"
```

---

## Phase 6: Seed Data

### Task 10: Seed Scripts for Tenants, Employees & PRM Data

**Files:**
- Create: `database/init/03-seed-tenants.sql`
- Create: `database/init/04-seed-employees.sql`
- Create: `database/seed/generate-prm-data.py`

- [ ] **Step 1: Create tenant + employee seed SQL**

`database/init/03-seed-tenants.sql`:
```sql
USE prm_master;

INSERT INTO tenants (name, slug, db_name, db_password, logo_url, primary_color) VALUES
('AeroGround Services', 'aeroground', 'aeroground_db', 'rootpassword', NULL, '#2563eb'),
('SkyServe Ground Handling', 'skyserve', 'skyserve_db', 'rootpassword', NULL, '#7c3aed'),
('GlobalPRM', 'globalprm', 'globalprm_db', 'rootpassword', NULL, '#059669');
```

`database/init/04-seed-employees.sql`:
```sql
USE prm_master;

-- Tenant 1: AeroGround (BLR, HYD, DEL)
-- BCrypt hash for 'admin123' = $2a$12$LJ3m4ys3uz0ER2MkCjMuhu1QSrMBJXqGNwjL1wPHp3Ay0j8H4VkLK
-- Note: generate proper hashes at runtime. For seed SQL, use a known hash.
SET @hash = '$2a$12$LJ3m4ys3uz0ER2MkCjMuhu1QSrMBJXqGNwjL1wPHp3Ay0j8H4VkLK';

INSERT INTO employees (tenant_id, username, password_hash, display_name, email) VALUES
(1, 'admin', @hash, 'Admin User', 'admin@aeroground.com'),
(1, 'john', @hash, 'John Doe', 'john@aeroground.com'),
(1, 'priya', @hash, 'Priya Sharma', 'priya@aeroground.com'),
(1, 'ravi', @hash, 'Ravi Kumar', 'ravi@aeroground.com');

-- Tenant 2: SkyServe (BLR, BOM, MAA)
INSERT INTO employees (tenant_id, username, password_hash, display_name, email) VALUES
(2, 'admin', @hash, 'Admin User', 'admin@skyserve.com'),
(2, 'anika', @hash, 'Anika Patel', 'anika@skyserve.com'),
(2, 'deepak', @hash, 'Deepak Jain', 'deepak@skyserve.com'),
(2, 'sunita', @hash, 'Sunita Rao', 'sunita@skyserve.com');

-- Tenant 3: GlobalPRM (SYD, KUL, JFK)
INSERT INTO employees (tenant_id, username, password_hash, display_name, email) VALUES
(3, 'admin', @hash, 'Admin User', 'admin@globalprm.com'),
(3, 'sarah', @hash, 'Sarah Chen', 'sarah@globalprm.com'),
(3, 'mike', @hash, 'Mike Johnson', 'mike@globalprm.com'),
(3, 'li', @hash, 'Li Wei', 'li@globalprm.com');

-- Airport access (RBAC)
-- Tenant 1
INSERT INTO employee_airports (employee_id, airport_code, airport_name) VALUES
(1, 'BLR', 'Bengaluru Kempegowda Intl'), (1, 'HYD', 'Hyderabad Rajiv Gandhi Intl'), (1, 'DEL', 'New Delhi Indira Gandhi Intl'),
(2, 'BLR', 'Bengaluru Kempegowda Intl'), (2, 'HYD', 'Hyderabad Rajiv Gandhi Intl'),
(3, 'BLR', 'Bengaluru Kempegowda Intl'),
(4, 'DEL', 'New Delhi Indira Gandhi Intl');

-- Tenant 2
INSERT INTO employee_airports (employee_id, airport_code, airport_name) VALUES
(5, 'BLR', 'Bengaluru Kempegowda Intl'), (5, 'BOM', 'Mumbai Chhatrapati Shivaji Intl'), (5, 'MAA', 'Chennai Intl'),
(6, 'BLR', 'Bengaluru Kempegowda Intl'), (6, 'BOM', 'Mumbai Chhatrapati Shivaji Intl'),
(7, 'MAA', 'Chennai Intl'),
(8, 'BOM', 'Mumbai Chhatrapati Shivaji Intl');

-- Tenant 3
INSERT INTO employee_airports (employee_id, airport_code, airport_name) VALUES
(9, 'SYD', 'Sydney Kingsford Smith'), (9, 'KUL', 'Kuala Lumpur Intl'), (9, 'JFK', 'New York John F Kennedy'),
(10, 'SYD', 'Sydney Kingsford Smith'), (10, 'KUL', 'Kuala Lumpur Intl'),
(11, 'JFK', 'New York John F Kennedy'),
(12, 'KUL', 'Kuala Lumpur Intl');
```

- [ ] **Step 2: Create Python seed data generator**

`database/seed/generate-prm-data.py`:
```python
"""
Generates realistic PRM seed data for all 3 tenant databases.
100-200 records per airport per month, Dec 2025 - Mar 2026.
Run: python database/seed/generate-prm-data.py > database/init/05-seed-prm-data.sql
"""
import random
from datetime import date, timedelta

TENANTS = {
    "aeroground_db": ["BLR", "HYD", "DEL"],
    "skyserve_db": ["BLR", "BOM", "MAA"],
    "globalprm_db": ["SYD", "KUL", "JFK"],
}

AIRLINES = ["IX", "AI", "EK", "QF", "SQ", "EY", "CX", "SV", "MH", "TG"]
AIRLINE_WEIGHTS = [35, 15, 8, 5, 5, 4, 3, 3, 2, 1]
SERVICES = ["WCHR", "WCHR", "WCHR", "WCHR", "WCHR", "WCHR", "WCHR", "WCHR", "WCHR",
            "WCHC", "MAAS", "WCHS", "DPNA", "UMNR", "BLND", "MEDA", "WCMP"]
LOCATIONS = ["Aircraft Point", "AircraftGate-A", "Boarding Gate", "Checkin Counter",
             "Belt Area", "Aircraft Door"]
LOC_WEIGHTS = [42, 28, 15, 8, 5, 2]
SCAN_TYPES = ["Mobile Scan Entry", "Mobile Manual Entry"]
AGENT_NAMES = [
    "Sathisha L", "Md Mustak", "Madhan Kumar S", "MD Aftab", "Satyendra Kumar Sah",
    "Amit Kumar Paswan", "Bikram Kumar Roy", "Kishor Kumar Yadav", "CHANDA DEVI",
    "P Kusa", "Ravi A", "Balakrishna N", "Gaurav Kumar", "B Noor Mohammad",
    "Dhanji Prasad", "Sumith", "Naveen Kumar Reddy N", "VIJENDRA GOND",
    "Bondikala Naveen", "Rahul Paswan", "Shivaji J", "KAZI KUTUBUDDIN",
    "Shreenivasa M G", "AMALESH KUMAR BHARATI"
]
DESTINATIONS = ["DXB", "DEL", "BOM", "SIN", "CCU", "AUH", "BLR", "MAA", "HYD", "KUL", "SYD", "JFK"]
PASSENGER_NAMES = [
    "BOTHRA/KAMALADEVI", "BEGUM FARIDA", "PRATAP/AADYAM", "ALLU/LAKSMI RAJYAM",
    "SAMIULLA/SYEDMR", "FAHEEMUNNISA/FAHEEMU", "NORONHA/JOSIAREESHAL",
    "SHAIK/CHOTIMAFAMIDAM", "CHRISTINAASHALATHA/F", "SHAIK/MAHABOOBHUSSAI",
    "KHANUM/ARSHIYAMS", "SYEDMUSHAHIRHASSAN/F", "NAGEENAHASSAN/FNUMRS",
    "KONDURU/SUGUNAMMAMR", "SHARMA/RAJESH", "PATEL/ANANYA",
    "SINGH/VIKRAM", "KUMAR/MEENA", "REDDY/PRATHAP", "DAS/SUBHASH"
]

def hhmm(hour, minute):
    return hour * 100 + minute

def random_start_time():
    """Weighted toward 08-12 peak, secondary peak 18-22"""
    r = random.random()
    if r < 0.3:
        return hhmm(random.randint(8, 11), random.randint(0, 59))
    elif r < 0.5:
        return hhmm(random.randint(18, 21), random.randint(0, 59))
    elif r < 0.7:
        return hhmm(random.randint(12, 17), random.randint(0, 59))
    elif r < 0.85:
        return hhmm(random.randint(4, 7), random.randint(0, 59))
    else:
        return hhmm(random.randint(0, 3), random.randint(0, 59))

def generate_sql():
    lines = []
    prm_id = 3860000

    for db_name, airports in TENANTS.items():
        lines.append(f"USE {db_name};")
        lines.append("")

        for airport in airports:
            start_date = date(2025, 12, 1)
            end_date = date(2026, 3, 31)
            current = start_date

            while current <= end_date:
                daily_count = random.randint(3, 7)  # per day

                for _ in range(daily_count):
                    prm_id += 1
                    airline = random.choices(AIRLINES, weights=AIRLINE_WEIGHTS, k=1)[0]
                    flight_num = random.randint(100, 9999)
                    flight = f"{airline} {flight_num}"
                    agent_idx = random.randint(0, len(AGENT_NAMES) - 1)
                    agent_name = AGENT_NAMES[agent_idx]
                    agent_no = str(10000000 + agent_idx * 1000 + random.randint(0, 999))
                    passenger = random.choice(PASSENGER_NAMES)
                    service = random.choice(SERVICES)
                    seat = f"{random.randint(1, 78)}{random.choice('ABCDEFGHJK')}"
                    pos = random.choices(LOCATIONS, weights=LOC_WEIGHTS, k=1)[0]
                    dest = random.choice([d for d in DESTINATIONS if d != airport])
                    prm_type = "SELF" if random.random() < 0.995 else "OUTSOURCED"
                    no_show = "'N'" if random.random() < 0.04 else "NULL"
                    scan = random.choice(SCAN_TYPES)
                    requested = 1 if random.random() < 0.02 else 0

                    st = random_start_time()
                    duration = random.randint(15, 90)
                    st_min = (st // 100) * 60 + (st % 100)
                    et_min = st_min + duration
                    et = hhmm(et_min // 60, et_min % 60)

                    is_paused = random.random() < 0.12

                    if is_paused:
                        pause_offset = random.randint(5, duration // 2)
                        pause_min = st_min + pause_offset
                        paused_at = hhmm(pause_min // 60, pause_min % 60)

                        # Row 1: start → pause
                        lines.append(
                            f"INSERT INTO prm_services (id, flight, flight_number, agent_name, agent_no, passenger_name, "
                            f"prm_agent_type, start_time, paused_at, end_time, service, seat_number, scanned_by, "
                            f"scanned_by_user, pos_location, no_show_flag, loc_name, arrival, airline, emp_type, "
                            f"departure, requested, service_date) VALUES "
                            f"({prm_id}, '{flight}', {flight_num}, '{agent_name}', '{agent_no}', '{passenger}', "
                            f"'{prm_type}', {st}, {paused_at}, {et}, '{service}', '{seat}', '{scan}', "
                            f"'{agent_name}', '{pos}', {no_show}, '{airport}', '{dest}', '{airline}', 'Employee', "
                            f"'{airport}', {requested}, '{current}');"
                        )

                        # Row 2: resume → end
                        resume_gap = random.randint(3, 15)
                        resume_min = pause_min + resume_gap
                        resume_st = hhmm(resume_min // 60, resume_min % 60)
                        lines.append(
                            f"INSERT INTO prm_services (id, flight, flight_number, agent_name, agent_no, passenger_name, "
                            f"prm_agent_type, start_time, paused_at, end_time, service, seat_number, scanned_by, "
                            f"scanned_by_user, pos_location, no_show_flag, loc_name, arrival, airline, emp_type, "
                            f"departure, requested, service_date) VALUES "
                            f"({prm_id}, '{flight}', {flight_num}, '{agent_name}', '{agent_no}', '{passenger}', "
                            f"'{prm_type}', {resume_st}, NULL, {et}, '{service}', '{seat}', '{scan}', "
                            f"'{agent_name}', '{pos}', {no_show}, '{airport}', '{dest}', '{airline}', 'Employee', "
                            f"'{airport}', {requested}, '{current}');"
                        )
                    else:
                        lines.append(
                            f"INSERT INTO prm_services (id, flight, flight_number, agent_name, agent_no, passenger_name, "
                            f"prm_agent_type, start_time, paused_at, end_time, service, seat_number, scanned_by, "
                            f"scanned_by_user, pos_location, no_show_flag, loc_name, arrival, airline, emp_type, "
                            f"departure, requested, service_date) VALUES "
                            f"({prm_id}, '{flight}', {flight_num}, '{agent_name}', '{agent_no}', '{passenger}', "
                            f"'{prm_type}', {st}, NULL, {et}, '{service}', '{seat}', '{scan}', "
                            f"'{agent_name}', '{pos}', {no_show}, '{airport}', '{dest}', '{airline}', 'Employee', "
                            f"'{airport}', {requested}, '{current}');"
                        )

                current += timedelta(days=1)
        lines.append("")

    return "\n".join(lines)

if __name__ == "__main__":
    print(generate_sql())
```

- [ ] **Step 3: Generate and save seed SQL**

```bash
cd database/seed
python generate-prm-data.py > ../init/05-seed-prm-data.sql
```

- [ ] **Step 4: Test full Docker stack**

```bash
docker compose down -v
docker compose up -d
# Wait for all services healthy
docker compose logs auth --tail 20
docker compose logs tenant --tail 20
docker compose logs prm --tail 20
# Test login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: aeroground" \
  -d '{"username":"admin","password":"admin123"}'
```

- [ ] **Step 5: Commit**

```bash
git add database/
git commit -m "feat: seed data — 3 tenants, 12 employees, PRM records Dec 2025-Mar 2026"
```

---

## Phase 7: Angular Frontend — Core & Auth

### Task 11: Angular Project Scaffolding

**Files:**
- Create: `frontend/` (Angular CLI generated)
- Modify: `frontend/angular.json`
- Modify: `frontend/package.json`
- Create: `frontend/Dockerfile`

- [ ] **Step 1: Create Angular project**

```bash
ng new frontend --style=scss --routing --ssr=false --standalone
cd frontend
ng add @angular/material
npm install ngx-echarts echarts @ngrx/signals
npm install -D @types/echarts
```

- [ ] **Step 2: Create Dockerfile**

`frontend/Dockerfile`:
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

`frontend/nginx.conf`:
```nginx
server {
    listen 80;
    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
    location /api/ {
        proxy_pass http://gateway:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Tenant-Slug $http_x_tenant_slug;
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): Angular 17+ project with Material 3, ECharts, NgRx Signal Store"
```

---

### Task 12: Frontend Core — Auth, API Client, Stores, Guards

**Files:**
- Create: `frontend/src/app/core/auth/auth.service.ts`
- Create: `frontend/src/app/core/auth/auth.guard.ts`
- Create: `frontend/src/app/core/auth/auth.interceptor.ts`
- Create: `frontend/src/app/core/auth/tenant.resolver.ts`
- Create: `frontend/src/app/core/api/api.client.ts`
- Create: `frontend/src/app/core/store/auth.store.ts`
- Create: `frontend/src/app/core/store/filter.store.ts`
- Create: `frontend/src/app/core/store/tenant.store.ts`
- Modify: `frontend/src/app/app.config.ts`
- Modify: `frontend/src/app/app.routes.ts`

Core services for JWT-in-memory auth, automatic refresh on 401, tenant resolution from subdomain, filter state synced to URL, and a centralized API client. Built as 8 bite-sized sub-tasks, one file per sub-task with a commit at the end.

- [ ] **Step 1: Create environment files**

`frontend/src/environments/environment.ts`:
```ts
export const environment = {
  production: false,
  apiBaseUrl: '/api',
  defaultTenantSlug: 'aeroground', // used when running on localhost without subdomain
  tenantConfigPath: '/api/tenants/config',
};
```

`frontend/src/environments/environment.prod.ts`:
```ts
export const environment = {
  production: true,
  apiBaseUrl: '/api',
  defaultTenantSlug: '',
  tenantConfigPath: '/api/tenants/config',
};
```

- [ ] **Step 2: Create TenantStore (NgRx Signal Store)**

`frontend/src/app/core/store/tenant.store.ts`:
```ts
import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';

export interface TenantState {
  slug: string;
  name: string;
  logoUrl: string;
  primaryColor: string;
  loaded: boolean;
}

const initial: TenantState = { slug: '', name: '', logoUrl: '', primaryColor: '#1976d2', loaded: false };

export const TenantStore = signalStore(
  { providedIn: 'root' },
  withState(initial),
  withMethods((store) => ({
    setTenant(t: Omit<TenantState, 'loaded'>) {
      patchState(store, { ...t, loaded: true });
    },
    clear() { patchState(store, initial); },
  })),
);
```

- [ ] **Step 3: Create AuthStore**

`frontend/src/app/core/store/auth.store.ts`:
```ts
import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';

export interface Airport { code: string; name: string; }
export interface Employee { id: number; username: string; displayName: string; email: string; airports: Airport[]; }

export interface AuthState {
  accessToken: string | null;
  employee: Employee | null;
  isAuthenticated: boolean;
}

const initial: AuthState = { accessToken: null, employee: null, isAuthenticated: false };

export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState(initial),
  withMethods((store) => ({
    setSession(accessToken: string, employee: Employee) {
      patchState(store, { accessToken, employee, isAuthenticated: true });
    },
    setAccessToken(token: string) { patchState(store, { accessToken: token }); },
    clear() { patchState(store, initial); },
  })),
);
```

- [ ] **Step 4: Create FilterStore (URL-synced filter state)**

`frontend/src/app/core/store/filter.store.ts`:
```ts
import { signalStore, withState, withMethods, patchState, withComputed } from '@ngrx/signals';
import { computed } from '@angular/core';

export type DatePreset =
  | 'today' | 'yesterday' | 'last7' | 'last30' | 'mtd' | 'last_month'
  | 'last_3_months' | 'last_6_months' | 'ytd' | 'calendar_year' | 'last_year'
  | 'q1' | 'q2' | 'q3' | 'q4' | 'custom';

export interface FilterState {
  airport: string;
  datePreset: DatePreset;
  dateFrom: string;   // ISO yyyy-mm-dd
  dateTo: string;
  airline: string | null;
  service: string | null;
  handledBy: 'SELF' | 'OUTSOURCED' | null;
  flight: string | null;
  agentNo: string | null;
}

const initial: FilterState = {
  airport: '', datePreset: 'mtd', dateFrom: '', dateTo: '',
  airline: null, service: null, handledBy: null, flight: null, agentNo: null,
};

export const FilterStore = signalStore(
  { providedIn: 'root' },
  withState(initial),
  withComputed((s) => ({
    hasAnyFilter: computed(() => !!(s.airline() || s.service() || s.handledBy() || s.flight() || s.agentNo())),
    queryParams: computed(() => {
      const q: Record<string, string> = {
        airport: s.airport(),
        date_from: s.dateFrom(),
        date_to: s.dateTo(),
      };
      if (s.airline()) q['airline'] = s.airline()!;
      if (s.service()) q['service'] = s.service()!;
      if (s.handledBy()) q['handled_by'] = s.handledBy()!;
      if (s.flight()) q['flight'] = s.flight()!;
      if (s.agentNo()) q['agent_no'] = s.agentNo()!;
      return q;
    }),
  })),
  withMethods((store) => ({
    setAirport(code: string) { patchState(store, { airport: code }); },
    setDateRange(preset: DatePreset, from: string, to: string) {
      patchState(store, { datePreset: preset, dateFrom: from, dateTo: to });
    },
    setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
      patchState(store, { [key]: value } as Partial<FilterState>);
    },
    clearSecondary() {
      patchState(store, { airline: null, service: null, handledBy: null, flight: null, agentNo: null });
    },
    reset() { patchState(store, initial); },
  })),
);
```

- [ ] **Step 5: Create ApiClient**

`frontend/src/app/core/api/api.client.ts`:
```ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiClient {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl;

  get<T>(path: string, params?: Record<string, string | number | null | undefined>): Observable<T> {
    let p = new HttpParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== null && v !== undefined && v !== '') p = p.set(k, String(v));
      }
    }
    return this.http.get<T>(`${this.base}${path}`, { params: p, withCredentials: true });
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${this.base}${path}`, body, { withCredentials: true });
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(`${this.base}${path}`, { withCredentials: true });
  }
}
```

- [ ] **Step 6: Create AuthService + AuthInterceptor**

`frontend/src/app/core/auth/auth.service.ts`:
```ts
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom, Observable, tap } from 'rxjs';
import { ApiClient } from '../api/api.client';
import { AuthStore, Employee } from '../store/auth.store';

interface LoginResponse { access_token: string; employee: Employee; }
interface RefreshResponse { access_token: string; }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiClient);
  private store = inject(AuthStore);
  private router = inject(Router);

  login(username: string, password: string, tenantSlug: string): Observable<LoginResponse> {
    return this.api.post<LoginResponse>('/auth/login', { username, password, tenant_slug: tenantSlug }).pipe(
      tap((res) => this.store.setSession(res.access_token, res.employee)),
    );
  }

  refresh(): Observable<RefreshResponse> {
    return this.api.post<RefreshResponse>('/auth/refresh', {}).pipe(
      tap((res) => this.store.setAccessToken(res.access_token)),
    );
  }

  async logout(): Promise<void> {
    try { await firstValueFrom(this.api.post<void>('/auth/logout', {})); } catch {}
    this.store.clear();
    this.router.navigate(['/login']);
  }

  token(): string | null { return this.store.accessToken(); }
}
```

`frontend/src/app/core/auth/auth.interceptor.ts`:
```ts
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { TenantStore } from '../store/tenant.store';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const tenant = inject(TenantStore);
  const token = auth.token();
  const slug = tenant.slug();

  let headers = req.headers;
  if (token && !req.url.endsWith('/auth/refresh')) headers = headers.set('Authorization', `Bearer ${token}`);
  if (slug) headers = headers.set('X-Tenant-Slug', slug);

  const authed = req.clone({ headers });

  return next(authed).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !req.url.endsWith('/auth/refresh') && !req.url.endsWith('/auth/login')) {
        return auth.refresh().pipe(
          switchMap(() => {
            const retryHeaders = authed.headers.set('Authorization', `Bearer ${auth.token()}`);
            return next(authed.clone({ headers: retryHeaders }));
          }),
          catchError((refreshErr) => { auth.logout(); return throwError(() => refreshErr); }),
        );
      }
      return throwError(() => err);
    }),
  );
};
```

- [ ] **Step 7: Create AuthGuard and TenantResolver**

`frontend/src/app/core/auth/auth.guard.ts`:
```ts
import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthStore } from '../store/auth.store';

export const authGuard: CanActivateFn = () => {
  const store = inject(AuthStore);
  const router = inject(Router);
  if (store.isAuthenticated()) return true;
  router.navigate(['/login']);
  return false;
};
```

`frontend/src/app/core/auth/tenant.resolver.ts`:
```ts
import { ResolveFn } from '@angular/router';
import { inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../api/api.client';
import { TenantStore } from '../store/tenant.store';
import { environment } from '../../../environments/environment';

interface TenantConfig { slug: string; name: string; logo_url: string; primary_color: string; }

export const tenantResolver: ResolveFn<boolean> = async () => {
  const api = inject(ApiClient);
  const store = inject(TenantStore);
  if (store.loaded()) return true;

  const host = window.location.hostname;
  let slug = host.split('.')[0];
  if (host === 'localhost' || host.startsWith('127.')) slug = environment.defaultTenantSlug;

  try {
    const cfg = await firstValueFrom(api.get<TenantConfig>(`/tenants/config`, { slug }));
    store.setTenant({ slug: cfg.slug, name: cfg.name, logoUrl: cfg.logo_url, primaryColor: cfg.primary_color });
  } catch {
    store.setTenant({ slug, name: slug, logoUrl: '', primaryColor: '#1976d2' });
  }
  return true;
};
```

- [ ] **Step 8: Wire up `app.config.ts` and `app.routes.ts`**

`frontend/src/app/app.config.ts`:
```ts
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors, withFetch } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideAnimationsAsync(),
  ],
};
```

`frontend/src/app/app.routes.ts`:
```ts
import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { tenantResolver } from './core/auth/tenant.resolver';

export const routes: Routes = [
  {
    path: 'login',
    resolve: { tenant: tenantResolver },
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'home',
    canActivate: [authGuard],
    resolve: { tenant: tenantResolver },
    loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    resolve: { tenant: tenantResolver },
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  { path: '**', redirectTo: 'home' },
];
```

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/core frontend/src/environments frontend/src/app/app.config.ts frontend/src/app/app.routes.ts
git commit -m "feat(frontend): core auth (service/interceptor/guard), stores, API client, tenant resolver"
```

---

---

## Phase 8: Angular Frontend — Pages

### Task 13: Login Page

**Files:**
- Create: `frontend/src/app/features/auth/login/login.component.ts`
- Create: `frontend/src/app/features/auth/login/login.component.html`
- Create: `frontend/src/app/features/auth/login/login.component.scss`
- Create: `frontend/src/assets/images/aviation-bg.jpg` (placeholder — any aviation stock image)

- [ ] **Step 1: Create login component TS**

`frontend/src/app/features/auth/login/login.component.ts`:
```ts
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/auth/auth.service';
import { TenantStore } from '../../../core/store/tenant.store';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatInputModule, MatFormFieldModule, MatCheckboxModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  tenant = inject(TenantStore);

  username = signal('');
  password = signal('');
  rememberMe = signal(false);
  loading = signal(false);
  error = signal<string | null>(null);

  async onSubmit() {
    if (!this.username() || !this.password()) {
      this.error.set('Username and password are required');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      await new Promise<void>((resolve, reject) => {
        this.auth.login(this.username(), this.password(), this.tenant.slug()).subscribe({
          next: () => resolve(),
          error: (e) => reject(e),
        });
      });
      this.router.navigate(['/home']);
    } catch (e: any) {
      this.error.set(e?.error?.message ?? 'Login failed — check credentials');
    } finally {
      this.loading.set(false);
    }
  }
}
```

- [ ] **Step 2: Create login HTML**

`frontend/src/app/features/auth/login/login.component.html`:
```html
<div class="login-container">
  <div class="login-left">
    <div class="login-form-wrapper">
      <div class="tenant-brand">
        <img *ngIf="tenant.logoUrl()" [src]="tenant.logoUrl()" [alt]="tenant.name()" class="tenant-logo"/>
        <h1 class="tenant-name">{{ tenant.name() || 'PRM Dashboard' }}</h1>
      </div>

      <form class="login-form" (ngSubmit)="onSubmit()">
        <h2>Sign in</h2>
        <p class="subtitle">Access your PRM analytics dashboard</p>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Username</mat-label>
          <input matInput [ngModel]="username()" (ngModelChange)="username.set($event)" name="username" autocomplete="username" required />
          <mat-icon matPrefix>person</mat-icon>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Password</mat-label>
          <input matInput type="password" [ngModel]="password()" (ngModelChange)="password.set($event)" name="password" autocomplete="current-password" required />
          <mat-icon matPrefix>lock</mat-icon>
        </mat-form-field>

        <mat-checkbox [ngModel]="rememberMe()" (ngModelChange)="rememberMe.set($event)" name="remember">Remember me</mat-checkbox>

        <div class="error-message" *ngIf="error()">{{ error() }}</div>

        <button mat-raised-button color="primary" type="submit" class="full-width login-btn" [disabled]="loading()">
          <mat-spinner *ngIf="loading()" diameter="20"></mat-spinner>
          <span *ngIf="!loading()">Log in</span>
        </button>
      </form>

      <footer class="login-footer">Powered by <strong>PRM Dashboard</strong></footer>
    </div>
  </div>

  <div class="login-right" [style.background-image]="'url(/assets/images/aviation-bg.jpg)'">
    <div class="overlay"></div>
    <div class="right-content">
      <h2>Ground Handling. Reimagined.</h2>
      <p>Real-time insights into PRM services across your airports.</p>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Create login SCSS**

`frontend/src/app/features/auth/login/login.component.scss`:
```scss
.login-container {
  display: flex;
  height: 100vh;
  width: 100%;
}
.login-left {
  flex: 0 0 40%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fafafa;
}
.login-form-wrapper {
  width: 100%;
  max-width: 380px;
  padding: 2rem;
}
.tenant-brand {
  text-align: center;
  margin-bottom: 2rem;
  .tenant-logo { max-height: 60px; margin-bottom: 0.5rem; }
  .tenant-name { font-size: 1.5rem; font-weight: 600; margin: 0; }
}
.login-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  h2 { margin: 0; font-size: 1.75rem; font-weight: 600; }
  .subtitle { color: #666; margin: 0 0 1rem; }
}
.full-width { width: 100%; }
.error-message {
  color: #d32f2f;
  font-size: 0.875rem;
  background: #fde7e7;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
}
.login-btn { height: 44px; }
.login-footer { margin-top: 2rem; text-align: center; color: #999; font-size: 0.85rem; }

.login-right {
  flex: 1;
  position: relative;
  background-size: cover;
  background-position: center;
  .overlay {
    position: absolute; inset: 0;
    background: linear-gradient(135deg, rgba(30, 136, 229, 0.75), rgba(25, 118, 210, 0.85));
  }
  .right-content {
    position: relative;
    z-index: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 4rem;
    color: #fff;
    h2 { font-size: 2.5rem; font-weight: 700; margin: 0 0 1rem; }
    p { font-size: 1.25rem; opacity: 0.9; }
  }
}

@media (max-width: 768px) {
  .login-right { display: none; }
  .login-left { flex: 1; }
}
```

- [ ] **Step 4: Add placeholder aviation image**

Drop any aviation stock image at `frontend/src/assets/images/aviation-bg.jpg`. For the POC, a free Unsplash aerial-airport image is fine. If the image is missing the SCSS gradient overlay still renders with the blue tint.

- [ ] **Step 5: Verify login page renders**

Run: `cd frontend && npm start`. Visit http://localhost:4200/login. Expected:
- Split layout with tenant name on left, blue-tinted image on right
- Form validation works (empty fields show error)
- With backend running, `admin` / `admin123` logs in and navigates to `/home`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/auth frontend/src/assets/images/aviation-bg.jpg
git commit -m "feat(frontend): login page with split layout and tenant branding"
```

### Task 14: Home Page, Top Bar, Airport Selector

**Files:**
- Create: `frontend/src/app/shared/components/top-bar/top-bar.component.ts` + `.html` + `.scss`
- Create: `frontend/src/app/shared/components/airport-selector/airport-selector.component.ts`
- Create: `frontend/src/app/features/home/home.component.ts` + `.html` + `.scss`

- [ ] **Step 1: Create AirportSelectorComponent**

`frontend/src/app/shared/components/airport-selector/airport-selector.component.ts`:
```ts
import { Component, computed, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { AuthStore } from '../../../core/store/auth.store';
import { FilterStore } from '../../../core/store/filter.store';

@Component({
  selector: 'app-airport-selector',
  standalone: true,
  imports: [CommonModule, FormsModule, MatSelectModule, MatFormFieldModule],
  template: `
    <mat-form-field appearance="outline" class="airport-field" subscriptSizing="dynamic">
      <mat-label>Airport</mat-label>
      <mat-select
        [ngModel]="filters.airport()"
        (ngModelChange)="onChange($event)"
        [disabled]="airports().length <= 1">
        <mat-option *ngFor="let a of airports()" [value]="a.code">
          {{ a.code }} — {{ a.name }}
        </mat-option>
      </mat-select>
    </mat-form-field>
  `,
  styles: [`.airport-field { width: 260px; }`],
})
export class AirportSelectorComponent {
  private auth = inject(AuthStore);
  filters = inject(FilterStore);
  airports = computed(() => this.auth.employee()?.airports ?? []);

  constructor() {
    effect(() => {
      // Default to first airport if none selected and airports are loaded
      const list = this.airports();
      if (list.length > 0 && !this.filters.airport()) {
        this.filters.setAirport(list[0].code);
      }
    }, { allowSignalWrites: true });
  }

  onChange(code: string) { this.filters.setAirport(code); this.filters.clearSecondary(); }
}
```

- [ ] **Step 2: Create TopBarComponent**

`frontend/src/app/shared/components/top-bar/top-bar.component.ts`:
```ts
import { Component, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { AirportSelectorComponent } from '../airport-selector/airport-selector.component';
import { TenantStore } from '../../../core/store/tenant.store';
import { AuthStore } from '../../../core/store/auth.store';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [CommonModule, RouterLink, MatToolbarModule, MatButtonModule, MatMenuModule, MatIconModule, AirportSelectorComponent],
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.scss',
})
export class TopBarComponent {
  showBack = input<boolean>(false);
  tenant = inject(TenantStore);
  auth = inject(AuthStore);
  private authSvc = inject(AuthService);

  logout() { this.authSvc.logout(); }
}
```

`frontend/src/app/shared/components/top-bar/top-bar.component.html`:
```html
<mat-toolbar class="top-bar" [style.border-bottom-color]="tenant.primaryColor()">
  <div class="brand">
    <img *ngIf="tenant.logoUrl()" [src]="tenant.logoUrl()" alt="logo" class="logo"/>
    <span class="tenant-name">{{ tenant.name() }}</span>
  </div>

  <span class="spacer"></span>

  <app-airport-selector></app-airport-selector>

  <a *ngIf="showBack()" mat-button routerLink="/home" class="back-btn">
    <mat-icon>arrow_back</mat-icon> Back
  </a>

  <button mat-button [matMenuTriggerFor]="userMenu" class="user-btn">
    <mat-icon>account_circle</mat-icon>
    <span>{{ auth.employee()?.displayName }}</span>
  </button>
  <mat-menu #userMenu="matMenu">
    <button mat-menu-item (click)="logout()">
      <mat-icon>logout</mat-icon><span>Logout</span>
    </button>
  </mat-menu>
</mat-toolbar>
```

`frontend/src/app/shared/components/top-bar/top-bar.component.scss`:
```scss
.top-bar {
  background: #fff;
  color: #222;
  border-bottom: 3px solid #1976d2;
  padding: 0 1.5rem;
  height: 64px;
  display: flex;
  align-items: center;
  gap: 1rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.04);
}
.brand { display: flex; align-items: center; gap: 0.75rem; }
.logo { height: 32px; }
.tenant-name { font-weight: 600; font-size: 1.1rem; }
.spacer { flex: 1; }
.back-btn, .user-btn { text-transform: none; }
.user-btn span { margin-left: 0.25rem; }
```

- [ ] **Step 3: Create HomeComponent**

`frontend/src/app/features/home/home.component.ts`:
```ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { TopBarComponent } from '../../shared/components/top-bar/top-bar.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, MatCardModule, TopBarComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {}
```

`frontend/src/app/features/home/home.component.html`:
```html
<app-top-bar></app-top-bar>

<main class="home-main">
  <div class="welcome">
    <h1>Welcome to your dashboards</h1>
    <p>Select a dashboard to get started</p>
  </div>

  <div class="dashboard-grid">
    <a routerLink="/dashboard" class="dashboard-tile">
      <mat-card class="tile-card">
        <div class="tile-icon"><mat-icon>accessible</mat-icon></div>
        <h2>PRM Dashboard</h2>
        <p>Passenger with Reduced Mobility analytics across your airports</p>
      </mat-card>
    </a>
    <!-- Future tiles can be added here -->
  </div>
</main>
```

`frontend/src/app/features/home/home.component.scss`:
```scss
.home-main {
  padding: 3rem 2rem;
  max-width: 1200px;
  margin: 0 auto;
}
.welcome {
  text-align: center;
  margin-bottom: 3rem;
  h1 { font-size: 2rem; font-weight: 600; margin: 0 0 0.5rem; }
  p  { color: #666; font-size: 1.1rem; margin: 0; }
}
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 320px));
  gap: 2rem;
  justify-content: center;
}
.dashboard-tile {
  text-decoration: none;
  color: inherit;
  transition: transform 200ms ease;
  &:hover { transform: translateY(-4px); }
}
.tile-card {
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  border-radius: 16px;
  background: linear-gradient(135deg, #1e88e5, #1565c0);
  color: #fff;
  box-shadow: 0 8px 24px rgba(25, 118, 210, 0.25);
  h2 { margin: 1rem 0 0.5rem; font-size: 1.5rem; }
  p  { opacity: 0.9; margin: 0; }
}
.tile-icon mat-icon {
  font-size: 64px;
  width: 64px;
  height: 64px;
}
```

- [ ] **Step 4: Fetch employee profile on home load**

Home relies on `AuthStore.employee()` having airports. If the user landed directly at `/home` (e.g., after full refresh), we need to re-hydrate. Add a `/auth/me` call in `AuthService.ensureProfile()`:

Update `frontend/src/app/core/auth/auth.service.ts` — add method:
```ts
ensureProfile(): Observable<Employee> {
  return this.api.get<Employee>('/auth/me').pipe(
    tap((emp) => {
      const tok = this.store.accessToken();
      if (tok) this.store.setSession(tok, emp);
    }),
  );
}
```

Call it in HomeComponent `ngOnInit`:
```ts
ngOnInit() {
  if (!this.authStore.employee()) {
    this.authSvc.ensureProfile().subscribe();
  }
}
```

- [ ] **Step 5: Verify**

Run frontend, log in, confirm:
- Home page shows top bar with tenant name, airport dropdown (populated from JWT airports claim), user menu
- "PRM Dashboard" gradient card visible
- Clicking card navigates to `/dashboard`
- Airport dropdown shows only allowed airports for logged-in user

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/shared/components frontend/src/app/features/home frontend/src/app/core/auth/auth.service.ts
git commit -m "feat(frontend): home page, top bar, airport selector with RBAC"
```

### Task 15: Dashboard Shell, Filter Bar, Date Presets, KPI Card, Chart Wrappers

This task creates the dashboard shell (tab container + filter bar) and all reusable chart wrapper components. Broken into 10 sub-tasks.

**Files:**
- Create: `frontend/src/app/features/dashboard/dashboard.component.ts` + `.html` + `.scss`
- Create: `frontend/src/app/features/dashboard/services/prm-data.service.ts`
- Create: `frontend/src/app/features/dashboard/utils/date-presets.ts`
- Create: `frontend/src/app/features/dashboard/components/date-range-picker/date-range-picker.component.ts`
- Create: `frontend/src/app/features/dashboard/components/filter-bar/filter-bar.component.ts`
- Create: `frontend/src/app/features/dashboard/components/kpi-card/kpi-card.component.ts`
- Create: `frontend/src/app/shared/charts/base-chart.component.ts`
- Create: `frontend/src/app/shared/charts/bar-chart/bar-chart.component.ts`
- Create: `frontend/src/app/shared/charts/donut-chart/donut-chart.component.ts`
- Create: `frontend/src/app/shared/charts/line-chart/line-chart.component.ts`
- Create: `frontend/src/app/shared/charts/horizontal-bar-chart/horizontal-bar-chart.component.ts`
- Create: `frontend/src/app/shared/charts/sankey-chart/sankey-chart.component.ts`
- Create: `frontend/src/app/shared/charts/heatmap-chart/heatmap-chart.component.ts`
- Modify: `frontend/src/app/app.config.ts` (add `provideEcharts`)

- [ ] **Step 1: Configure ngx-echarts in `app.config.ts`**

Add to providers:
```ts
import { provideEchartsCore } from 'ngx-echarts';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, SankeyChart, HeatmapChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent, DatasetComponent, VisualMapComponent, DataZoomComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([BarChart, LineChart, PieChart, SankeyChart, HeatmapChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, DatasetComponent, VisualMapComponent, DataZoomComponent, CanvasRenderer]);

// in providers array:
provideEchartsCore({ echarts }),
```

- [ ] **Step 2: Create date-presets utility**

`frontend/src/app/features/dashboard/utils/date-presets.ts`:
```ts
import { DatePreset } from '../../../core/store/filter.store';

export const POC_TODAY = new Date(2026, 2, 31); // March 31, 2026 (month is 0-indexed)

function iso(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

export interface PresetRange { from: string; to: string; label: string; }

export const PRESET_DEFS: Array<{ key: DatePreset; label: string }> = [
  { key: 'today',         label: 'Today' },
  { key: 'yesterday',     label: 'Yesterday' },
  { key: 'last7',         label: 'Last 7 Days' },
  { key: 'last30',        label: 'Last 30 Days' },
  { key: 'mtd',           label: 'Month to Date' },
  { key: 'last_month',    label: 'Last Month' },
  { key: 'last_3_months', label: 'Last 3 Months' },
  { key: 'last_6_months', label: 'Last 6 Months' },
  { key: 'ytd',           label: 'Year to Date' },
  { key: 'calendar_year', label: 'Calendar Year' },
  { key: 'last_year',     label: 'Last Year' },
  { key: 'q1',            label: 'Q1 (Jan-Mar)' },
  { key: 'q2',            label: 'Q2 (Apr-Jun)' },
  { key: 'q3',            label: 'Q3 (Jul-Sep)' },
  { key: 'q4',            label: 'Q4 (Oct-Dec)' },
  { key: 'custom',        label: 'Custom Range' },
];

export function resolvePreset(preset: DatePreset, today: Date = POC_TODAY): PresetRange {
  const y = today.getFullYear(), m = today.getMonth();
  const label = PRESET_DEFS.find(p => p.key === preset)?.label ?? '';
  switch (preset) {
    case 'today':         return { from: iso(today), to: iso(today), label };
    case 'yesterday':     { const d = addDays(today, -1); return { from: iso(d), to: iso(d), label }; }
    case 'last7':         return { from: iso(addDays(today, -6)), to: iso(today), label };
    case 'last30':        return { from: iso(addDays(today, -29)), to: iso(today), label };
    case 'mtd':           return { from: iso(new Date(y, m, 1)), to: iso(today), label };
    case 'last_month': {
      const first = new Date(y, m - 1, 1);
      const last  = new Date(y, m, 0);
      return { from: iso(first), to: iso(last), label };
    }
    case 'last_3_months': return { from: iso(new Date(y, m - 3, 1)), to: iso(new Date(y, m, 0)), label };
    case 'last_6_months': return { from: iso(new Date(y, m - 6, 1)), to: iso(new Date(y, m, 0)), label };
    case 'ytd':           return { from: iso(new Date(y, 0, 1)), to: iso(today), label };
    case 'calendar_year': return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)), label };
    case 'last_year':     return { from: iso(new Date(y - 1, 0, 1)), to: iso(new Date(y - 1, 11, 31)), label };
    case 'q1':            return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 2, 31)), label };
    case 'q2':            return { from: iso(new Date(y, 3, 1)), to: iso(new Date(y, 5, 30)), label };
    case 'q3':            return { from: iso(new Date(y, 6, 1)), to: iso(new Date(y, 8, 30)), label };
    case 'q4':            return { from: iso(new Date(y, 9, 1)), to: iso(new Date(y, 11, 31)), label };
    case 'custom':        return { from: '', to: '', label };
  }
}
```

- [ ] **Step 3: Create PrmDataService (centralizes all PRM API calls)**

`frontend/src/app/features/dashboard/services/prm-data.service.ts`:
```ts
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api.client';
import { FilterStore } from '../../../core/store/filter.store';

@Injectable({ providedIn: 'root' })
export class PrmDataService {
  private api = inject(ApiClient);
  private filters = inject(FilterStore);

  private params(extra: Record<string, string | number | null | undefined> = {}) {
    return { ...this.filters.queryParams(), ...extra };
  }

  // KPIs
  kpisSummary()              { return this.api.get<any>('/prm/kpis/summary', this.params()); }
  handlingDistribution()     { return this.api.get<any>('/prm/kpis/handling-distribution', this.params()); }
  requestedVsProvided()      { return this.api.get<any>('/prm/kpis/requested-vs-provided', this.params()); }

  // Trends
  trendsDaily(metric: 'count' | 'duration' | 'agents' = 'count') {
    return this.api.get<any>('/prm/trends/daily', this.params({ metric }));
  }
  trendsMonthly()            { return this.api.get<any>('/prm/trends/monthly', this.params()); }
  trendsHourly()             { return this.api.get<any>('/prm/trends/hourly', this.params()); }
  trendsRequestedProvided()  { return this.api.get<any>('/prm/trends/requested-vs-provided', this.params()); }

  // Rankings
  topAirlines(limit = 10)    { return this.api.get<any>('/prm/rankings/airlines', this.params({ limit })); }
  topFlights(limit = 10)     { return this.api.get<any>('/prm/rankings/flights', this.params({ limit })); }
  topAgents(limit = 10)      { return this.api.get<any>('/prm/rankings/agents', this.params({ limit })); }
  topServices()              { return this.api.get<any>('/prm/rankings/services', this.params()); }

  // Breakdowns
  byServiceType()            { return this.api.get<any>('/prm/breakdowns/by-service-type', this.params()); }
  byAgentType()              { return this.api.get<any>('/prm/breakdowns/by-agent-type', this.params()); }
  byAirline()                { return this.api.get<any>('/prm/breakdowns/by-airline', this.params()); }
  byLocation()               { return this.api.get<any>('/prm/breakdowns/by-location', this.params()); }
  byRoute()                  { return this.api.get<any>('/prm/breakdowns/by-route', this.params()); }

  // Performance
  durationStats()            { return this.api.get<any>('/prm/performance/duration-stats', this.params()); }
  durationDistribution()     { return this.api.get<any>('/prm/performance/duration-distribution', this.params()); }
  noShows()                  { return this.api.get<any>('/prm/performance/no-shows', this.params()); }
  pauseAnalysis()            { return this.api.get<any>('/prm/performance/pause-analysis', this.params()); }

  // Filters & records
  filterOptions(): Observable<any> {
    return this.api.get<any>('/prm/filters/options', { airport: this.filters.airport() });
  }
  records(page: number, size: number) {
    return this.api.get<any>('/prm/records', this.params({ page, size }));
  }
}
```

- [ ] **Step 4: Create DateRangePickerComponent**

`frontend/src/app/features/dashboard/components/date-range-picker/date-range-picker.component.ts`:
```ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { FilterStore, DatePreset } from '../../../../core/store/filter.store';
import { PRESET_DEFS, resolvePreset } from '../../utils/date-presets';

@Component({
  selector: 'app-date-range-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatMenuModule, MatIconModule, MatFormFieldModule, MatInputModule, MatDatepickerModule, MatNativeDateModule],
  template: `
    <button mat-stroked-button [matMenuTriggerFor]="menu" class="range-btn">
      <mat-icon>date_range</mat-icon>
      {{ currentLabel() }}
      <mat-icon>arrow_drop_down</mat-icon>
    </button>
    <mat-menu #menu="matMenu" class="date-preset-menu">
      <button mat-menu-item *ngFor="let p of presets"
              [class.active]="filters.datePreset() === p.key"
              (click)="select(p.key)">
        {{ p.label }}
      </button>
    </mat-menu>
  `,
  styles: [`
    .range-btn { min-width: 200px; justify-content: space-between; }
    .active { background: rgba(25, 118, 210, 0.1); font-weight: 600; }
  `],
})
export class DateRangePickerComponent {
  filters = inject(FilterStore);
  presets = PRESET_DEFS.filter(p => p.key !== 'custom'); // custom handled separately

  currentLabel(): string {
    const p = PRESET_DEFS.find(x => x.key === this.filters.datePreset());
    return p?.label ?? 'Select range';
  }

  select(preset: DatePreset) {
    const r = resolvePreset(preset);
    this.filters.setDateRange(preset, r.from, r.to);
  }
}
```

- [ ] **Step 5: Create FilterBarComponent**

`frontend/src/app/features/dashboard/components/filter-bar/filter-bar.component.ts`:
```ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DateRangePickerComponent } from '../date-range-picker/date-range-picker.component';
import { FilterStore } from '../../../../core/store/filter.store';
import { PrmDataService } from '../../services/prm-data.service';

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatSelectModule, MatChipsModule, MatButtonModule, MatIconModule, DateRangePickerComponent],
  templateUrl: './filter-bar.component.html',
  styleUrl: './filter-bar.component.scss',
})
export class FilterBarComponent implements OnInit {
  filters = inject(FilterStore);
  private dataSvc = inject(PrmDataService);

  airlines = signal<string[]>([]);
  services = signal<string[]>([]);
  loaded = signal(false);

  ngOnInit() {
    this.dataSvc.filterOptions().subscribe({
      next: (res: any) => {
        this.airlines.set(res.airlines ?? []);
        this.services.set(res.services ?? []);
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true),
    });
  }

  setAirline(v: string | null)  { this.filters.setFilter('airline', v); }
  setService(v: string | null)  { this.filters.setFilter('service', v); }
  setHandledBy(v: 'SELF' | 'OUTSOURCED' | null) { this.filters.setFilter('handledBy', v); }
  clearAll() { this.filters.clearSecondary(); }
}
```

`frontend/src/app/features/dashboard/components/filter-bar/filter-bar.component.html`:
```html
<div class="filter-bar">
  <div class="filter-controls">
    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="filter-field">
      <mat-label>Airline</mat-label>
      <mat-select [ngModel]="filters.airline()" (ngModelChange)="setAirline($event)">
        <mat-option [value]="null">All airlines</mat-option>
        <mat-option *ngFor="let a of airlines()" [value]="a">{{ a }}</mat-option>
      </mat-select>
    </mat-form-field>

    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="filter-field">
      <mat-label>Service Type</mat-label>
      <mat-select [ngModel]="filters.service()" (ngModelChange)="setService($event)">
        <mat-option [value]="null">All services</mat-option>
        <mat-option *ngFor="let s of services()" [value]="s">{{ s }}</mat-option>
      </mat-select>
    </mat-form-field>

    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="filter-field">
      <mat-label>Handled By</mat-label>
      <mat-select [ngModel]="filters.handledBy()" (ngModelChange)="setHandledBy($event)">
        <mat-option [value]="null">Both</mat-option>
        <mat-option value="SELF">Self</mat-option>
        <mat-option value="OUTSOURCED">Outsourced</mat-option>
      </mat-select>
    </mat-form-field>

    <app-date-range-picker></app-date-range-picker>
  </div>

  <mat-chip-set class="active-chips" *ngIf="filters.hasAnyFilter()">
    <mat-chip *ngIf="filters.airline()" (removed)="setAirline(null)">
      Airline: {{ filters.airline() }} <mat-icon matChipRemove>cancel</mat-icon>
    </mat-chip>
    <mat-chip *ngIf="filters.service()" (removed)="setService(null)">
      Service: {{ filters.service() }} <mat-icon matChipRemove>cancel</mat-icon>
    </mat-chip>
    <mat-chip *ngIf="filters.handledBy()" (removed)="setHandledBy(null)">
      {{ filters.handledBy() }} <mat-icon matChipRemove>cancel</mat-icon>
    </mat-chip>
    <button mat-button color="warn" (click)="clearAll()">Clear All</button>
  </mat-chip-set>
</div>
```

`frontend/src/app/features/dashboard/components/filter-bar/filter-bar.component.scss`:
```scss
.filter-bar {
  padding: 1rem 1.5rem;
  background: #fff;
  border-bottom: 1px solid #e5e5e5;
}
.filter-controls {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  align-items: center;
}
.filter-field { min-width: 180px; }
.active-chips { margin-top: 0.75rem; }
```

- [ ] **Step 6: Create KpiCardComponent**

`frontend/src/app/features/dashboard/components/kpi-card/kpi-card.component.ts`:
```ts
import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="kpi-card" [class]="gradientClass()">
      <div class="kpi-header">
        <mat-icon>{{ icon() }}</mat-icon>
        <span class="kpi-label">{{ label() }}</span>
      </div>
      <div class="kpi-value">{{ value() }}</div>
      <div class="kpi-delta" *ngIf="delta() !== null" [class.positive]="(delta() ?? 0) >= 0">
        <mat-icon>{{ (delta() ?? 0) >= 0 ? 'trending_up' : 'trending_down' }}</mat-icon>
        {{ (delta() ?? 0) | number:'1.1-1' }}%
        <span class="delta-label">vs prev period</span>
      </div>
      <div class="kpi-subtext" *ngIf="subtext()">{{ subtext() }}</div>
    </div>
  `,
  styles: [`
    .kpi-card {
      padding: 1.25rem 1.5rem;
      border-radius: 12px;
      color: #fff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      min-height: 140px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: transform 200ms ease;
      &:hover { transform: translateY(-2px); }
    }
    .grad-blue   { background: linear-gradient(135deg, #1e88e5, #1565c0); }
    .grad-teal   { background: linear-gradient(135deg, #26a69a, #00796b); }
    .grad-orange { background: linear-gradient(135deg, #fb8c00, #ef6c00); }
    .grad-purple { background: linear-gradient(135deg, #7e57c2, #4527a0); }
    .grad-green  { background: linear-gradient(135deg, #66bb6a, #2e7d32); }
    .kpi-header  { display: flex; align-items: center; gap: 0.5rem; opacity: 0.9; font-size: 0.85rem; }
    .kpi-value   { font-size: 2rem; font-weight: 700; line-height: 1.1; }
    .kpi-delta   { font-size: 0.8rem; display: flex; align-items: center; gap: 0.25rem; opacity: 0.95; }
    .kpi-delta mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .delta-label { opacity: 0.75; margin-left: 0.25rem; }
    .kpi-subtext { font-size: 0.75rem; opacity: 0.85; margin-top: 0.25rem; }
  `],
})
export class KpiCardComponent {
  label    = input.required<string>();
  value    = input.required<string | number>();
  icon     = input<string>('insights');
  delta    = input<number | null>(null);
  subtext  = input<string>('');
  gradient = input<'blue' | 'teal' | 'orange' | 'purple' | 'green'>('blue');
  gradientClass = computed(() => `grad-${this.gradient()}`);
}
```

- [ ] **Step 7: Create BaseChartComponent (shared ECharts wrapper)**

`frontend/src/app/shared/charts/base-chart.component.ts`:
```ts
import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgxEchartsDirective } from 'ngx-echarts';
import { EChartsOption } from 'echarts';

@Component({
  selector: 'app-base-chart',
  standalone: true,
  imports: [CommonModule, NgxEchartsDirective],
  template: `
    <div class="chart-container" [class.loading]="loading()">
      <div *ngIf="title()" class="chart-title">{{ title() }}</div>
      <div class="chart-body">
        <div *ngIf="loading()" class="skeleton">Loading…</div>
        <div *ngIf="!loading() && isEmpty()" class="empty-state">No data matches current filters</div>
        <div *ngIf="!loading() && !isEmpty()"
             echarts
             [options]="options()"
             [autoResize]="true"
             (chartClick)="chartClick.emit($event)"
             class="echart"></div>
      </div>
    </div>
  `,
  styles: [`
    .chart-container { background: #fff; border-radius: 12px; padding: 1rem; box-shadow: 0 2px 8px rgba(0,0,0,0.05); height: 100%; display: flex; flex-direction: column; }
    .chart-title { font-weight: 600; font-size: 0.95rem; margin-bottom: 0.5rem; color: #333; }
    .chart-body { flex: 1; position: relative; min-height: 200px; }
    .echart { width: 100%; height: 100%; min-height: 200px; }
    .skeleton { display: flex; align-items: center; justify-content: center; height: 100%; color: #999; animation: shimmer 1.4s infinite; }
    .empty-state { display: flex; align-items: center; justify-content: center; height: 100%; color: #999; font-size: 0.9rem; }
    @keyframes shimmer { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }
  `],
})
export class BaseChartComponent {
  title    = input<string>('');
  options  = input.required<EChartsOption>();
  loading  = input<boolean>(false);
  isEmpty  = input<boolean>(false);
  chartClick = output<any>();
}
```

- [ ] **Step 8: Create BarChartComponent**

`frontend/src/app/shared/charts/bar-chart/bar-chart.component.ts`:
```ts
import { Component, input, computed, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EChartsOption } from 'echarts';
import { BaseChartComponent } from '../base-chart.component';

export interface BarDatum { label: string; value: number; color?: string; }

@Component({
  selector: 'app-bar-chart',
  standalone: true,
  imports: [CommonModule, BaseChartComponent],
  template: `
    <app-base-chart
      [title]="title()"
      [options]="chartOptions()"
      [loading]="loading()"
      [isEmpty]="data().length === 0"
      (chartClick)="barClick.emit($event.name)">
    </app-base-chart>
  `,
})
export class BarChartComponent {
  title    = input<string>('');
  data     = input.required<BarDatum[]>();
  loading  = input<boolean>(false);
  xLabel   = input<string>('');
  yLabel   = input<string>('');
  horizontal = input<boolean>(false);
  barClick = output<string>();

  chartOptions = computed<EChartsOption>(() => {
    const d = this.data();
    const names = d.map(x => x.label);
    const values = d.map((x, i) => ({ value: x.value, itemStyle: x.color ? { color: x.color } : undefined }));
    const xAxis: any = this.horizontal() ? { type: 'value', name: this.xLabel() } : { type: 'category', data: names, name: this.xLabel(), axisLabel: { rotate: 30 } };
    const yAxis: any = this.horizontal() ? { type: 'category', data: names, name: this.yLabel() } : { type: 'value', name: this.yLabel() };
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 60, right: 20, top: 30, bottom: 60, containLabel: true },
      xAxis, yAxis,
      series: [{
        type: 'bar',
        data: values,
        itemStyle: { color: '#1e88e5', borderRadius: [4, 4, 0, 0] },
        emphasis: { itemStyle: { color: '#1565c0', shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' } },
        animationDuration: 300,
      }],
    };
  });
}
```

- [ ] **Step 9: Create DonutChartComponent**

`frontend/src/app/shared/charts/donut-chart/donut-chart.component.ts`:
```ts
import { Component, input, computed, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EChartsOption } from 'echarts';
import { BaseChartComponent } from '../base-chart.component';

export interface DonutDatum { name: string; value: number; color?: string; }

@Component({
  selector: 'app-donut-chart',
  standalone: true,
  imports: [CommonModule, BaseChartComponent],
  template: `
    <app-base-chart
      [title]="title()"
      [options]="chartOptions()"
      [loading]="loading()"
      [isEmpty]="data().length === 0"
      (chartClick)="segmentClick.emit($event.name)">
    </app-base-chart>
  `,
})
export class DonutChartComponent {
  title   = input<string>('');
  data    = input.required<DonutDatum[]>();
  loading = input<boolean>(false);
  segmentClick = output<string>();

  chartOptions = computed<EChartsOption>(() => ({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { orient: 'horizontal', bottom: 0 },
    series: [{
      type: 'pie',
      radius: ['50%', '75%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
      label: { show: true, formatter: '{b}\n{d}%' },
      emphasis: { scale: true, scaleSize: 6, label: { fontSize: 14, fontWeight: 'bold' } },
      data: this.data().map(d => ({ name: d.name, value: d.value, itemStyle: d.color ? { color: d.color } : undefined })),
      animationDuration: 300,
    }],
  }));
}
```

- [ ] **Step 10: Create LineChart, HorizontalBarChart, SankeyChart, HeatmapChart**

These follow the same pattern as BarChart. Full code:

`frontend/src/app/shared/charts/line-chart/line-chart.component.ts`:
```ts
import { Component, input, computed, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EChartsOption } from 'echarts';
import { BaseChartComponent } from '../base-chart.component';

export interface LineSeries { name: string; data: Array<[string, number]>; color?: string; type?: 'line' | 'bar' | 'area'; }

@Component({
  selector: 'app-line-chart',
  standalone: true,
  imports: [CommonModule, BaseChartComponent],
  template: `
    <app-base-chart [title]="title()" [options]="chartOptions()" [loading]="loading()" [isEmpty]="isEmpty()"></app-base-chart>
  `,
})
export class LineChartComponent {
  title   = input<string>('');
  series  = input.required<LineSeries[]>();
  loading = input<boolean>(false);
  showAvgLine = input<boolean>(true);
  dualAxis = input<boolean>(false);
  stacked = input<boolean>(false);

  isEmpty = computed(() => this.series().every(s => s.data.length === 0));

  chartOptions = computed<EChartsOption>(() => {
    const srs = this.series();
    const xs = srs[0]?.data.map(d => d[0]) ?? [];
    const allValues = srs.flatMap(s => s.data.map(d => d[1]));
    const avg = allValues.length ? allValues.reduce((a, b) => a + b, 0) / allValues.length : 0;

    const chartSeries: any[] = srs.map((s, idx) => ({
      name: s.name,
      type: s.type === 'bar' ? 'bar' : 'line',
      stack: this.stacked() ? 'total' : undefined,
      yAxisIndex: this.dualAxis() && idx === 1 ? 1 : 0,
      data: s.data.map(d => d[1]),
      smooth: true,
      areaStyle: (s.type === 'area' || this.stacked()) ? { opacity: 0.35 } : undefined,
      itemStyle: s.color ? { color: s.color } : undefined,
      lineStyle: { width: 2 },
      markLine: (idx === 0 && this.showAvgLine()) ? {
        silent: true,
        data: [{ yAxis: avg, lineStyle: { type: 'dashed', color: '#888' }, label: { formatter: `Avg: ${avg.toFixed(0)}` } }],
      } : undefined,
      animationDuration: 300,
    }));

    return {
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      grid: { left: 60, right: 60, top: 40, bottom: 40, containLabel: true },
      xAxis: { type: 'category', data: xs, boundaryGap: srs.some(s => s.type === 'bar') },
      yAxis: this.dualAxis()
        ? [{ type: 'value', position: 'left' }, { type: 'value', position: 'right' }]
        : { type: 'value' },
      series: chartSeries,
    };
  });
}
```

`frontend/src/app/shared/charts/horizontal-bar-chart/horizontal-bar-chart.component.ts`:
```ts
import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BarChartComponent, BarDatum } from '../bar-chart/bar-chart.component';

@Component({
  selector: 'app-horizontal-bar-chart',
  standalone: true,
  imports: [CommonModule, BarChartComponent],
  template: `
    <app-bar-chart [title]="title()" [data]="data()" [loading]="loading()" [horizontal]="true"
                   [xLabel]="xLabel()" [yLabel]="yLabel()"></app-bar-chart>
  `,
})
export class HorizontalBarChartComponent {
  title   = input<string>('');
  data    = input.required<BarDatum[]>();
  loading = input<boolean>(false);
  xLabel  = input<string>('Count');
  yLabel  = input<string>('');
}
```

`frontend/src/app/shared/charts/sankey-chart/sankey-chart.component.ts`:
```ts
import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EChartsOption } from 'echarts';
import { BaseChartComponent } from '../base-chart.component';

export interface SankeyNode { name: string; }
export interface SankeyLink { source: string; target: string; value: number; }

@Component({
  selector: 'app-sankey-chart',
  standalone: true,
  imports: [CommonModule, BaseChartComponent],
  template: `<app-base-chart [title]="title()" [options]="chartOptions()" [loading]="loading()" [isEmpty]="links().length === 0"></app-base-chart>`,
})
export class SankeyChartComponent {
  title   = input<string>('');
  nodes   = input.required<SankeyNode[]>();
  links   = input.required<SankeyLink[]>();
  loading = input<boolean>(false);

  chartOptions = computed<EChartsOption>(() => ({
    tooltip: { trigger: 'item', triggerOn: 'mousemove' },
    series: [{
      type: 'sankey',
      data: this.nodes(),
      links: this.links(),
      emphasis: { focus: 'adjacency' },
      lineStyle: { color: 'gradient', curveness: 0.5 },
      label: { formatter: '{b}' },
      animationDuration: 300,
    }],
  }));
}
```

`frontend/src/app/shared/charts/heatmap-chart/heatmap-chart.component.ts`:
```ts
import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EChartsOption } from 'echarts';
import { BaseChartComponent } from '../base-chart.component';

export interface HeatmapCell { x: string; y: string; value: number; }

@Component({
  selector: 'app-heatmap-chart',
  standalone: true,
  imports: [CommonModule, BaseChartComponent],
  template: `<app-base-chart [title]="title()" [options]="chartOptions()" [loading]="loading()" [isEmpty]="cells().length === 0"></app-base-chart>`,
})
export class HeatmapChartComponent {
  title   = input<string>('');
  cells   = input.required<HeatmapCell[]>();
  xLabels = input.required<string[]>();
  yLabels = input.required<string[]>();
  loading = input<boolean>(false);

  chartOptions = computed<EChartsOption>(() => {
    const cells = this.cells();
    const values = cells.map(c => c.value);
    const xs = this.xLabels(), ys = this.yLabels();
    const data = cells.map(c => [xs.indexOf(c.x), ys.indexOf(c.y), c.value]);
    return {
      tooltip: { position: 'top' },
      grid: { left: 80, right: 20, top: 30, bottom: 50 },
      xAxis: { type: 'category', data: xs, splitArea: { show: true } },
      yAxis: { type: 'category', data: ys, splitArea: { show: true } },
      visualMap: { min: 0, max: Math.max(...values, 1), calculable: true, orient: 'horizontal', left: 'center', bottom: 0, inRange: { color: ['#e3f2fd', '#1565c0'] } },
      series: [{ type: 'heatmap', data, label: { show: true }, emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' } } }],
    };
  });
}
```

- [ ] **Step 11: Create DashboardComponent shell**

`frontend/src/app/features/dashboard/dashboard.component.ts`:
```ts
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { TopBarComponent } from '../../shared/components/top-bar/top-bar.component';
import { FilterBarComponent } from './components/filter-bar/filter-bar.component';
import { OverviewComponent } from './tabs/overview/overview.component';
import { Top10Component } from './tabs/top10/top10.component';
import { ServiceBreakupComponent } from './tabs/service-breakup/service-breakup.component';
import { FulfillmentComponent } from './tabs/fulfillment/fulfillment.component';
import { FilterStore } from '../../core/store/filter.store';
import { resolvePreset } from './utils/date-presets';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MatTabsModule, TopBarComponent, FilterBarComponent,
            OverviewComponent, Top10Component, ServiceBreakupComponent, FulfillmentComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  filters = inject(FilterStore);
  activeTab = signal(0);

  constructor() {
    // Default date range to Month-to-Date if not set
    if (!this.filters.dateFrom()) {
      const r = resolvePreset('mtd');
      this.filters.setDateRange('mtd', r.from, r.to);
    }
  }
}
```

`frontend/src/app/features/dashboard/dashboard.component.html`:
```html
<app-top-bar [showBack]="true"></app-top-bar>
<app-filter-bar></app-filter-bar>

<mat-tab-group [(selectedIndex)]="activeTab" class="dashboard-tabs" animationDuration="200ms">
  <mat-tab label="Overview">
    <app-overview *ngIf="activeTab() === 0"></app-overview>
  </mat-tab>
  <mat-tab label="Top 10">
    <app-top10 *ngIf="activeTab() === 1"></app-top10>
  </mat-tab>
  <mat-tab label="Service Breakup">
    <app-service-breakup *ngIf="activeTab() === 2"></app-service-breakup>
  </mat-tab>
  <mat-tab label="Fulfillment">
    <app-fulfillment *ngIf="activeTab() === 3"></app-fulfillment>
  </mat-tab>
</mat-tab-group>
```

`frontend/src/app/features/dashboard/dashboard.component.scss`:
```scss
:host { display: block; background: #f5f7fa; min-height: 100vh; }
.dashboard-tabs { padding: 1rem 1.5rem; }
::ng-deep .mat-mdc-tab-body-content { padding: 1rem 0; }
```

- [ ] **Step 12: Create empty stub tab components (to unblock compile)**

`frontend/src/app/features/dashboard/tabs/overview/overview.component.ts`:
```ts
import { Component } from '@angular/core';
@Component({ selector: 'app-overview', standalone: true, template: '<div>Overview (Task 16)</div>' })
export class OverviewComponent {}
```

Repeat for `top10/top10.component.ts`, `service-breakup/service-breakup.component.ts`, `fulfillment/fulfillment.component.ts` with matching selectors (`app-top10`, `app-service-breakup`, `app-fulfillment`) and class names. These stubs are replaced in Tasks 16-19.

- [ ] **Step 13: Verify compile and render**

Run: `npm start`. Navigate to `/dashboard`. Expected:
- Top bar + filter bar + 4 tabs visible
- Date range defaults to "Month to Date"
- Filter dropdowns populate from `/prm/filters/options`
- Selecting a preset updates the chips and triggers (empty for now) tab re-render
- No console errors

- [ ] **Step 14: Commit**

```bash
git add frontend/src/app/features/dashboard frontend/src/app/shared/charts frontend/src/app/app.config.ts
git commit -m "feat(frontend): dashboard shell, filter bar, date presets, KPI card, 6 chart wrappers"
```

### Task 16: Tab 1 — Overview

**Files:**
- Modify: `frontend/src/app/features/dashboard/tabs/overview/overview.component.ts`
- Create: `frontend/src/app/features/dashboard/tabs/overview/overview.component.html`
- Create: `frontend/src/app/features/dashboard/tabs/overview/overview.component.scss`

Row 1: 5 KPI cards. Row 2: Daily Trend bar + Handling Distribution donut. Row 3: Service Type donut + Duration histogram + Location horizontal bars.

- [ ] **Step 1: Write overview component TS**

`frontend/src/app/features/dashboard/tabs/overview/overview.component.ts`:
```ts
import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { KpiCardComponent } from '../../components/kpi-card/kpi-card.component';
import { BarChartComponent, BarDatum } from '../../../../shared/charts/bar-chart/bar-chart.component';
import { DonutChartComponent, DonutDatum } from '../../../../shared/charts/donut-chart/donut-chart.component';
import { HorizontalBarChartComponent } from '../../../../shared/charts/horizontal-bar-chart/horizontal-bar-chart.component';
import { PrmDataService } from '../../services/prm-data.service';
import { FilterStore } from '../../../../core/store/filter.store';

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, KpiCardComponent, BarChartComponent, DonutChartComponent, HorizontalBarChartComponent],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss',
})
export class OverviewComponent implements OnInit {
  private data = inject(PrmDataService);
  filters = inject(FilterStore);

  loading = signal(true);

  // KPIs
  totalPrm = signal<number>(0);
  totalDelta = signal<number | null>(null);
  activeAgents = signal<number>(0);
  selfAgents = signal<number>(0);
  outsourcedAgents = signal<number>(0);
  avgPerAgent = signal<number>(0);
  avgDuration = signal<number>(0);
  durationDelta = signal<number | null>(null);
  fulfillmentRate = signal<number>(0);
  fulfillmentDelta = signal<number | null>(null);

  // Charts
  dailyTrend = signal<BarDatum[]>([]);
  handling = signal<DonutDatum[]>([]);
  serviceTypes = signal<DonutDatum[]>([]);
  durationBuckets = signal<BarDatum[]>([]);
  locations = signal<BarDatum[]>([]);

  constructor() {
    // Re-fetch when filters change
    effect(() => {
      this.filters.queryParams(); // subscribe to signal
      this.fetchAll();
    });
  }

  ngOnInit() { this.fetchAll(); }

  fetchAll() {
    if (!this.filters.airport() || !this.filters.dateFrom()) return;
    this.loading.set(true);
    forkJoin({
      kpis: this.data.kpisSummary(),
      handling: this.data.handlingDistribution(),
      trend: this.data.trendsDaily('count'),
      services: this.data.topServices(),
      duration: this.data.durationDistribution(),
      locations: this.data.byLocation(),
    }).subscribe({
      next: (r: any) => {
        this.totalPrm.set(r.kpis.total_prm ?? 0);
        this.totalDelta.set(r.kpis.total_prm_delta_pct ?? null);
        this.activeAgents.set(r.kpis.total_agents ?? 0);
        this.selfAgents.set(r.handling.self_agents ?? 0);
        this.outsourcedAgents.set(r.handling.outsourced_agents ?? 0);
        this.avgPerAgent.set(r.kpis.avg_per_agent_per_day ?? 0);
        this.avgDuration.set(r.kpis.avg_duration_minutes ?? 0);
        this.durationDelta.set(r.kpis.avg_duration_delta_pct ?? null);
        this.fulfillmentRate.set(r.kpis.fulfillment_pct ?? 0);
        this.fulfillmentDelta.set(r.kpis.fulfillment_delta_pct ?? null);

        this.dailyTrend.set((r.trend.points ?? []).map((p: any) => ({ label: p.date.slice(-2), value: p.count })));
        this.handling.set([
          { name: 'Self',       value: r.handling.self_count ?? 0,       color: '#1e88e5' },
          { name: 'Outsourced', value: r.handling.outsourced_count ?? 0, color: '#fb8c00' },
        ]);
        this.serviceTypes.set((r.services.items ?? []).slice(0, 5).map((s: any) => ({ name: s.service, value: s.count })));
        this.durationBuckets.set((r.duration.buckets ?? []).map((b: any) => ({
          label: b.range,
          value: b.count,
          color: b.avg_minutes < 20 ? '#66bb6a' : b.avg_minutes < 40 ? '#fb8c00' : '#ef5350',
        })));
        this.locations.set((r.locations.items ?? []).map((l: any) => ({ label: l.location, value: l.count })));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
```

- [ ] **Step 2: Write overview HTML**

`frontend/src/app/features/dashboard/tabs/overview/overview.component.html`:
```html
<div class="overview-content">
  <!-- Row 1: 5 KPI cards -->
  <div class="row row-kpis">
    <app-kpi-card label="Total PRM Services" [value]="totalPrm() | number" icon="accessible" gradient="blue" [delta]="totalDelta()"></app-kpi-card>
    <app-kpi-card label="Active Agents" [value]="activeAgents()" icon="groups" gradient="teal"
                  [subtext]="'Self: ' + selfAgents() + ' · Outsourced: ' + outsourcedAgents()"></app-kpi-card>
    <app-kpi-card label="Avg Services / Agent / Day" [value]="(avgPerAgent() | number:'1.1-1')" icon="trending_up" gradient="orange"></app-kpi-card>
    <app-kpi-card label="Avg Duration (min)" [value]="(avgDuration() | number:'1.0-0')" icon="timer" gradient="purple" [delta]="durationDelta()"></app-kpi-card>
    <app-kpi-card label="Fulfillment Rate" [value]="(fulfillmentRate() | number:'1.1-1') + '%'" icon="check_circle" gradient="green" [delta]="fulfillmentDelta()"></app-kpi-card>
  </div>

  <!-- Row 2: Daily Trend (2/3) + Handling Distribution (1/3) -->
  <div class="row row-charts-2-1">
    <app-bar-chart title="Daily PRM Trend" [data]="dailyTrend()" [loading]="loading()" xLabel="Day of Month" yLabel="PRM Count" class="col-2"></app-bar-chart>
    <app-donut-chart title="Handling Distribution" [data]="handling()" [loading]="loading()" class="col-1"></app-donut-chart>
  </div>

  <!-- Row 3: Service Types (1/3) + Duration Distribution (1/3) + Locations (1/3) -->
  <div class="row row-charts-1-1-1">
    <app-donut-chart title="Service Types" [data]="serviceTypes()" [loading]="loading()"></app-donut-chart>
    <app-bar-chart title="Duration Distribution" [data]="durationBuckets()" [loading]="loading()" xLabel="Duration Range (min)" yLabel="Count"></app-bar-chart>
    <app-horizontal-bar-chart title="PRM by Location" [data]="locations()" [loading]="loading()" yLabel="Location"></app-horizontal-bar-chart>
  </div>
</div>
```

- [ ] **Step 3: Write overview SCSS**

`frontend/src/app/features/dashboard/tabs/overview/overview.component.scss`:
```scss
.overview-content {
  display: grid;
  grid-template-rows: auto 1fr 1fr;
  gap: 1rem;
  padding: 0 0.5rem;
}
.row { display: grid; gap: 1rem; }
.row-kpis { grid-template-columns: repeat(5, 1fr); }
.row-charts-2-1 { grid-template-columns: 2fr 1fr; min-height: 280px; }
.row-charts-1-1-1 { grid-template-columns: 1fr 1fr 1fr; min-height: 280px; }

@media (max-width: 1200px) {
  .row-kpis { grid-template-columns: repeat(2, 1fr); }
  .row-charts-2-1, .row-charts-1-1-1 { grid-template-columns: 1fr; }
}
```

- [ ] **Step 4: Verify**

Navigate to `/dashboard` → Overview tab. Expected:
- 5 KPI cards render with values, deltas, gradient backgrounds
- Daily Trend bar chart shows one bar per day in the selected range, with dashed avg line (handled by ECharts markLine)
- Handling donut shows Self vs Outsourced split
- Row 3 shows service types donut + duration histogram + location horizontal bars
- Changing airline filter triggers re-fetch and all charts update

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/dashboard/tabs/overview
git commit -m "feat(frontend): Tab 1 Overview — 5 KPIs + 4 interactive charts"
```

### Task 17: Tab 2 — Top 10

**Files:**
- Modify: `frontend/src/app/features/dashboard/tabs/top10/top10.component.ts`
- Create: `frontend/src/app/features/dashboard/tabs/top10/top10.component.html`
- Create: `frontend/src/app/features/dashboard/tabs/top10/top10.component.scss`

Row 1: Top Airlines bar + Top Flights bar. Row 2: Top Agents Material table (full width). Row 3: Top Routes horizontal bars + No-Show Rate bars.

- [ ] **Step 1: Write top10 component TS**

```ts
// frontend/src/app/features/dashboard/tabs/top10/top10.component.ts
import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { BarChartComponent, BarDatum } from '../../../../shared/charts/bar-chart/bar-chart.component';
import { HorizontalBarChartComponent } from '../../../../shared/charts/horizontal-bar-chart/horizontal-bar-chart.component';
import { PrmDataService } from '../../services/prm-data.service';
import { FilterStore } from '../../../../core/store/filter.store';

export interface AgentRow {
  rank: number;
  agentNo: string;
  name: string;
  count: number;
  avgDuration: number;
  topService: string;
  topAirline: string;
  daysActive: number;
}

const CARRIER_COLORS: Record<string, string> = {
  AI: '#ef5350', '6E': '#42a5f5', UK: '#ab47bc',   // Indian
  EK: '#ffa726', QR: '#26a69a', SQ: '#66bb6a',     // Gulf/APAC
  LH: '#5c6bc0', BA: '#78909c', CX: '#ff7043', TG: '#d4e157',
};

@Component({
  selector: 'app-top10',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatIconModule, BarChartComponent, HorizontalBarChartComponent],
  templateUrl: './top10.component.html',
  styleUrl: './top10.component.scss',
})
export class Top10Component implements OnInit {
  private data = inject(PrmDataService);
  filters = inject(FilterStore);

  loading = signal(true);
  topAirlines = signal<BarDatum[]>([]);
  topFlights = signal<BarDatum[]>([]);
  topAgents = signal<AgentRow[]>([]);
  topRoutes = signal<BarDatum[]>([]);
  noShows = signal<BarDatum[]>([]);

  displayedColumns = ['rank', 'agentNo', 'name', 'count', 'avgDuration', 'topService', 'topAirline', 'daysActive'];

  constructor() {
    effect(() => { this.filters.queryParams(); this.fetchAll(); });
  }

  ngOnInit() { this.fetchAll(); }

  fetchAll() {
    if (!this.filters.airport() || !this.filters.dateFrom()) return;
    this.loading.set(true);
    forkJoin({
      airlines: this.data.topAirlines(10),
      flights: this.data.topFlights(10),
      agents: this.data.topAgents(10),
      routes: this.data.byRoute(),
      noShows: this.data.noShows(),
    }).subscribe({
      next: (r: any) => {
        this.topAirlines.set((r.airlines.items ?? []).map((a: any) => ({
          label: a.airline, value: a.count, color: CARRIER_COLORS[a.airline] ?? '#78909c',
        })));
        this.topFlights.set((r.flights.items ?? []).map((f: any) => ({
          label: f.flight, value: f.count, color: CARRIER_COLORS[f.airline] ?? '#78909c',
        })));
        this.topAgents.set((r.agents.items ?? []).slice(0, 10).map((a: any, i: number) => ({
          rank: i + 1,
          agentNo: a.agent_no,
          name: a.agent_name,
          count: a.count,
          avgDuration: a.avg_duration_minutes,
          topService: a.top_service ?? '-',
          topAirline: a.top_airline ?? '-',
          daysActive: a.days_active ?? 0,
        })));
        this.topRoutes.set((r.routes.items ?? []).slice(0, 10).map((route: any) => ({
          label: `${route.departure}→${route.arrival}`, value: route.count,
        })));
        this.noShows.set((r.noShows.by_airline ?? []).map((ns: any) => ({
          label: ns.airline,
          value: ns.no_show_rate_pct,
          color: ns.no_show_rate_pct > 5 ? '#ef5350' : ns.no_show_rate_pct >= 3 ? '#fb8c00' : '#66bb6a',
        })));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  rankMedal(rank: number): string {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return String(rank);
  }

  durationColor(minutes: number): string {
    if (minutes < 20) return '#66bb6a';
    if (minutes < 40) return '#fb8c00';
    return '#ef5350';
  }
}
```

- [ ] **Step 2: Write top10 HTML**

```html
<!-- frontend/src/app/features/dashboard/tabs/top10/top10.component.html -->
<div class="top10-content">
  <div class="row row-charts-1-1">
    <app-bar-chart title="Top 10 Airlines" [data]="topAirlines()" [loading]="loading()"
                   xLabel="Airline" yLabel="PRM Count"></app-bar-chart>
    <app-bar-chart title="Top 10 Flights" [data]="topFlights()" [loading]="loading()"
                   xLabel="Flight" yLabel="PRM Count"></app-bar-chart>
  </div>

  <div class="row row-table">
    <div class="table-card">
      <div class="table-title">Top 10 Agents</div>
      <table mat-table [dataSource]="topAgents()" class="agents-table">
        <ng-container matColumnDef="rank">
          <th mat-header-cell *matHeaderCellDef>Rank</th>
          <td mat-cell *matCellDef="let row" class="rank-cell">{{ rankMedal(row.rank) }}</td>
        </ng-container>

        <ng-container matColumnDef="agentNo">
          <th mat-header-cell *matHeaderCellDef>Agent #</th>
          <td mat-cell *matCellDef="let row">{{ row.agentNo }}</td>
        </ng-container>

        <ng-container matColumnDef="name">
          <th mat-header-cell *matHeaderCellDef>Name</th>
          <td mat-cell *matCellDef="let row">{{ row.name }}</td>
        </ng-container>

        <ng-container matColumnDef="count">
          <th mat-header-cell *matHeaderCellDef>PRM Count</th>
          <td mat-cell *matCellDef="let row"><strong>{{ row.count | number }}</strong></td>
        </ng-container>

        <ng-container matColumnDef="avgDuration">
          <th mat-header-cell *matHeaderCellDef>Avg Duration</th>
          <td mat-cell *matCellDef="let row">
            <span class="duration-pill" [style.background]="durationColor(row.avgDuration)">
              {{ row.avgDuration | number:'1.0-0' }} min
            </span>
          </td>
        </ng-container>

        <ng-container matColumnDef="topService">
          <th mat-header-cell *matHeaderCellDef>Top Service</th>
          <td mat-cell *matCellDef="let row">{{ row.topService }}</td>
        </ng-container>

        <ng-container matColumnDef="topAirline">
          <th mat-header-cell *matHeaderCellDef>Top Airline</th>
          <td mat-cell *matCellDef="let row">{{ row.topAirline }}</td>
        </ng-container>

        <ng-container matColumnDef="daysActive">
          <th mat-header-cell *matHeaderCellDef>Days Active</th>
          <td mat-cell *matCellDef="let row">{{ row.daysActive }}</td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: displayedColumns" class="agent-row"></tr>
      </table>
    </div>
  </div>

  <div class="row row-charts-1-1">
    <app-horizontal-bar-chart title="Top 10 Routes" [data]="topRoutes()" [loading]="loading()"
                              xLabel="Count" yLabel="Route"></app-horizontal-bar-chart>
    <app-bar-chart title="No-Show Rate by Airline" [data]="noShows()" [loading]="loading()"
                   xLabel="Airline" yLabel="No-Show %"></app-bar-chart>
  </div>
</div>
```

- [ ] **Step 3: Write top10 SCSS**

```scss
/* frontend/src/app/features/dashboard/tabs/top10/top10.component.scss */
.top10-content {
  display: grid;
  grid-template-rows: 1fr auto 1fr;
  gap: 1rem;
  padding: 0 0.5rem;
}
.row { display: grid; gap: 1rem; }
.row-charts-1-1 { grid-template-columns: 1fr 1fr; min-height: 260px; }
.row-table { }
.table-card {
  background: #fff;
  border-radius: 12px;
  padding: 1rem 1.25rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  overflow-x: auto;
}
.table-title { font-weight: 600; font-size: 0.95rem; margin-bottom: 0.5rem; color: #333; }
.agents-table { width: 100%; }
.rank-cell { font-size: 1.2rem; font-weight: 700; }
.duration-pill {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  color: #fff;
  font-size: 0.8rem;
  font-weight: 600;
}
.agent-row:hover { background: rgba(30, 136, 229, 0.04); cursor: pointer; }

@media (max-width: 1024px) {
  .row-charts-1-1 { grid-template-columns: 1fr; }
}
```

- [ ] **Step 4: Verify**

Navigate to Top 10 tab. Expected:
- Row 1: two bar charts, bars colored by carrier region
- Row 2: Material table with gold/silver/bronze medals for top 3, colored duration pills
- Row 3: horizontal routes bar + no-show rate bars with threshold colors (red/amber/green)
- All charts re-fetch when filters change

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/dashboard/tabs/top10
git commit -m "feat(frontend): Tab 2 Top 10 — 4 charts + ranked agents table"
```

### Task 18: Tab 3 — Service Breakup

**Files:**
- Modify: `frontend/src/app/features/dashboard/tabs/service-breakup/service-breakup.component.ts`
- Create: `frontend/src/app/features/dashboard/tabs/service-breakup/service-breakup.component.html`
- Create: `frontend/src/app/features/dashboard/tabs/service-breakup/service-breakup.component.scss`

Row 1: 9 clickable service type summary cards (WCHR, WCHC, MAAS, WCHS, DPNA, UMNR, BLND, MEDA, WCMP). Row 2: Monthly matrix table (60%) + Stacked trend chart (40%). Row 3: Avg Duration by Type bars + PRM by Day of Week bars.

- [ ] **Step 1: Write service-breakup component TS**

```ts
// service-breakup.component.ts
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { BarChartComponent, BarDatum } from '../../../../shared/charts/bar-chart/bar-chart.component';
import { LineChartComponent, LineSeries } from '../../../../shared/charts/line-chart/line-chart.component';
import { PrmDataService } from '../../services/prm-data.service';
import { FilterStore } from '../../../../core/store/filter.store';

export const SERVICE_TYPES = ['WCHR','WCHC','MAAS','WCHS','DPNA','UMNR','BLND','MEDA','WCMP'] as const;
export type ServiceType = typeof SERVICE_TYPES[number];

export interface ServiceSummary { type: ServiceType; count: number; pct: number; }
export interface MatrixRow { month: string; counts: Record<ServiceType, number>; total: number; }

@Component({
  selector: 'app-service-breakup',
  standalone: true,
  imports: [CommonModule, BarChartComponent, LineChartComponent],
  templateUrl: './service-breakup.component.html',
  styleUrl: './service-breakup.component.scss',
})
export class ServiceBreakupComponent implements OnInit {
  private data = inject(PrmDataService);
  filters = inject(FilterStore);

  loading = signal(true);
  serviceTypes = SERVICE_TYPES;

  summaries = signal<ServiceSummary[]>([]);
  matrix = signal<MatrixRow[]>([]);
  trendSeries = signal<LineSeries[]>([]);
  durationBars = signal<BarDatum[]>([]);
  dowBars = signal<BarDatum[]>([]);

  maxPerColumn = computed<Record<ServiceType, number>>(() => {
    const m: Record<string, number> = {};
    for (const t of SERVICE_TYPES) {
      m[t] = Math.max(0, ...this.matrix().map(r => r.counts[t] ?? 0));
    }
    return m as Record<ServiceType, number>;
  });

  constructor() {
    effect(() => { this.filters.queryParams(); this.fetchAll(); });
  }

  ngOnInit() { this.fetchAll(); }

  fetchAll() {
    if (!this.filters.airport() || !this.filters.dateFrom()) return;
    this.loading.set(true);
    forkJoin({
      byService: this.data.byServiceType(),   // monthly matrix
      topServices: this.data.topServices(),
      durStats: this.data.durationStats(),    // per-service avg
      hourly: this.data.trendsHourly(),       // hour × dow
    }).subscribe({
      next: (r: any) => {
        // Matrix
        const monthRows: MatrixRow[] = (r.byService.months ?? []).map((m: any) => {
          const counts: any = {};
          let total = 0;
          for (const t of SERVICE_TYPES) {
            counts[t] = m[t] ?? 0;
            total += counts[t];
          }
          return { month: m.month, counts, total };
        });
        this.matrix.set(monthRows);

        // Summary cards from topServices (all 9 types with 0 defaults)
        const totals: Record<string, number> = {};
        for (const t of SERVICE_TYPES) totals[t] = 0;
        for (const item of r.topServices.items ?? []) totals[item.service] = item.count;
        const grand = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
        this.summaries.set(SERVICE_TYPES.map(t => ({
          type: t, count: totals[t], pct: (totals[t] / grand) * 100,
        })));

        // Stacked trend series (one per service type)
        const xs = monthRows.map(m => m.month);
        this.trendSeries.set(SERVICE_TYPES.slice(0, 5).map(t => ({
          name: t,
          data: monthRows.map(m => [m.month, m.counts[t]] as [string, number]),
        })));

        // Duration by service
        const byDur: any[] = r.durStats.by_service ?? [];
        this.durationBars.set(byDur.map(d => ({ label: d.service, value: d.avg_minutes })));

        // Day of week (from hourly heatmap data collapsed by dow)
        const dowMap: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
        for (const cell of r.hourly.cells ?? []) {
          dowMap[cell.day_of_week] = (dowMap[cell.day_of_week] ?? 0) + cell.value;
        }
        const days = Object.keys(dowMap);
        // Average per day of week across the period
        this.dowBars.set(days.map(d => ({
          label: d,
          value: dowMap[d],
          color: d === 'Sat' || d === 'Sun' ? '#fb8c00' : '#1e88e5',
        })));

        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  clickServiceCard(t: ServiceType) {
    const current = this.filters.service();
    this.filters.setFilter('service', current === t ? null : t);
  }

  isMaxInColumn(t: ServiceType, value: number): boolean {
    return value > 0 && value === this.maxPerColumn()[t];
  }
}
```

- [ ] **Step 2: Write service-breakup HTML**

```html
<!-- service-breakup.component.html -->
<div class="service-content">
  <!-- Row 1: 9 service summary cards -->
  <div class="row row-service-cards">
    <div *ngFor="let s of summaries()"
         class="service-card"
         [class.active]="filters.service() === s.type"
         (click)="clickServiceCard(s.type)">
      <div class="service-type">{{ s.type }}</div>
      <div class="service-count">{{ s.count | number }}</div>
      <div class="service-pct">{{ s.pct | number:'1.1-1' }}%</div>
    </div>
  </div>

  <!-- Row 2: Matrix (60%) + Stacked trend (40%) -->
  <div class="row row-matrix-trend">
    <div class="matrix-card">
      <div class="chart-title">Monthly Service Matrix</div>
      <div class="matrix-scroll">
        <table class="matrix-table">
          <thead>
            <tr>
              <th>Month</th>
              <th *ngFor="let t of serviceTypes">{{ t }}</th>
              <th class="total-col">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let row of matrix()">
              <td class="month-cell">{{ row.month }}</td>
              <td *ngFor="let t of serviceTypes"
                  [class.max-cell]="isMaxInColumn(t, row.counts[t])">
                {{ row.counts[t] | number }}
              </td>
              <td class="total-col"><strong>{{ row.total | number }}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <app-line-chart title="Service Trend (Top 5)" [series]="trendSeries()" [loading]="loading()"
                    [showAvgLine]="false" [stacked]="true"></app-line-chart>
  </div>

  <!-- Row 3: Avg Duration by Service + Day of Week -->
  <div class="row row-charts-1-1">
    <app-bar-chart title="Avg Duration by Service Type" [data]="durationBars()" [loading]="loading()"
                   xLabel="Service" yLabel="Avg Minutes"></app-bar-chart>
    <app-bar-chart title="PRM by Day of Week" [data]="dowBars()" [loading]="loading()"
                   xLabel="Day" yLabel="Count"></app-bar-chart>
  </div>
</div>
```

- [ ] **Step 3: Write service-breakup SCSS**

```scss
/* service-breakup.component.scss */
.service-content {
  display: grid;
  grid-template-rows: auto 1fr 1fr;
  gap: 1rem;
  padding: 0 0.5rem;
}
.row { display: grid; gap: 1rem; }
.row-service-cards {
  grid-template-columns: repeat(9, 1fr);
}
.service-card {
  padding: 0.75rem 1rem;
  background: #fff;
  border-radius: 10px;
  text-align: center;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0,0,0,0.05);
  transition: all 200ms ease;
  border: 2px solid transparent;
  &:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
  &.active { border-color: #1e88e5; background: #e3f2fd; }
  .service-type  { font-weight: 700; font-size: 0.85rem; color: #666; }
  .service-count { font-size: 1.4rem; font-weight: 700; color: #1e88e5; }
  .service-pct   { font-size: 0.75rem; color: #999; }
}
.row-matrix-trend {
  grid-template-columns: 3fr 2fr;
  min-height: 280px;
}
.matrix-card {
  background: #fff;
  border-radius: 12px;
  padding: 1rem 1.25rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.chart-title { font-weight: 600; font-size: 0.95rem; margin-bottom: 0.5rem; color: #333; }
.matrix-scroll { overflow: auto; flex: 1; }
.matrix-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  th, td { padding: 0.4rem 0.75rem; text-align: right; border-bottom: 1px solid #eee; }
  th { background: #fafafa; font-weight: 600; color: #555; position: sticky; top: 0; }
  .month-cell { text-align: left; font-weight: 600; }
  .total-col  { background: #f5f7fa; font-weight: 600; }
  .max-cell   { background: #fff59d; font-weight: 700; }
}
.row-charts-1-1 { grid-template-columns: 1fr 1fr; min-height: 260px; }

@media (max-width: 1200px) {
  .row-service-cards { grid-template-columns: repeat(3, 1fr); }
  .row-matrix-trend, .row-charts-1-1 { grid-template-columns: 1fr; }
}
```

- [ ] **Step 4: Verify**

Navigate to Service Breakup tab. Expected:
- 9 service cards show count + %, clicking one adds that service as a filter (highlighted in blue)
- Matrix table: months as rows, service types as columns, max cell per column highlighted yellow, Total column in light gray
- Stacked line chart shows top 5 service types over months
- Row 3: duration bars + day-of-week bars (weekend bars in amber)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/dashboard/tabs/service-breakup
git commit -m "feat(frontend): Tab 3 Service Breakup — 9 cards + matrix + trend + duration + DoW"
```

### Task 19: Tab 4 — Fulfillment

**Files:**
- Modify: `frontend/src/app/features/dashboard/tabs/fulfillment/fulfillment.component.ts`
- Create: `frontend/src/app/features/dashboard/tabs/fulfillment/fulfillment.component.html`
- Create: `frontend/src/app/features/dashboard/tabs/fulfillment/fulfillment.component.scss`

Row 1: 4 KPIs (PRM Requested, Provided vs Requested, Total Provided, Walk-up Rate). Row 2: Daily dual-axis trend + Sankey flow (Agent Type → Service Type → Top Flights). Row 3: PRM by Time of Day (4-hour bins) + Cumulative pace chart.

- [ ] **Step 1: Write fulfillment component TS**

```ts
// fulfillment.component.ts
import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { KpiCardComponent } from '../../components/kpi-card/kpi-card.component';
import { LineChartComponent, LineSeries } from '../../../../shared/charts/line-chart/line-chart.component';
import { BarChartComponent, BarDatum } from '../../../../shared/charts/bar-chart/bar-chart.component';
import { SankeyChartComponent, SankeyNode, SankeyLink } from '../../../../shared/charts/sankey-chart/sankey-chart.component';
import { PrmDataService } from '../../services/prm-data.service';
import { FilterStore } from '../../../../core/store/filter.store';

function timeBin(hour: number): string {
  const start = Math.floor(hour / 4) * 4;
  const end = start + 4;
  return `${String(start).padStart(2,'0')}-${String(end).padStart(2,'0')}`;
}

const BIN_COLORS: Record<string, string> = {
  '00-04': '#90a4ae', '04-08': '#90a4ae', // Low
  '08-12': '#ef5350',                     // Peak (red)
  '12-16': '#fb8c00',                     // High (amber)
  '16-20': '#fb8c00',                     // High
  '20-24': '#66bb6a',                     // Medium (green)
};

@Component({
  selector: 'app-fulfillment',
  standalone: true,
  imports: [CommonModule, KpiCardComponent, LineChartComponent, BarChartComponent, SankeyChartComponent],
  templateUrl: './fulfillment.component.html',
  styleUrl: './fulfillment.component.scss',
})
export class FulfillmentComponent implements OnInit {
  private data = inject(PrmDataService);
  filters = inject(FilterStore);

  loading = signal(true);

  totalRequested = signal<number>(0);
  totalProvided = signal<number>(0);
  providedPct = signal<number>(0);
  walkupRate = signal<number>(0);
  walkupDelta = signal<number | null>(null);

  dualAxisSeries = signal<LineSeries[]>([]);
  sankeyNodes = signal<SankeyNode[]>([]);
  sankeyLinks = signal<SankeyLink[]>([]);
  timeOfDay = signal<BarDatum[]>([]);
  cumulativeSeries = signal<LineSeries[]>([]);

  constructor() {
    effect(() => { this.filters.queryParams(); this.fetchAll(); });
  }

  ngOnInit() { this.fetchAll(); }

  fetchAll() {
    if (!this.filters.airport() || !this.filters.dateFrom()) return;
    this.loading.set(true);
    forkJoin({
      rvp: this.data.requestedVsProvided(),
      trend: this.data.trendsRequestedProvided(),
      agentType: this.data.byAgentType(),       // sankey data
      hourly: this.data.trendsHourly(),         // will reduce to 4-hr bins
      daily: this.data.trendsDaily('count'),    // for cumulative
    }).subscribe({
      next: (r: any) => {
        // KPIs
        this.totalRequested.set(r.rvp.total_requested ?? 0);
        this.totalProvided.set(r.rvp.total_provided ?? 0);
        const pct = r.rvp.total_requested
          ? (r.rvp.total_provided / r.rvp.total_requested) * 100
          : 0;
        this.providedPct.set(pct);
        const walkup = r.rvp.total_provided && r.rvp.total_requested
          ? ((r.rvp.total_provided - r.rvp.total_requested) / r.rvp.total_provided) * 100
          : 0;
        this.walkupRate.set(Math.max(0, walkup));
        this.walkupDelta.set(r.rvp.walkup_delta_pct ?? null);

        // Dual-axis: Provided (bars) + Requested (line)
        const points: any[] = r.trend.points ?? [];
        this.dualAxisSeries.set([
          { name: 'Provided',  type: 'bar',  data: points.map(p => [p.date.slice(-2), p.provided] as [string, number]), color: '#1e88e5' },
          { name: 'Requested', type: 'line', data: points.map(p => [p.date.slice(-2), p.requested] as [string, number]), color: '#fb8c00' },
        ]);

        // Sankey: Agent Type → Service Type → Flight
        const at = r.agentType;
        const nodeSet = new Set<string>();
        const links: SankeyLink[] = [];
        for (const link of at.links ?? []) {
          nodeSet.add(link.source); nodeSet.add(link.target);
          links.push({ source: link.source, target: link.target, value: link.value });
        }
        this.sankeyNodes.set(Array.from(nodeSet).map(name => ({ name })));
        this.sankeyLinks.set(links);

        // Time of Day (4-hour bins)
        const bins: Record<string, number> = { '00-04':0, '04-08':0, '08-12':0, '12-16':0, '16-20':0, '20-24':0 };
        for (const cell of r.hourly.cells ?? []) {
          const bin = timeBin(cell.hour);
          bins[bin] = (bins[bin] ?? 0) + cell.value;
        }
        this.timeOfDay.set(Object.keys(bins).map(b => ({
          label: b, value: bins[b], color: BIN_COLORS[b],
        })));

        // Cumulative pace: running total + target line
        const dailyPts: any[] = r.daily.points ?? [];
        let cum = 0;
        const cumData: Array<[string, number]> = dailyPts.map(p => { cum += p.count; return [p.date.slice(-2), cum]; });
        const totalDays = dailyPts.length || 1;
        const finalTotal = cum;
        const targetData: Array<[string, number]> = dailyPts.map((p, i) => [p.date.slice(-2), (finalTotal / totalDays) * (i + 1)]);
        this.cumulativeSeries.set([
          { name: 'Actual',  type: 'area', data: cumData,    color: '#1e88e5' },
          { name: 'Target',  type: 'line', data: targetData, color: '#888' },
        ]);

        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
```

- [ ] **Step 2: Write fulfillment HTML**

```html
<!-- fulfillment.component.html -->
<div class="fulfillment-content">
  <!-- Row 1: 4 KPI cards -->
  <div class="row row-kpis">
    <app-kpi-card label="PRM Requested" [value]="totalRequested() | number" icon="how_to_reg" gradient="blue"></app-kpi-card>
    <app-kpi-card label="Provided vs Requested" [value]="(providedPct() | number:'1.1-1') + '%'" icon="verified" gradient="green"></app-kpi-card>
    <app-kpi-card label="Total Provided" [value]="totalProvided() | number" icon="accessible" gradient="teal"></app-kpi-card>
    <app-kpi-card label="Walk-up Rate" [value]="(walkupRate() | number:'1.1-1') + '%'" icon="directions_walk" gradient="orange" [delta]="walkupDelta()"></app-kpi-card>
  </div>

  <!-- Row 2: Dual-axis (1/2) + Sankey (1/2) -->
  <div class="row row-charts-1-1">
    <app-line-chart title="Daily Provided vs Requested" [series]="dualAxisSeries()" [loading]="loading()"
                    [dualAxis]="true" [showAvgLine]="false"></app-line-chart>
    <app-sankey-chart title="Agent Type → Service → Flight" [nodes]="sankeyNodes()" [links]="sankeyLinks()" [loading]="loading()"></app-sankey-chart>
  </div>

  <!-- Row 3: Time of Day (1/2) + Cumulative pace (1/2) -->
  <div class="row row-charts-1-1">
    <app-bar-chart title="PRM by Time of Day" [data]="timeOfDay()" [loading]="loading()"
                   xLabel="Time Slot" yLabel="PRM Count"></app-bar-chart>
    <app-line-chart title="Cumulative PRM Pace" [series]="cumulativeSeries()" [loading]="loading()"
                    [showAvgLine]="false"></app-line-chart>
  </div>
</div>
```

- [ ] **Step 3: Write fulfillment SCSS**

```scss
/* fulfillment.component.scss */
.fulfillment-content {
  display: grid;
  grid-template-rows: auto 1fr 1fr;
  gap: 1rem;
  padding: 0 0.5rem;
}
.row { display: grid; gap: 1rem; }
.row-kpis { grid-template-columns: repeat(4, 1fr); }
.row-charts-1-1 { grid-template-columns: 1fr 1fr; min-height: 280px; }

@media (max-width: 1024px) {
  .row-kpis { grid-template-columns: repeat(2, 1fr); }
  .row-charts-1-1 { grid-template-columns: 1fr; }
}
```

- [ ] **Step 4: Verify**

Navigate to Fulfillment tab. Expected:
- 4 KPI cards render correctly
- Dual-axis chart: blue bars for Provided + orange line for Requested, separate left/right Y axes
- Sankey diagram: 3-level flow with hover focus on adjacency
- Time of day: 6 bars, peak 08-12 in red, high 12-20 in amber, others low/medium
- Cumulative chart: blue area (actual) vs gray dashed target line

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/dashboard/tabs/fulfillment
git commit -m "feat(frontend): Tab 4 Fulfillment — 4 KPIs + dual-axis + Sankey + time bins + cumulative"
```

---

## Phase 9: Integration & Polish

### Task 20: End-to-End Testing & Polish

**Files:**
- Create: `docs/e2e-checklist.md`
- Modify: `frontend/src/app/shared/charts/base-chart.component.ts` (already has loading/empty states — verify styling)
- Modify: any charts that don't yet honor `loading` input

- [ ] **Step 1: Bring the full stack up**

```bash
docker compose up --build -d
docker compose logs -f --tail=50
```

Wait until all 5 containers report "Application started". Verify health:

```bash
curl http://localhost:5000/health
curl http://localhost:5001/health
curl http://localhost:5002/health
curl http://localhost:5003/health
```

Expected: all return 200 OK.

- [ ] **Step 2: Verify DB seeding**

```bash
docker exec -i prm-mysql mysql -uroot -prootpass123 -e "
  SELECT slug, name FROM prm_master.tenants;
  SELECT tenant_id, username FROM prm_master.employees;
  SELECT COUNT(*) FROM prm_aeroground.prm_services;
  SELECT COUNT(*) FROM prm_skyserve.prm_services;
  SELECT COUNT(*) FROM prm_globalprm.prm_services;
"
```

Expected: 3 tenants, 12 employees, each tenant DB has ~2,400-7,200 prm_services rows.

- [ ] **Step 3: Create E2E checklist document**

`docs/e2e-checklist.md`:
```markdown
# PRM Dashboard E2E Checklist

Each scenario must pass before marking the POC complete.

## Multi-Tenant Isolation
- [ ] Visit http://aeroground.localhost:4200 → login page shows "AeroGround Services"
- [ ] Visit http://skyserve.localhost:4200 → login page shows "SkyServe Ground Handling"
- [ ] Visit http://globalprm.localhost:4200 → login page shows "GlobalPRM"
- [ ] Login to aeroground as admin/admin123 → airports dropdown shows BLR, HYD, DEL only
- [ ] Logout, login to skyserve as admin/admin123 → airports dropdown shows BLR, BOM, MAA only
- [ ] Verify PRM data differs between tenants (different row counts, different passengers)

## RBAC
- [ ] Login as aeroground/john → dropdown shows BLR, HYD only (no DEL)
- [ ] Login as aeroground/jane → dropdown shows DEL only (disabled dropdown)
- [ ] In DevTools, force-modify airport query param to 'BLR' → expect 403 from PRM Service
- [ ] Login as aeroground/bob → shows HYD only, cannot see other airports

## Auth Flow
- [ ] Invalid credentials show "Login failed" error
- [ ] After login, refresh browser → still logged in (httpOnly refresh cookie re-hydrates)
- [ ] Wait 16 minutes (access token expires) → click a filter → interceptor auto-refreshes, no re-login prompt
- [ ] Logout → redirected to /login, tokens cleared

## Dashboard Navigation
- [ ] Home page shows PRM Dashboard gradient card
- [ ] Click card → navigates to /dashboard
- [ ] Click "Back" in top bar → returns to /home
- [ ] Dashboard defaults to "Month to Date" preset (March 1-31, 2026)
- [ ] Airport dropdown switches trigger full dashboard re-fetch

## Tab 1 — Overview
- [ ] 5 KPI cards render with values, deltas, icons
- [ ] Daily Trend bar chart shows 31 bars for MTD
- [ ] Handling distribution donut shows Self/Outsourced percentages
- [ ] Service Type donut shows top 5 types
- [ ] Duration histogram shows buckets with threshold colors
- [ ] Location horizontal bars show airport zones

## Tab 2 — Top 10
- [ ] Top Airlines bars colored by carrier region
- [ ] Top Flights bars colored by airline
- [ ] Agents table: rank 1-3 show gold/silver/bronze, duration pills color-coded
- [ ] Top Routes horizontal bars render
- [ ] No-Show Rate bars show threshold colors (red > 5%, amber 3-5%, green < 3%)

## Tab 3 — Service Breakup
- [ ] 9 service cards show count + %
- [ ] Clicking a card filters dashboard by that service (card highlights blue)
- [ ] Matrix table: months × 9 services + Total column, max cell per column highlighted
- [ ] Stacked trend chart renders
- [ ] Duration bars + Day of Week bars (weekend in amber)

## Tab 4 — Fulfillment
- [ ] 4 KPI cards
- [ ] Dual-axis chart: bars (Provided) + line (Requested), distinct Y axes
- [ ] Sankey chart: 3-level flow, hover highlights adjacency
- [ ] Time of Day bars: 6 bins, colors by intensity
- [ ] Cumulative chart: actual area vs target dashed line

## Filters
- [ ] Airline dropdown filters all tabs
- [ ] Service dropdown filters all tabs
- [ ] Handled By dropdown filters all tabs
- [ ] All 16 date presets produce correct date ranges
- [ ] Custom date range selectable via Custom preset
- [ ] Clear All resets secondary filters

## Edge Cases
- [ ] Select a date range with no data → charts show "No data matches current filters" empty state
- [ ] With slow network, loading skeletons appear on charts
- [ ] Clicking a bar in any chart cross-filters other charts (drill-down)

## Cross-browser
- [ ] Chrome/Edge
- [ ] Firefox
- [ ] Safari (if available)
```

- [ ] **Step 4: Walk the checklist manually**

Run through every item. Any failures → file as bugs or fix in-session before proceeding.

- [ ] **Step 5: Polish loading and empty states**

Verify each chart wrapper correctly honors the `loading` input during fetch. Add loading state fallback to tab components:
- While `loading()` is true, the chart wrappers already show a shimmer skeleton via `BaseChartComponent`
- When data arrays are empty but loading is false, `isEmpty` triggers the "No data matches current filters" state
- KPI cards: add a subtle shimmer during loading (optional — can apply `.skeleton` class conditionally)

- [ ] **Step 6: Commit**

```bash
git add docs/e2e-checklist.md
git commit -m "docs: e2e checklist and polish loading/empty states"
```

---

### Task 21: Update .claude Configuration

**Files:**
- Modify: `CLAUDE.md` (project root)
- Modify: `.claude/rules/architecture.md`
- Modify: `.claude/rules/memory-decisions.md`
- Modify: `.claude/rules/memory-sessions.md`
- Create: `.claude/rules/dotnet-backend.md` (replaces python-backend.md as canonical)
- Create: `.claude/rules/angular-frontend.md` (replaces react-frontend.md as canonical)
- Delete: `.claude/rules/python-backend.md`, `.claude/rules/react-frontend.md`

The project instructions inherited from `dev-ai/angular_powerbi/.claude/rules/` are for an RMS (Rota) project built in Python/React. This PRM project uses .NET/Angular — the rules need to reflect reality.

- [ ] **Step 1: Update `CLAUDE.md`**

Rewrite the Tech Stack and Key Directories sections to match what was built:
- Backend: .NET 8, ASP.NET Core, EF Core (Pomelo MySQL), Ocelot, BCrypt.Net, JWT
- Frontend: Angular 17, Angular Material 3, ngx-echarts, NgRx Signal Store
- Database: MySQL 8 (per-tenant)
- Infra: Docker Compose
- Key directories: `backend/src/`, `frontend/src/app/`, `database/init/`, `docs/`

Add an "Architecture Decisions" entry with today's date (2026-04-08):
- Multi-tenant: master DB + per-tenant DB pattern
- JWT in-memory + httpOnly refresh cookie
- Airport-level RBAC enforced at PRM Service middleware
- Dedup via `COUNT(DISTINCT id)` for paused/resumed services
- ECharts for all charts, NgRx Signal Store for filter state

- [ ] **Step 2: Rewrite `.claude/rules/architecture.md`**

Replace RMS content with the PRM architecture diagram and principles from the spec (Section 2 and 2.3).

- [ ] **Step 3: Create `.claude/rules/dotnet-backend.md`**

Conventions:
- One project per microservice, Dockerfile per service
- Controllers thin, delegate to Services
- DTOs in PrmDashboard.Shared
- EF Core 2.0 style queries, no legacy `.Query()`
- BCrypt for passwords, JWT via System.IdentityModel.Tokens.Jwt
- AES-256 for tenant DB credential encryption
- All endpoints return `ProblemDetails` for errors
- Logging via built-in ILogger with structured fields

- [ ] **Step 4: Create `.claude/rules/angular-frontend.md`**

Conventions:
- Standalone components only, no NgModules
- NgRx Signal Store for state, Signals for local component state
- All API calls through `ApiClient`, never direct `HttpClient`
- Filters synced to URL query params
- Charts via `BaseChartComponent` wrapper, never raw `echarts` in feature components
- Max 300 lines per file
- Lazy-load feature modules via route `loadComponent`

- [ ] **Step 5: Delete stale rule files**

```bash
git rm .claude/rules/python-backend.md .claude/rules/react-frontend.md
```

- [ ] **Step 6: Append session to `memory-sessions.md`**

```
- 2026-04-08: Implemented PRM Dashboard POC — 4 .NET microservices (Gateway, Auth, Tenant, PRM), Angular 17 SPA with 4-tab dashboard (Overview, Top 10, Service Breakup, Fulfillment), MySQL master + 3 tenant DBs, multi-tenant via subdomain, airport-level RBAC, ECharts visualizations. 21 tasks across 9 phases.
```

- [ ] **Step 7: Append decisions to `memory-decisions.md`**

```
## PRM Dashboard POC (2026-04-08)
- Multi-tenant with subdomain → tenant slug → per-tenant database
- Master DB holds tenants, employees, employee_airports, refresh_tokens
- JWT in-memory + httpOnly refresh cookie (15 min / 7 day)
- Airport RBAC enforced on PRM Service via middleware — validates ?airport= against JWT claim
- Dedup: COUNT(DISTINCT id) because pause/resume creates multiple rows per service
- Duration calc: sum of active segments per id (handles pause/resume)
- ECharts via ngx-echarts, NgRx Signal Store for filter state, URL-synced
- Ocelot gateway extracts subdomain to X-Tenant-Slug header
- AES-256 at rest for tenant DB credentials in master DB
```

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md .claude/rules/
git commit -m "chore: sync .claude config to PRM dashboard (.NET + Angular) stack"
```

---

## Execution Handoff

Plan complete. All 21 tasks now have bite-sized TDD steps with complete code.

**Two execution options:**

1. **Subagent-Driven (recommended)** — Fresh subagent per task, review between tasks, fast iteration. Uses the `superpowers:subagent-driven-development` skill.

2. **Inline Execution** — Execute tasks in the current session using `superpowers:executing-plans` with checkpoints for review.

**Which approach?**
