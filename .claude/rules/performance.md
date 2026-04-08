# Performance Rules

## Model Selection
- Default: Sonnet for everyday coding, bug fixes, tests, refactoring
- Switch to Opus (`/model opus`) for: architecture decisions, complex debugging, multi-file refactors
- Use `/clear` between unrelated tasks (free context reset)
- Use `/compact` at logical breakpoints: after research, after milestones, after failed approaches

## Context Management
- Keep under 10 MCP servers enabled
- Disable unused MCPs in project settings via `disabledMcpServers`
- Monitor context usage with `/context` periodically
- When context is heavy, start a fresh session with a clear task description

## Code Performance
- Database queries: always paginate list endpoints, use indexes on frequently queried fields
- N+1 queries: batch-load related data (shifts → employees, rotas → shifts)
- Cache static reference data (shift templates, department list, role definitions)
- Profile before optimizing — measure, don't guess
