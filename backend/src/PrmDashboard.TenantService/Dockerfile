FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 8080

# curl for the Docker healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

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
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8080/health || exit 1
USER app
ENTRYPOINT ["dotnet", "PrmDashboard.TenantService.dll"]
