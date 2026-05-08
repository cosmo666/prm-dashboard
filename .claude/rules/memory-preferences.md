# User Preferences

## Communication style
- Direct and concise — no filler.
- Show diffs and decisions, not running commentary.
- Don't repeat back what the user just said.
- Ask clarifying questions only when the answer can't be derived from a quick grep.

## Coding preferences
- Simple, readable code over clever abstractions.
- Practical naming — no Hungarian notation, no unnecessary prefixes.
- Comments explain WHY, not WHAT. Default to writing none.
- Files small — split when they exceed ~300 lines.

## Workflow preferences
- **Stack runs entirely under Docker Compose.** After a code change, rebuild the affected container (`docker compose up -d --build <service>`). Don't default to `ng serve` / `dotnet run` for verification.
- Long-running commands: prefer `run_in_background` over polling sleeps.
- Shell commands: simple, single-line; double quotes preferred over single.
- File writes: use the `Write` / `Edit` tools, never bash heredocs (Windows EEXIST bug — see below).
- PowerShell is the default shell on this machine; Git Bash available when a POSIX script is required.

## Windows EEXIST workaround
The Windows `open(O_CREAT|O_EXCL)` API fails with `EEXIST` when bash heredocs try to create an existing temp file. Mitigation:
- Never recreate a file that already exists. Open in read/write mode and overwrite contents (the `Write` tool does this).
- Don't use `cat <<EOF`, `bash -c "echo … > file"`, or `python -c "open(...).write(big_string)"` for file generation.
- For modifications: `Read` the file, change in-memory, `Write` it back.

## Tool preferences
- Prefer dedicated tools over `Bash`: `Read`, `Edit`, `Write`, `Glob`, `Grep`.
- For broad codebase exploration spanning multiple queries, dispatch the `Explore` subagent.
- For new features with cross-cutting concerns (tenant isolation / RBAC / dedup / HHMM), dispatch the `planner` agent first.

## Testing preferences
- Backend: prefer fixture-backed integration tests over mocks. Pin exact values from the fixture (`Assert.Equal(<exact>, value)`), not `Assert.True(value > 0)`.
- Frontend: full component-level testing is out of scope for this POC; test pure utility code opportunistically.
