# Python/FastAPI Backend Conventions

## Project Structure
- Monorepo: `backend/` directory with `app/` (framework) and `modules/` (domain)
- Each domain module: `modules/<name>/models/`, `schemas/`, `services/`
- Shared code: `modules/shared/` for cross-module models, schemas, utils
- Central model registry: `app/models_registry.py` — import all models here for Alembic discovery

## FastAPI Patterns
- Route handlers in `app/api/v1/` — keep thin, delegate to service layer
- Pydantic schemas for request/response validation — never pass raw dicts
- Dependency injection for database sessions (`Depends(get_db)`)
- Return consistent response shapes from endpoints
- Use `HTTPException` with meaningful status codes and detail messages

## SQLAlchemy Patterns
- SQLAlchemy 2.0 style — use `select()`, `Session.execute()`, not legacy `query()`
- Models inherit from shared `Base` in `app/core/database.py`
- Alembic for all schema migrations — never modify DB schema manually
- Use `pendulum` for timezone-aware datetime handling
- Index frequently queried columns (employee_id, flight_id, shift_date, department_id)

## Configuration
- Pydantic Settings (`app/core/config.py`) for env var loading and validation
- Never hardcode URLs, tokens, or connection strings
- Fail fast on missing required config at startup

## Observability
- structlog for structured logging (JSON in production, pretty in dev)
- OpenTelemetry instrumentation on FastAPI, SQLAlchemy, HTTPX
- Prometheus metrics via `prometheus-fastapi-instrumentator`
- Correlation ID middleware (`app/middleware/correlation.py`) for request tracing
- Redact sensitive fields: passwords, tokens, PII

## Testing
- pytest + pytest-asyncio as test runner
- Tests in `backend/tests/`
- Fixtures for test data setup
- Integration tests hit real database, not mocks

## Dependencies
- Versions pinned in `pyproject.toml`
- Dev dependencies in `[project.optional-dependencies.dev]`
- Ruff for linting (line-length=120, target py311)
