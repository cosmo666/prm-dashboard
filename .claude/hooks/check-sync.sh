#!/bin/bash
# Post-session hook: detect drift between CLAUDE.md and .claude/ infrastructure
# Checks if key files have changed without corresponding CLAUDE.md updates

CONTEXT=$(cat)
DRIFT_WARNINGS=""

# Check if any agent files exist that aren't mentioned in CLAUDE.md
for agent_file in .claude/agents/*.md; do
    [ -f "$agent_file" ] || continue
    agent_name=$(basename "$agent_file" .md)
    if ! grep -q "$agent_name" CLAUDE.md 2>/dev/null; then
        DRIFT_WARNINGS="$DRIFT_WARNINGS\n- Agent '$agent_name' exists but not listed in CLAUDE.md"
    fi
done

# Check if any skill directories exist that aren't mentioned in CLAUDE.md
for skill_dir in .claude/skills/*/; do
    [ -d "$skill_dir" ] || continue
    skill_name=$(basename "$skill_dir")
    if ! grep -q "$skill_name" CLAUDE.md 2>/dev/null; then
        DRIFT_WARNINGS="$DRIFT_WARNINGS\n- Skill '$skill_name' exists but not listed in CLAUDE.md"
    fi
done

# Check if any rule files exist that aren't mentioned in CLAUDE.md
for rule_file in .claude/rules/*.md; do
    [ -f "$rule_file" ] || continue
    rule_name=$(basename "$rule_file" .md)
    # Skip memory files — they're already listed separately
    case "$rule_name" in memory-*) continue ;; esac
    if ! grep -q "$rule_name" CLAUDE.md 2>/dev/null; then
        DRIFT_WARNINGS="$DRIFT_WARNINGS\n- Rule '$rule_name' exists but not listed in CLAUDE.md"
    fi
done

# Check if hook scripts exist that aren't mentioned in CLAUDE.md
for hook_file in .claude/hooks/*.sh; do
    [ -f "$hook_file" ] || continue
    hook_name=$(basename "$hook_file")
    if ! grep -q "$hook_name" CLAUDE.md 2>/dev/null; then
        DRIFT_WARNINGS="$DRIFT_WARNINGS\n- Hook '$hook_name' exists but not listed in CLAUDE.md"
    fi
done

if [ -n "$DRIFT_WARNINGS" ]; then
    cat << EOF
{
  "decision": "approve",
  "systemMessage": "DRIFT DETECTED between .claude/ files and CLAUDE.md:$(echo -e "$DRIFT_WARNINGS")\nPlease update CLAUDE.md Claude Code Infrastructure section to stay in sync."
}
EOF
else
    echo '{"decision": "approve"}'
fi
