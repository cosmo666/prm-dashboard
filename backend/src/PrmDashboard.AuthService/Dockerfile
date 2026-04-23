FROM mcr.microsoft.com/dotnet/aspnet:8.0@sha256:f88c77644f4c480a62d3b46dc74db8d5472a24e282df8b1e56195c689d35a6db AS base
WORKDIR /app
EXPOSE 8080

# curl for the Docker healthcheck (aspnet:8.0 base lacks curl and wget).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

FROM mcr.microsoft.com/dotnet/sdk:8.0@sha256:4b1cdaa57eed2cecabcf29bdb9bce11e8ca1c287d39dfd2c8b534663ea94d493 AS build
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
