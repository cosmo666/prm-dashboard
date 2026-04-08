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
