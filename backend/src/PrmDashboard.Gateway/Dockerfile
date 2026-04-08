FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 8080

# curl for docker healthcheck (aspnet:8.0 base lacks both curl and wget)
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY src/PrmDashboard.Gateway/PrmDashboard.Gateway.csproj src/PrmDashboard.Gateway/
RUN dotnet restore src/PrmDashboard.Gateway/PrmDashboard.Gateway.csproj
COPY src/PrmDashboard.Gateway/ src/PrmDashboard.Gateway/
RUN dotnet publish src/PrmDashboard.Gateway/PrmDashboard.Gateway.csproj -c Release -o /app/publish

FROM base AS final
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "PrmDashboard.Gateway.dll"]
