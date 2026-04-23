FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 8080

# curl for the Docker healthcheck (aspnet:8.0 base lacks curl and wget).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

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
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8080/health || exit 1
# The aspnet:8.0 base image ships with a non-root `app` user (uid 1654).
# Drop privileges before running the service — prevents a container escape
# from giving root on the host.
USER app
ENTRYPOINT ["dotnet", "PrmDashboard.AuthService.dll"]
