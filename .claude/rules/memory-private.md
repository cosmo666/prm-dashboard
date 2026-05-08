# Private Information

> **Do not commit this file.** Add `.claude/rules/memory-private.md` to `.gitignore` if it isn't already (the rest of `.claude/rules/` is committed; only this one is private).

Free-form notes for sensitive personal context the user wants Claude to remember within this project. Examples: client codenames, tenant slug ↔ real airport mappings the user prefers to keep out of git, deployment IPs, on-prem credentials handled via secret managers.

## Personal
- _(empty)_

## Sensitive context
- _(empty)_

## Credentials handling
- All real secrets belong in `.env` (gitignored). `.env.example` is the only auth template that is committed.
