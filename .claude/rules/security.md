# Security — PRM Dashboard

The threat model: this is a multi-tenant POC with real auth, real data isolation, and a deliberately small attack surface. The hardening pass logged in CLAUDE.md (2026-04-22 → 2026-04-23) closed the gaps surfaced by code review. Don't reopen them.

## Secrets
- **Never** commit secrets. `.env` is in `.gitignore`. `.env.example` ships only the placeholder `change-in-production`, which `JwtStartupValidator` rejects at startup.
- `Jwt:Secret` must be ≥ 32 bytes (HS256 minimum). Generate with `openssl rand -base64 48`.
- All four backend services call `JwtStartupValidator.ReadAndValidate(builder.Configuration, "<svc>")` BEFORE wiring `AddJwtBearer`. Don't bypass with `config["Jwt:Secret"] ?? throw …` — `??` accepts empty strings.
- No secrets in `appsettings.json` / `appsettings.Development.json`. Always env-var override.

## Authentication
- Password hashing: `BCrypt.Net-Next` (work factor 11 default).
- Access token: 15 minutes, HS256-signed JWT, kept in memory by `AuthStore` (never `localStorage` — XSS-safe).
- Refresh token: 7 days, opaque, stored in `InMemoryRefreshTokenStore` (process-local — POC compromise; needs durable store before production). Delivered as **httpOnly + Secure + SameSite=Strict** cookie scoped to `/api/auth`.
- `ClockSkew = TimeSpan.Zero` on **every** `TokenValidationParameters` (Auth/Tenant/Prm/Gateway). The default 5-min skew silently extends the documented 15-min lifetime by 33%.
- JWT claims: `sub`, `tenant_id`, `tenant_slug`, `name`, `airports` (CSV).
- Atomic refresh-token rotation — the old token is invalidated on the same DB-equivalent operation that issues the new one.

## Multi-tenant isolation
- Tenant resolution = pure string function. Slug → `data/{slug}/prm_services.parquet`. **No** SQL `WHERE tenant_id = …` patterns; no shared tables.
- `TenantSlugClaimCheckMiddleware` requires both presence AND match of `X-Tenant-Slug` header against the JWT `tenant_slug` claim. 400 on missing, 403 on mismatch.
- `TenantParquetPaths.TenantPrmServices(slug)` validates against `^[a-z][a-z0-9-]{0,49}$` BEFORE `Path.Combine`. A malicious slug like `../master` or `..\..\etc\passwd` throws `ArgumentException` — defense-in-depth before filesystem operations.

## RBAC
- **Airport-level**: enforced at PrmService entry by `AirportAccessMiddleware`. Parses `?airport=…` (single code or comma-separated CSV like `DEL,BOM`) and validates **every** code against the JWT `airports` claim. 403 on any mismatch.
- Frontend: airport selector reads from `AuthStore.employee()!.airports`. Forbidden options are **hidden, not disabled** (disabled buttons are information leakage).
- Frontend airport selector never lets the user de-select the last airport — the dashboard always has data to query.

## Input validation
- All filter values flow through `BaseQueryService.BuildWhereClause` and become `DuckDBParameter` bindings. No string concatenation of caller input into SQL.
- The path literal in `FROM '{path}'` is server-owned (computed from the validated slug), but still goes through `EscapePath(...)` to neutralise single quotes.
- Date inputs parsed via `DateOnly` / `DateTime.TryParseExact`. Invalid input → 400 ProblemDetails, never silent fallback.

## Error responses
- All errors emit `application/problem+json` (RFC 7807).
- Use `Response.WriteAsync(JsonSerializer.Serialize(obj))` with explicit `Response.ContentType = "application/problem+json"`. **Never `WriteAsJsonAsync`** — it silently overwrites the content type back to `application/json`. Asserted by the middleware integration tests.
- No stack traces in user-facing responses. No request bodies echoed back unsanitised.

## CORS
- Allow-list-only. Empty allow-list at startup logs a warning (it would otherwise look like "no CORS" rather than "CORS denying everything").

## Container security
- All Dockerfile base images pinned to **sha256 digest** (`mcr.microsoft.com/dotnet/{sdk,aspnet}:8.0@sha256:…`, `node:20-alpine@sha256:…`, `nginx:alpine@sha256:…`). Tag-only references are mutable and break reproducibility.
- Backend containers run as **non-root** (`USER app` — the aspnet:8.0 base image ships this user).
- Per-service `HEALTHCHECK` in Dockerfile (for k8s) and compose (for dependency ordering). Gateway `depends_on: service_healthy` for auth/tenant/prm.
- `ASPNETCORE_ENVIRONMENT` is `${ASPNETCORE_ENVIRONMENT:-Development}` in compose so CI/CD can override.

## Logging
- **Never** log passwords, tokens, JWTs, BCrypt hashes, or PII.
- Structured fields only (`{Slug}`, `{ElapsedMs}`, `{CorrelationId}`) — no string interpolation in the message template.
- Correlation ID propagation via `CorrelationIdMiddleware` for cross-service tracing.

## Frontend hardening
- Access token in memory only. Logout clears the in-memory token AND calls `/api/auth/logout` to revoke the refresh cookie.
- All HTTP via `ApiClient` (interceptor attaches Bearer + withCredentials). Direct `HttpClient` in a feature component is a review-blocker.
- `[appTooltip]` not `matTooltip` (project-controlled DOM, no third-party portal pitfalls).
- No `any` types — DTOs match backend records. Catches breaking API changes at compile time.
