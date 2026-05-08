# Coding Style — PRM Dashboard

## File Organization
- One class / component per file. PascalCase filename matching the type name.
- Group imports: framework → third-party → local. No unused imports.
- Constants at the top, types/interfaces next, then implementation.
- **Backend**: max 1 class per file (DTO files which group related `record` types are the exception).
- **Frontend**: components in `.ts` + `.html` + `.scss` triplets when non-trivial; inline `template:` only for tiny wrappers (<40 lines). Max 300 lines per file.

## Naming
- Descriptive names over abbreviations (`employeeSchedule`, not `empSch`).
- Boolean variables / signals: prefix with `is`, `has`, `can`, `should` (`isLoading`, `hasError`, `canEdit`).
- Functions / methods: verb-first (`getKpiSummary`, `validateSlug`, `buildWhereClause`).
- C# classes / records / interfaces: PascalCase. Methods PascalCase. Locals/parameters camelCase. Private fields: `_camelCase`.
- TypeScript classes / components / interfaces: PascalCase. Files: kebab-case (`auth-interceptor.ts`, `airport-selector.component.ts`).
- Constants: UPPER_SNAKE_CASE in TypeScript; `PascalCase` for `const` in C# (and `_camelCase` for `static readonly` private fields).

## Error handling
- Never swallow exceptions silently. Log with structured fields and rethrow, or convert to a typed domain exception (`TenantParquetNotFoundException`) the middleware can map.
- Validate inputs at the boundary (controller / form). Trust internal callers.
- User-facing messages must be actionable (`"This airport isn't assigned to your account"`), not implementation noise (`"403 Forbidden"`).
- Backend errors emit `application/problem+json` (RFC 7807) via `ExceptionHandlerMiddleware`.

## Comments
- Default to writing **no comments**. Identifiers explain what; the code shows how.
- Write a comment only when the *why* is non-obvious — a hidden constraint, a workaround for a specific DuckDB behaviour, an invariant a future reader would break.
- Examples of comments worth keeping: "DuckDB's `/` returns DOUBLE — use `//` for integer division", "ROW_NUMBER over PARTITION BY id keeps the canonical row across pause/resume splits".
- Bad comments: restating the method name, narrating the next line, "added for ticket XYZ".
- TODO format: `// TODO(prerak): description — YYYY-MM-DD`.
- No commented-out code.

## Functions
- Single responsibility. One method does one thing.
- Max 3 parameters. Use a request object / options record / `PrmFilterParams` for more.
- Async methods always return `Task` / `Task<T>`. No `async void`. No `.Result` / `.Wait()`.
- Pure helpers get static methods on a static class (`HhmmSql`, `TenantParquetPaths`, `TimeHelpers`).

## Immutability
- Backend DTOs are `record` types — immutable by default.
- Frontend interfaces describe shapes; treat returned objects as read-only and produce new ones with spread (`{ ...filters, airport: code }`) rather than mutating.

## Magic values
- IATA SSR codes (WCHR, WCHC, MAAS, …) are domain constants — keep them inline. They're a closed set; see the `prm-domain` skill.
- Tenant slugs and airport codes are **never** hardcoded outside seed data and tests.
- Numeric thresholds (chart limits, page sizes) belong in named consts at the top of the file.
