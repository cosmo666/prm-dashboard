# Security Rules

## Secrets Management
- NEVER hardcode API keys, passwords, tokens, or connection strings
- Use environment variables for all secrets
- .env files must be in .gitignore — no exceptions
- Validate all required env vars on startup — fail fast if missing

## Input Validation
- Validate ALL user inputs at the API boundary
- Sanitize strings — prevent SQL injection, XSS, command injection
- Validate date/time inputs strictly (timezone, format, range)
- Reject unexpected fields in request bodies

## Authentication & Authorization
- All endpoints require authentication except health checks
- Role-based access: employee sees own schedule, manager sees team, admin sees all
- Shift swap approvals must verify both parties' permissions
- Log all auth failures

## Data Protection
- Employee PII (phone, email, address) must not appear in logs
- Audit trail for all schedule changes: who, what, when, from-value, to-value
- Rate-limit login attempts
- Session timeout after inactivity

## Dependency Security
- Run vulnerability scans on dependencies regularly
- Pin dependency versions — no floating ranges in production
- Review changelogs before major version upgrades

## API Security
- Use HTTPS only
- CORS configured for known origins only
- Rate limiting on all public endpoints
- Return generic error messages to clients — detailed errors only in logs
