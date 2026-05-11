# Session Log — PRM Dashboard

Project-level session log for non-obvious learnings worth carrying forward. The user's per-project auto-memory (at `C:\Users\prera\.claude\projects\c--Users-prera-dev-ai-angular-powerbi\memory\`) captures preferences and short pointers; this file captures session-level discoveries that should outlive the chat.

## Recent sessions

- **2026-05-11** — Co-located both frontends on `main`. Imported `frontend-v8/` (Angular 8 + PrimeNG) from the `angular-8-rewrite` branch via `git read-tree --prefix=frontend-v8/`, added `frontend-v8` + `frontend-v8-dev` services to `docker-compose.yml` on host port 4300, extended CORS allowlists to include `:4300` origins. Created `.claude/rules/angular-v8-frontend.md` and cross-referenced it with `angular-frontend.md` so future sessions don't apply v17 conventions to v8 files or vice-versa. End state: `docker compose up -d --build` brings 6 healthy containers; both frontends return identical JSON from `/api/tenants/config?slug=aeroground` proving same-API. Discovered along the way: Phases 4 (Fulfillment) and 5 (Insights) of the v8 rewrite *did* ship — tabs are present in `frontend-v8/src/app/features/dashboard/tabs/` even though no dedicated plan documents exist for them.
- **2026-05-07** — `.claude/` infrastructure audit. Files had been copied wholesale from a prior DPDP CMS (Next.js / shadcn) project; replaced agents and most rule files to reflect the actual stack (Angular 17 + .NET 8 + DuckDB-over-Parquet). Kept `dotnet-backend.md`, `angular-frontend.md`, and the `prm-domain` skill — already PRM-correct.

## Format
One bullet per session. Date in ISO-8601 (YYYY-MM-DD). Lead with the takeaway, not the activity. Skip if the session produced nothing surprising.
