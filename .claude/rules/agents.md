# Agent Delegation Rules

## When to Delegate
Delegate to a subagent when the task is well-scoped and doesn't need back-and-forth with the user.

## Available Agents

### planner
- **When**: Starting a new feature, breaking down a large task
- **Trigger**: "plan", "implement", "add feature", "build"
- **Output**: Step-by-step implementation blueprint with file changes

### architect
- **When**: System design decisions, choosing patterns, database schema design
- **Trigger**: "design", "architecture", "how should I structure"
- **Output**: Architecture decision record with tradeoffs

### code-reviewer
- **When**: After implementing a feature, before committing
- **Trigger**: "review", "check my code", "anything I missed"
- **Output**: Quality, security, and maintainability feedback

## Do NOT Delegate
- Ambiguous tasks needing user clarification
- Quick fixes (< 5 minutes of work)
- Tasks requiring conversation context the subagent won't have
