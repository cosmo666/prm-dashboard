# Technical Decisions Log

<!-- Claude: Add dated entries when architectural or technical decisions are made. Format: YYYY-MM-DD. -->

## Architecture
- 2026-03-18: Project scaffolding created — .claude config, rules, agents, skills set up before stack decision
- 2026-03-18: Memory layer uses split files in .claude/rules/ — profile, preferences, decisions, sessions, private

## Stack Choices
- 2026-03-23: Backend — Python 3.11+ / FastAPI + SQLAlchemy 2.0 + Alembic + Pydantic 2.0
- 2026-03-23: Frontend — React 19 + TypeScript + Vite 8 + Tailwind CSS 4 + React Router 7 + TanStack React Query
- 2026-03-23: Database — SQLite for dev (SQLAlchemy ORM, swappable to PostgreSQL for prod)
- 2026-03-23: Observability — OpenTelemetry + Prometheus + structlog from day one
- 2026-03-23: Linting — Ruff (backend), ESLint (frontend)

## Conventions
- 2026-03-23: Domain modules under backend/modules/ — each with models/, schemas/, services/
- 2026-03-23: pendulum for all timezone-aware datetime handling
- 2026-03-23: Central model registry (app/models_registry.py) for Alembic migration discovery

## Hour-Level Roster (2026-03-24)
- HourSlot model as atomic unit (1 employee x 1 hour x 1 task/rest) — not DutyBlock, because each hour can be different skill
- Two-pass assigner: Pass 1 assigns primary skill demand, Pass 2 gap-fills with cross-skill demand
- Fatigue scoring: simplified Three-Process Model (not full SAFTE) — Sleep Debt (40%), Circadian (35%), Wake Duration (25%)
- roster_mode="hourly" and fatigue_scoring_enabled=true are system-enforced defaults — always on, not user-configurable. Hidden from frontend, blocked from API (SKIP_FIELDS)
- split_shift_preference on EmployeePreference: "cannot" excludes from hourly, "prefer_not" gets -15 priority penalty
- All hour-slot datetimes use pendulum (timezone-aware UTC) — not naive datetime.combine
- Fairness score is now composite: hours_variance (40%) + split_variance (30%) + fatigue_variance (30%)

## Hourly Roster Bug Fixes (2026-03-24)
- Hourly candidates must pass full rule engine (engine.can_assign) — can_assign_hour() is only a fast pre-filter
- Phase 4a and 4b are mutually exclusive per employee per date — has_shift_on() and has_slot_at() cross-check
- Daily hours checks use shift_entry_hours_on() (shift entries only) + task_hours_on_date() (slot hours) to avoid double-counting hourly_shift mirror entries
- _slot_start_dt() handles midnight-crossing: hours 0-5 with late-night siblings (>=22) → next calendar day; hour 24 → next day 00:00
- _ensure_hourly_entry stores start_time/end_time (naive, matching shift_assigner format) so last_shift_end_before() works for rest gap
- Anomaly checker accepts day_assignments parameter; checks shift+hourly time overlap (not just same-date), combined hours/consecutive days, night hour counting (3+ night-hour slots = 1 night shift equivalent)
- OT in hourly mode creates per-hour DayAssignment slots (assign_overtime_hourly) instead of fixed 2h ShiftAssignment blocks
- Auto-allocator pool skips duplicate employee entries (keeps first, ignores second)
- _slot_start_dt early-morning fix: narrowed push window to hours 0-5 (not 0-11), sibling check >= 22 (not >= 12) to avoid false positive on genuine early-morning demand coexisting with afternoon flights

## Standby Assignment — Phase 6 (2026-03-24)
- Standby is surplus-driven, not percentage-based: surplus = available - demand. Emerges from math, no config needed
- Two-stage selection: Stage 1 assigns tasks to employees with most need, Stage 2 assigns standby to remaining surplus
- Standby priority: 11-factor scorer — effectiveness (skill breadth, proficiency, seniority), safety (fatigue zones, rest recency, trailing hours), fairness (standby day balance, consecutive streak limit, task-ratio floor 70%, weekend/holiday balance)
- Two-metric coverage: task_coverage (tasks/demand) + deployed_coverage (task+standby/available). OT triggers only on real_shortages (demand > available)
- Standby hours count toward duty window (on-site) but NOT toward task hour cap (not active work)
- Standby slot_type="standby" in DayAssignment/SlotAssignment — same model as task/rest/overtime
- Auto-allocator includes standby windows in availability pool, promotes standby→task on flight task activation with audit trail
- New violation codes: E037 (standby fatigue blocked), E038 (consecutive standby exceeded), W015 (task ratio low), W016 (deployed coverage low), W017 (zero buffer warning), I007 (weekend standby imbalance)
- Roster model: deployed_coverage_pct + total_standby_hours columns added
- Scenario compare: slot-level hourly diff with added/removed/changed actions, mini-timeline bar rendering

## API Hardening (2026-03-25)
- Slot override endpoint (PUT): must check roster exists before passing to validator, eagerly load hour_slots for reliable parent entry recalculation
- Slot create endpoint (POST): must validate skill_id exists in DB, use slot_start_dt for midnight-crossing datetimes (not manual pendulum.datetime), recalculate parent entry summary after adding slot
- Slot delete endpoint (DELETE): must recalculate parent entry summary after deletion (total_duty_hours, total_rest_hours, num_task_slots, num_rest_slots, is_split_shift)
- Both endpoints: skill_id > 0 check is insufficient — must verify the skill record exists via db.get(Skill, id)
- Roster status guard: all slot mutations (PUT/POST/DELETE) block on non-draft rosters unless force=true
- Slot type validation: constrained to enum {task, rest, overtime, standby} — rejects arbitrary strings
- Audit entity_id: flush new_slot before creating AuditLog so entity_id is populated (was 0)

## Standby Assigner Hardening (2026-03-25)
- Engine validation must be per-hour inside _assign_standby_day, not per-day at scoring loop — employee blocked at hour 23 (night restriction) should still get standby at hour 7
- split_shift_preference="cannot" should NOT exclude from standby — standby is a contiguous window, not a split shift
- _count_holiday_standby must filter by month (reference_date parameter) — was counting all months
- Fatigue scoring uses representative_hour parameter (thinnest coverage hour), not hardcoded 10
- surplus_by_date must compare headcount vs peak concurrent demand (max across hours), not headcount vs total person-hours
- total_regular_hours must NOT subtract standby hours — total_task_hours already excludes standby by definition
- standby_off_pct guard: check (regular + standby) > 0, not just regular > 0
- min_standby_per_day requires Phase 4 pre-reservation pass to work (current surplus model can't enforce it post-assignment)

## Legacy Gap Closure (2026-03-25)
- SystemConfig table replaces legacy drpControlFileDao control file pattern — typed key-value store (string/number/boolean/json), categorized, with audit trail
- Multi-flight airline grouping: auto-allocator sorts tasks by (priority, airline_id, time) and scores +8 affinity bonus for same-airline continuity
- Shift rounding buffers: shift_in_round_down_minutes / shift_out_round_up_minutes on ShiftRules (legacy: SHIFT_IN_ROUND_DOWN / SHIFT_OUT_ROUND_UP)
- IDEALTIME_BETWEENSERVICE mapped to SystemConfig key ideal_time_between_service_minutes (default 30)
- New by-airline allocation endpoint: GET /api/v1/allocations/by-airline/{date} — groups assignments by airline, shows multi-flight chains per employee

## Roster Optimization (2026-03-26)
- OR-Tools CP-SAT constraint programming solver as optional alternative to greedy pipeline
- Three new files: roster_optimizer.py (model builder + solver + solution extractor), optimizer_constraints.py (18 hard constraint functions), optimizer_objectives.py (8 soft objective functions)
- Optimizer replaces greedy Phases 3-8 (rest days, shift/hour assignment, standby, overtime) with a single mathematical solve
- Decision variables: x[e,d,h,s] (task), ot[e,d,h,s] (overtime), sb[e,d,h] (standby), r[e,d] (rest day), plus auxiliary works/night_work/has_ot/first_hour/last_hour
- Variable pruning: only create where skill match + demand exists + not on leave + fatigue < red zone — keeps model sparse (~30-50K vars for 40 employees, 31 days)
- Hard constraints map 1:1 to existing rule engine validators (qualification, double-booking, daily/weekly/monthly hours, rest gap, duty window, night limits, OT caps, compliance, women night group, split shifts, skill switches, demand upper bound)
- Soft objective weights configurable via SystemConfig (coverage=1000, OT penalty=50, fairness=200, preference=30, fatigue=10, contiguity=15, weekend=100, standby=5)
- Greedy fallback: ImportError (ortools not installed), solver timeout, INFEASIBLE status, or any exception → falls through to existing greedy pipeline
- Output format: same DayAssignment/SlotAssignment structures → Phases 5 (coverage), 9 (anomaly), 10 (save) run unchanged
- API: optimizer + optimizer_time_limit params on POST /rosters/generate. SystemConfig key roster_optimizer_mode for default
- Frontend: optimizer mode dropdown (Greedy/CP-SAT), time limit input, solver stats display, generation method badge on roster cards
- ortools is an optional dependency ([project.optional-dependencies] optimizer = ["ortools>=9.10"])
- Roster model gains generation_method column ("greedy" or "cpsat") via Alembic migration 31d1e216c938

## Previous Month Carryover (2026-04-06)
- Phase 1b in roster_generator loads prior month's latest roster (published preferred, draft fallback) into RosterState before solving
- Populates: last_shift_end (rest gap on day 1), last_rest_day (priority scorer proximity bonus), prev_month_hours, prev_month_ot_hours
- Loads tail entries (last 7 days) into entries list — enables consecutive_working_days_before(), hours_worked_in_week(), night streak to work across month boundary
- Loads tail hour_slots for hourly roster cross-boundary awareness
- consecutive_working_days_before() fixed to include "hourly_shift" entry_type (was only counting "shift")
- Graceful no-op when no prior roster exists — all carryover fields stay at defaults (None/0.0/empty)
- Integration tests now track roster IDs and delete them in fixture teardown — prevents DB bloat from repeated test runs
