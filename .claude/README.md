# `.claude/` — Claude Code infrastructure for PRM Dashboard

This directory configures how Claude Code works with the **PRM Dashboard** project (multi-tenant airport ground-handling analytics — Angular 17 + .NET 8 + DuckDB-over-Parquet).

The authoritative project instructions are in [`CLAUDE.md`](../CLAUDE.md) at the repo root. This directory provides:

- **Subagents** with PRM-specific prompts (planning, architecture, code review)
- **Rules** documenting per-layer conventions and project-level guardrails
- **Skills** with portable domain knowledge (PRM / IATA SSR / HHMM / dedup)
- **Hooks** for drift detection and learning capture (opt-in via `settings.json`)

## Layout

```
.claude/
├── README.md                  # This file
├── agents/
│   ├── planner.md             # Plans feature work — file changes, ordered steps, cross-cutting concerns
│   ├── architect.md           # Decisions with tradeoffs — options, recommendation, follow-ups
│   └── code-reviewer.md       # Reviews changes — bugs / security / convention violations cited as file:line
├── rules/                     # Always loaded into context with CLAUDE.md
│   ├── architecture.md        # System architecture, request flow, multi-tenant invariants
│   ├── dotnet-backend.md      # .NET 8, DuckDB + Parquet, multi-tenant, JWT, anti-patterns
│   ├── angular-frontend.md    # Angular 17 standalone, NgRx Signal Store, ECharts wrappers, RBAC
│   ├── coding-style.md        # File org, naming, error handling, comments, immutability
│   ├── development-workflow.md  # Research-first, implementation order, pre-commit checklist
│   ├── security.md            # Secrets, auth, tenant isolation, RBAC, container hardening
│   ├── testing.md             # xUnit layers (unit / fixture / WebApplicationFactory), conventions
│   ├── performance.md         # DuckDB hot paths, Angular signals, bundle size
│   ├── git-workflow.md        # Conventional commits, branch naming, PR process
│   ├── agents.md              # Index of available subagents and triggers
│   ├── auto-sync.md           # CLAUDE.md ↔ .claude/ sync rules, source-of-truth map
│   ├── memory-decisions.md    # Project-level technical decisions log
│   ├── memory-sessions.md     # Session-level learnings worth carrying forward
│   ├── memory-profile.md      # User identity / role / environment
│   ├── memory-preferences.md  # Communication / coding / workflow / Windows-specific preferences
│   ├── memory-private.md      # Personal / sensitive context (gitignored — never commit)
│   └── frontend-conventions.md  # Stub — redirects to angular-frontend.md
├── skills/
│   └── prm-domain/SKILL.md    # PRM domain knowledge: IATA SSR codes, HHMM, dedup, regions
├── hooks/
│   ├── check-sync.sh          # Stop hook — flags drift between .claude/ and CLAUDE.md
│   └── stop-reflect.sh        # Stop hook — suggests memory updates after fix/discovery sessions
└── agents/                    # (above)
```

## How Claude uses this directory

### Always-loaded
- **CLAUDE.md** + everything in **`.claude/rules/`** is loaded into the context window on every session start.
- `MEMORY.md` (in the user's per-project auto-memory at `C:\Users\prera\.claude\projects\…\memory\`) is also auto-loaded.

### On-demand
- **Subagents** in `.claude/agents/` are invoked via the `Agent` tool. Triggers are listed in `rules/agents.md`.
- **Skills** in `.claude/skills/` are invoked via the `Skill` tool when the work touches the matching domain. The `prm-domain` skill should be invoked **before any work that touches `prm_services` data, durations, dedup, or service codes**.

## Subagents — quick reference

| Agent | When to use | Trigger phrases |
|---|---|---|
| **planner** | Starting a new feature or breaking down a multi-step task | "plan", "implement", "add feature", "build [X]" |
| **architect** | Making a design decision with tradeoffs | "design", "architecture", "should we …", "is it OK to …" |
| **code-reviewer** | Before committing or asking for a second opinion | "review", "check my code", "anything I missed" |

All three live in `.claude/agents/*.md` and use the `Read`, `Grep`, `Glob` tools only. They don't execute code or write to disk — they return structured advice.

## Rules — what's where

The rule files are organised by what they govern, not by file size. Read in this order when picking up the project:

1. **architecture.md** — the system at a glance, request flow, invariants
2. **dotnet-backend.md** — backend conventions (DuckDB + Parquet, JWT, services)
3. **angular-frontend.md** — frontend conventions (standalone components, Signal Store, charts)
4. The rest as needed (coding-style for naming, testing for fixture patterns, etc.)

Memory files (`memory-*.md`) are project-level state — decisions, sessions, profile, preferences, private. They're committed (except `memory-private.md`) so onboarding to the project preserves continuity.

## Skills

### `prm-domain`
PRM (Passenger with Reduced Mobility) airport ground-handling domain knowledge. Covers:

- IATA SSR service codes (WCHR, WCHC, WCHS, WCHP, MAAS, BLND, DEAF, STCR, DPNA) — what they mean and typical volume share
- HHMM time encoding (`1430` = 14:30) and the integer-truncation gotcha
- Pause/resume semantics and the canonical `ROW_NUMBER OVER (PARTITION BY id)` dedup
- Common SQL aggregations and time-of-day patterns
- Airline region color coding for charts

**Invoke this skill** via the `Skill` tool whenever the work involves PRM data, dashboard queries, chart copy, or anything that names a service code.

## Hooks (opt-in)

The two scripts in `.claude/hooks/` are not wired up yet — they're available to opt into.

### `check-sync.sh`
Stop hook that scans `.claude/` for orphaned files (agents / skills / rules / hooks not mentioned in CLAUDE.md). Useful when you've just added a new agent or rule and want a reminder to update CLAUDE.md.

### `stop-reflect.sh`
Stop hook that scans the session transcript for fix/discovery patterns (`fixed`, `workaround`, `gotcha`, `turns out`, etc.) and suggests updating `memory-decisions.md` or `memory-sessions.md` with what was learned.

### Wiring
Add to a `.claude/settings.json` (or `.claude/settings.local.json` if you don't want it committed):

```json
{
  "hooks": {
    "Stop": [
      { "matcher": ".*", "hooks": [
        { "type": "command", "command": "bash .claude/hooks/check-sync.sh" },
        { "type": "command", "command": "bash .claude/hooks/stop-reflect.sh" }
      ]}
    ]
  }
}
```

The hooks shell out to `bash`, which on Windows resolves to Git Bash. They're silent unless they detect drift / discoveries.

## Maintaining this directory

When the codebase or conventions shift, update both the source-of-truth and its mirrors. The map is in [`rules/auto-sync.md`](./rules/auto-sync.md).

A typical update flow:
1. Make the primary change in code or CLAUDE.md.
2. Update the relevant `rules/*.md` if a convention shifted.
3. If a non-trivial decision was made, add a dated row to CLAUDE.md → "Architecture decisions" and a note to `rules/memory-decisions.md`.
4. If you added/removed an agent / skill / hook, update `rules/agents.md` and this README.

## What's intentionally NOT here

- **No `settings.json`** — kept opt-in; users wire hooks/permissions to taste.
- **No project-specific MCP server config** — this project doesn't need any beyond the defaults.
- **No `commands/`** — there are no project-specific slash commands.
- **No CI hooks** — code quality gates live in `dotnet build` / `dotnet test` / `npm run lint`, run by the developer or pipeline.
