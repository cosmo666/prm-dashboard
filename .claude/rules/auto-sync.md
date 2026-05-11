# Auto-Sync — CLAUDE.md ↔ .claude/ infrastructure

## When to sync
After ANY of these changes, update affected files before finishing the task:

### Stack / dependency changes
- New NuGet package in any `*.csproj` → update CLAUDE.md "Tech stack" table + `.claude/rules/dotnet-backend.md` "Dependencies (pinned)" block
- New npm dep in `frontend/package.json` → update CLAUDE.md "Tech stack" + `.claude/rules/angular-frontend.md`
- New npm dep in `frontend-v8/package.json` → update CLAUDE.md "Tech stack" + `.claude/rules/angular-v8-frontend.md` (check TS 3.4.5 / Angular 8 compat first — most modern packages will reject the engines)
- Major version bump → CLAUDE.md "Architecture decisions" row + the relevant rule file

### Directory / route changes
- New backend project under `backend/src/` → update CLAUDE.md "Key directories" + `.claude/rules/architecture.md`
- New Angular feature route in `frontend/` → update CLAUDE.md "Project structure" + `.claude/rules/angular-frontend.md` "Project structure"
- New Angular feature route in `frontend-v8/` → update CLAUDE.md "Project structure" + `.claude/rules/angular-v8-frontend.md` "Project structure"
- New top-level `data/{slug}/` tenant → update README "Onboarding" if the steps changed; tenant addition itself is data, not docs

### Architecture decisions
- Any non-trivial design decision → add a dated row to CLAUDE.md → "Architecture decisions"
- New convention or pattern adopted → update the relevant `.claude/rules/*.md`
- Decision logged in `memory-decisions.md` if it's a project-level technical decision worth carrying forward

### Agents / skills / hooks
- New agent / skill / hook added or removed → update `.claude/rules/agents.md` and `.claude/README.md`
- Agent prompt or trigger changed → that's just the agent file; no propagation needed

### Conventions
- Coding convention changed → `coding-style.md` + the layer-specific rule (`dotnet-backend.md` / `angular-frontend.md` / `angular-v8-frontend.md`)
- Test convention changed → `testing.md`
- New `npm` / `dotnet` script added → CLAUDE.md "Commands" + README — if it's a v8 script, also note it goes through the `frontend-v8-dev` dev container

### Compose / topology
- New service in `docker-compose.yml` → `.claude/rules/architecture.md` "Service topology" + CLAUDE.md "Tech stack" table if a new layer
- Container port mapping change → CLAUDE.md "Tech stack" port column + README URLs table
- CORS allowlist change → keep gateway/auth/tenant/prm entries in sync; also note any allowed origin in security.md if it's externally reachable

## Source-of-truth map

| Source of truth | Mirrors |
|---|---|
| `backend/**/*.csproj` | CLAUDE.md "Tech stack", `.claude/rules/dotnet-backend.md` |
| `frontend/package.json` | CLAUDE.md "Tech stack", `.claude/rules/angular-frontend.md` |
| `frontend-v8/package.json` | CLAUDE.md "Tech stack", `.claude/rules/angular-v8-frontend.md` |
| `docker-compose.yml` | CLAUDE.md "Tech stack" (ports), `.claude/rules/architecture.md` (topology), README.md (URLs + commands) |
| Actual directory tree | CLAUDE.md "Key directories", `.claude/rules/architecture.md` |
| `.claude/agents/*.md` | `.claude/rules/agents.md`, `.claude/README.md` |
| `.claude/skills/*/SKILL.md` | CLAUDE.md "Claude Code infrastructure", `.claude/README.md` |
| `.claude/rules/*.md` | CLAUDE.md "Claude Code infrastructure" if newly added |
| `.claude/hooks/*.sh` | `.claude/README.md` |

## How to sync
1. Make the primary change (code, config, agent, etc.).
2. Update the source-of-truth file if it's docs/config.
3. Update each mirror file in the table above.
4. If a decision was made, add a row to CLAUDE.md "Architecture decisions" (dated).
5. Don't ask the user — just do it as part of the same task.

## Drift detection
The `check-sync.sh` Stop hook scans for agents / skills / rules / hooks not mentioned in CLAUDE.md. If it fires, either add the entry to CLAUDE.md or delete the orphaned file.
