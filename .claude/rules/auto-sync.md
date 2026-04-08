# Auto-Sync Rule: CLAUDE.md ↔ .claude/ Infrastructure

## When to Sync
After ANY of these changes, update all affected files before finishing the task:

### Stack or dependency changes
- New dependency added to `pyproject.toml` or `package.json` → update Tech Stack in CLAUDE.md
- Framework or library swapped → update CLAUDE.md Tech Stack + relevant rule file (python-backend.md / react-frontend.md)

### Directory structure changes
- New module added under `backend/modules/` → update Key Directories in CLAUDE.md
- New page/component in `frontend/src/` → update Key Directories in CLAUDE.md
- New top-level directory → update Key Directories in CLAUDE.md

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
| `pyproject.toml` + `package.json` | CLAUDE.md Tech Stack, python-backend.md, react-frontend.md |
| Actual directory tree | CLAUDE.md Key Directories |
| `.claude/agents/*.md` | CLAUDE.md Claude Code Infrastructure → Agents |
| `.claude/skills/*/SKILL.md` | CLAUDE.md Claude Code Infrastructure → Skills |
| `.claude/hooks/*` | CLAUDE.md Claude Code Infrastructure → Hooks |
| `.claude/rules/*.md` | CLAUDE.md Claude Code Infrastructure → Rules |

## How to Sync
1. Make the primary change (code, config, agent, etc.)
2. Update the source-of-truth file if needed
3. Update all mirror files listed above
4. If an architecture decision was made, log it in both CLAUDE.md and memory-decisions.md
5. Do NOT ask the user — just do it as part of the task
