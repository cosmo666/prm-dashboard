# Auto-Sync Rule: CLAUDE.md ↔ .claude/ Infrastructure

## When to Sync
After ANY of these changes, update all affected files before finishing the task:

### Stack or dependency changes
- New `<PackageReference>` added to a `.csproj` → update Tech Stack in CLAUDE.md and the dependencies section in `dotnet-backend.md`
- New entry in `frontend/package.json` → update Tech Stack in CLAUDE.md and `angular-frontend.md`
- Framework or library swapped → update CLAUDE.md Tech Stack + relevant rule file (`dotnet-backend.md` / `angular-frontend.md`)

### Directory structure changes
- New project added under `backend/src/` → update Key Directories in CLAUDE.md and `architecture.md`
- New feature added under `frontend/src/app/features/` → update Key Directories in CLAUDE.md
- New top-level directory → update Key Directories in CLAUDE.md
- New SQL migration file added under `backend/src/PrmDashboard.TenantService/Schema/Migrations/` → no CLAUDE.md change, but verify it's listed as `<EmbeddedResource>` in the `.csproj`

### Architecture decisions
- Any design decision made → add to Architecture Decisions in CLAUDE.md + memory-decisions.md
- New pattern or convention adopted → update the relevant rule file

### Agent, skill, or hook changes
- Agent added/modified/removed in `.claude/agents/` → update Claude Code Infrastructure section in CLAUDE.md
- Skill added/modified/removed in `.claude/skills/` → update Claude Code Infrastructure section in CLAUDE.md
- Hook added/modified/removed in `.claude/hooks/` → update Claude Code Infrastructure section in CLAUDE.md

### Convention changes
- Coding convention changed → update coding-style.md + Conventions section in CLAUDE.md if significant
- New command added (dev server, test, lint, build) → update Commands section in CLAUDE.md

## Files That Must Stay in Sync
| Source of Truth | Mirrors |
|----------------|---------|
| `backend/src/**/*.csproj` + `frontend/package.json` | CLAUDE.md Tech Stack, `dotnet-backend.md`, `angular-frontend.md` |
| Actual directory tree | CLAUDE.md Key Directories, `architecture.md` File map |
| `.claude/agents/*.md` | CLAUDE.md Claude Code Infrastructure → Agents |
| `.claude/skills/*/SKILL.md` | CLAUDE.md Claude Code Infrastructure → Skills |
| `.claude/hooks/*` | CLAUDE.md Claude Code Infrastructure → Hooks |
| `.claude/rules/*.md` | CLAUDE.md Claude Code Infrastructure → Rules |
| `docs/superpowers/specs/*.md` | Spec stays canonical; plan and CLAUDE.md may reference it |
| `docs/superpowers/plans/*.md` | Plan stays canonical for execution; update tasks if scope shifts |

## How to Sync
1. Make the primary change (code, config, agent, etc.)
2. Update the source-of-truth file if needed
3. Update all mirror files listed above
4. If an architecture decision was made, log it in both CLAUDE.md and memory-decisions.md
5. Do NOT ask the user — just do it as part of the task
