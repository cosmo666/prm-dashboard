# RMS Architecture — Big Picture

## Why This Architecture Exists

RMS is an AI-powered resource management system for airport ground operations. It handles demand forecasting, dynamic rostering, real-time task assignment, and disruption management for ground handling teams. Reliability is critical — scheduling and task errors directly impact flight OTP and safety compliance.

## How It Works

```
                    ┌─────────────────────────────────────────────┐
                    │           External Airport Systems          │
                    │  (AODB, FIDS, DCS, Airline Contracts)       │
                    └──────────────────┬──────────────────────────┘
                                       │ flight data, gate changes
                                       ▼
                              ┌─────────────────┐
Ops Manager ──→ React SPA ──→│  FastAPI Backend  │──→ SQLite/PostgreSQL
Field Staff ──→ (Vite)    ──→│  (Python 3.11+)  │
                              └────────┬────────┘
                                 ┌─────┴──────┐
                                 │             │
                          Planning Engine   Real-Time Engine
                          (demand forecast, (task assignment,
                           roster gen,       disruption mgmt,
                           coverage calc)    location tracking)
```

### Backend (`backend/`)
- **Framework**: FastAPI + Pydantic 2.0 + SQLAlchemy 2.0
- **Modules**: Domain-driven modules under `modules/` (allocations, audit, demand, employees, engagement, flights, roster, rules, shared)
- **Observability**: OpenTelemetry + Prometheus + structlog
- **Migrations**: Alembic

### Frontend (`frontend/`)
- **Framework**: React 19 + TypeScript + Vite + Tailwind CSS 4
- **Data**: TanStack React Query + centralized API client
- **Routing**: React Router 7

## Key Architectural Principles

1. **Two engines**: Planning (ahead-of-time roster generation) and Real-Time (day-of task assignment and disruption response)
2. **Flight-centric data model** — tasks are linked to flight turns, not just time windows; when flights change, tasks cascade
3. **Qualification-aware everywhere** — every assignment must validate staff certifications (safety compliance, not optional)
4. **Timezone-aware** — store UTC, display airport local time, handle DST transitions
5. **Audit trail mandatory** — every roster/task change must be traceable (who, what, when, old value, new value, reason)
6. **SLA tracking built-in** — task completion times measured against airline contract targets
7. **Mobile-first field experience** — ground staff interact primarily through mobile app
8. **Integration-ready** — designed for connections to AODB, FIDS, DCS, and third-party systems
9. **Disruption-resilient** — system must handle cascading flight delays without manual intervention
10. **Runtime-configurable** — operational parameters live in SystemConfig (key-value store), not hardcoded. Changes take effect without code changes or restarts.
11. **Airline-aware allocation** — auto-allocator groups tasks by airline for multi-flight continuity. Employees already handling an airline's flights get affinity bonus for subsequent flights.

## Modularity & Extraction Candidates

| Component | Extraction Potential |
|-----------|---------------------|
| Planning engine | Demand forecasting + roster generation — could serve as standalone scheduling library |
| Real-time task assigner | Qualification-aware, proximity-based assignment — reusable for any field ops |
| Disruption handler | Cascading reassignment engine — triggered by external flight data changes |
| SLA tracker | Measures actual vs target task completion — reusable metrics service |
| Qualification manager | Tracks certifications, expiry, compliance — reusable HR module |
| Integration layer | Airport system connectors (AODB, FIDS) — adapter pattern for swappable implementations |
| Location tracker | Real-time staff/equipment positioning — could serve any field workforce |
| Notification service | Alerts for roster changes, task assignments, SLA breaches, qualification expiry |
| System config store | Key-value operational parameters — reusable runtime config module |

## Architecture Decisions

See CLAUDE.md `## Architecture Decisions` for the canonical log.
