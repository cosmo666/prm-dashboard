# User Preferences

<!-- Claude: Update this file when the user states a preference about how they want things done. -->

## Communication Style
- [to be filled as learned]

## Coding Preferences
- [to be filled as learned]

## Workflow Preferences
- Shell commands: simple, avoid multi-line; prefer double quotes over single quotes
- File writes: direct file I/O, never bash heredocs (Windows EEXIST bug)
- Avoid bash-specific constructs unless explicitly required (Windows environment)
- When creating files with long content, write the file directly rather than piping through shell

## Windows EEXIST Bug Workaround
Do not attempt filesystem workarounds for the EEXIST error. The issue is caused by the Windows write API when attempting to create files that already exist.
- Never create a file that already exists. Open in read/write mode and overwrite contents.
- Do not attempt Bash-based file generation (cat, heredocs, bash -c).
- Do not embed large scripts inside `python -c`.
- If modification is needed, read the file, update the relevant section, write it back using normal file I/O.
- Do not write temporary files in other directories. All edits should occur directly on the existing file.

## Tool Preferences
- [to be filled as learned]
