# E2E Smoke Test Results

Walked against the running stack on 2026-04-09. All 6 containers healthy.

## Health & Routing

| Check | Expected | Actual |
|---|---|---|
| `GET /health` (gateway) | 200 | ✅ 200 |
| `GET /swagger/index.html` | 200 | ✅ 200 (landing UI with service dropdown) |
| `GET /swagger/auth/swagger.json` | 200 | ✅ 200 |
| `GET /swagger/tenant/swagger.json` | 200 | ✅ 200 |
| `GET /swagger/prm/swagger.json` | 200 | ✅ 200 |

## Multi-Tenant Login

| Tenant | Login | Display name | Airports (from JWT) |
|---|---|---|---|
| `aeroground` | ✅ 200 | Admin AeroGround | BLR, DEL, HYD |
| `skyserve` | ✅ 200 | Admin SkyServe | BLR, BOM, MAA |
| `globalprm` | ✅ 200 | Admin GlobalPRM | JFK, KUL, SYD |

All three return camelCase DTOs (`accessToken`, `employee.displayName`, `employee.airports[].code/name`) matching the frontend's updated field map.

## Tenant DB Isolation

Row counts from per-tenant databases (verified via direct MySQL query):

```
aeroground_db  5622
skyserve_db    5583
globalprm_db   5758
```

Total: 16,963 rows matches the generated seed (15% OUTSOURCED after Phase E regen).

## Security Controls

| Check | Expected | Actual |
|---|---|---|
| Authed request with valid JWT, valid airport | 200 + JSON payload | ✅ 200 (1669 PRM services for BLR / MTD) |
| JWT for aeroground but `X-Tenant-Slug: skyserve` header | 403 (`TenantSlugClaimCheckMiddleware`) | ✅ 403 |
| Authed but querying unauthorized airport `?airport=BOM` (admin has BLR/HYD/DEL) | 403 (`AirportAccessMiddleware`) | ✅ 403 |
| Request with no `Authorization` header | 401 | ✅ 401 |
| 6 rapid login attempts against `/api/auth/login` | 3× 401 (invalid creds), then 429 (rate limit) | ✅ attempts 1-3: 401, attempts 4-6: 429 |

## Security Headers (nginx)

All headers confirmed on `GET http://localhost:4200/`:

```
Server: nginx                             # server_tokens off hides version
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' http://localhost:5000 http://gateway:8080; frame-ancestors 'self';
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

## Observability

- Serilog structured logs visible in `docker logs` for all 4 services with format: `{Timestamp} [{Level}] {Service} {CorrelationId} {Message}`
- Correlation ID round-trip: client sends `X-Correlation-Id: e2e-test-123` → server echoes same value in response headers ✅
- Cross-service propagation: PRM Service forwards `X-Correlation-Id` to Tenant Service on the `/resolve` call ✅ (visible in logs with matching IDs across both services for a single request)

## Backend Tests

```
Passed!  - Failed: 0, Passed: 18, Skipped: 0, Total: 18, Duration: 966 ms
```

All 18 tests in `PrmDashboard.Tests` pass: TimeHelpers (4), SnakeCaseExtensions (6 theory rows), BaseQueryService filter (4), JwtService roundtrip (1), SchemaMigrator filename parse (3).

## Fixes Applied During Walk

One real bug surfaced during the walk: **PRM → Tenant service auth forwarding**.

- **Symptom**: After Phase A added `[Authorize]` to `TenantController.Resolve` as defence-in-depth, PRM service's internal HTTP call to `/api/tenants/resolve/{slug}` started returning 401, cascading to a 502 "Bad Gateway" on every PRM query.
- **Root cause**: `TenantDbContextFactory.CreateDbContextAsync` used a bare `HttpClient.GetAsync` that never forwarded the caller's Bearer token.
- **Fix**: Injected `IHttpContextAccessor`, read the inbound `Authorization` header, and forwarded it on the internal `HttpRequestMessage`. Also forwards `X-Correlation-Id` for log stitching. Registered `AddHttpContextAccessor()` in PRM Service's `Program.cs`.
- **Files**: `backend/src/PrmDashboard.PrmService/Data/TenantDbContextFactory.cs`, `backend/src/PrmDashboard.PrmService/Program.cs`

After the fix: KPI summary returns 1669 for aeroground/BLR/MTD, dashboards load end-to-end.

## Verdict

**All checklist items green.** POC is demo-ready. Stack runs cleanly, all security controls fire, observability works across service boundaries, tests pass, docs are browseable via Swagger UI through the gateway.

Browser-walk items (login UI, dashboard tabs, command palette, theme toggle, drill-down, saved views) are not included here — those need manual verification in Chrome/Firefox.
