FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 8080

# curl for docker healthcheck (aspnet:8.0 base lacks both curl and wget)
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy csproj files first for layer caching. Gateway now references Shared
# (for Serilog bootstrap + CorrelationIdMiddleware), so Shared must be present.
COPY src/PrmDashboard.Shared/PrmDashboard.Shared.csproj src/PrmDashboard.Shared/
COPY src/PrmDashboard.Gateway/PrmDashboard.Gateway.csproj src/PrmDashboard.Gateway/
RUN dotnet restore src/PrmDashboard.Gateway/PrmDashboard.Gateway.csproj

# Copy source
COPY src/PrmDashboard.Shared/ src/PrmDashboard.Shared/
COPY src/PrmDashboard.Gateway/ src/PrmDashboard.Gateway/
RUN dotnet publish src/PrmDashboard.Gateway/PrmDashboard.Gateway.csproj -c Release -o /app/publish

FROM base AS final
COPY --from=build /app/publish .
# HEALTHCHECK so standalone `docker run` / Kubernetes / ECS can surface
# liveness without relying on docker-compose's healthcheck stanza.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8080/health || exit 1
USER app
ENTRYPOINT ["dotnet", "PrmDashboard.Gateway.dll"]
