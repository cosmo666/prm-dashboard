# Agent Delegation — PRM Dashboard

## When to delegate
Hand a task to a subagent when it's well-scoped, doesn't need clarifying back-and-forth, and either (a) parallelises with other work, or (b) would otherwise blow up the main context with file reads.

## Available agents

### planner
- **When**: starting a new feature, breaking a multi-step task into ordered steps.
- **Trigger phrases**: "plan", "implement", "add feature", "build [X]".
- **Output**: file changes (new + modified), ordered implementation steps, cross-cutting concerns (tenant/RBAC/dedup/HHMM), test plan, risks.

### architect
- **When**: making a design decision with tradeoffs — service boundaries, query patterns, store shape, chart wrapper API.
- **Trigger phrases**: "design", "architecture", "how should I structure", "is it OK to …", "should we add …".
- **Output**: 2–4 options with concrete consequences (tenant isolation, perf, test surface, ops), recommendation, follow-ups including the decision-record row to add to CLAUDE.md.

### code-reviewer
- **When**: after implementing a feature, before committing, or when asked for a second opinion on a change.
- **Trigger phrases**: "review", "check my code", "anything I missed".
- **Output**: blocking issues (bugs / security / convention violations) + suggestions + test gaps, all cited as `file:line`.

## Skills (auto-loaded by name, not delegated)

### prm-domain
Invoke whenever the work touches `prm_services` data, durations, dedup, service codes, or chart copy that names PRM concepts. Loaded via the `Skill` tool, not the `Agent` tool.

## Don't delegate
- Ambiguous tasks needing user clarification — ask the user.
- Trivial changes (< 5 minutes, single file).
- Tasks that need conversation context (recent decisions, open questions, half-finished work) the subagent won't have.
- Anything where you'd just be passing through the agent's output verbatim — do it yourself and save the round-trip.

## Don't duplicate
If you delegate research to a subagent, don't also run the same searches yourself in the main thread. Trust the agent's findings or call out specifically what you want re-verified.
