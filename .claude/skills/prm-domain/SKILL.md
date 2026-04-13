---
name: prm-domain
description: PRM (Passenger with Reduced Mobility) domain knowledge for airport ground handling analytics. Use when implementing dashboard aggregations, duration calculations, service type analysis, or any query/UI involving PRM services.
---

# PRM Domain Knowledge

## What "PRM" means

PRM = **Passenger with Reduced Mobility** — any passenger who needs assistance during air travel due to a temporary or permanent disability. Airlines and airports are legally required to provide assistance (EU 1107/2006, US ACAA, etc.). Ground handling companies employ PRM agents who meet passengers at the aircraft, gate, or check-in and escort them through the airport.

## Service types (IATA SSR codes)

These are the exact codes stored in `prm_services.service`:

| Code | Meaning | Typical volume share |
|------|---------|---------------------|
| **WCHR** | Wheelchair — passenger can walk stairs and to/from aircraft seat, needs wheelchair only for long distances | ~92% (most common) |
| **WCHS** | Wheelchair — cannot walk stairs but can reach seat | ~1% |
| **WCHC** | Wheelchair — completely immobile, needs assistance to seat | ~5% |
| **MAAS** | Meet-and-assist — passenger needs guidance but no wheelchair | ~1% |
| **BLND** | Blind / visually impaired | <1% |
| **DPNA** | Developmental/cognitive assistance | <1% |
| **UMNR** | Unaccompanied minor | <1% |
| **MEDA** | Medical assistance (stretcher, oxygen) | <1% |
| **WCMP** | Own manual wheelchair (passenger brings their own) | <1% |

These are industry standards — do NOT add custom service codes. The UI in Tab 3 (Service Breakup) shows all 9 as clickable summary cards.

## Core entities

### PRM service record

A single service = one passenger needing one assist on one flight. Stored in `prm_services` table in each tenant DB.

Key columns and their semantics:

- `row_id` — auto-increment PK, true row identifier
- `id` — **source system service ID; can repeat across multiple rows** when a service is paused/resumed
- `flight` — airline code + flight number (e.g., `"EK 568"`)
- `agent_no`, `agent_name` — the PRM agent handling the service
- `prm_agent_type` — either `"SELF"` (employed by the ground handler) or `"OUTSOURCED"` (contractor)
- `start_time`, `paused_at`, `end_time` — **stored as HHMM integers**, e.g., `237` = 02:37, `1430` = 14:30
- `service` — one of the IATA SSR codes above
- `seat_number` — passenger's seat (e.g., `"8G"`)
- `loc_name` — the airport where the service happened (e.g., `"BLR"`, `"HYD"`)
- `airline` — 2-letter IATA airline code
- `departure` / `arrival` — 3-letter IATA airport codes
- `requested` — `1` if pre-requested via PNR, `0` if walk-up
- `no_show_flag` — `'N'` or NULL; marks passenger no-shows

### Agent

A person who provides PRM services. Tracked by `agent_no` (stable ID across the tenant). One agent can handle many services per day and may be flagged as SELF or OUTSOURCED.

### Airport

Identified by 3-letter IATA code (`BLR`, `HYD`, `DEL`, `BOM`, `MAA`, `SYD`, `KUL`, `JFK`, etc.). Each employee in the system is assigned to one or more airports via `employee_airports`. Dashboard queries always filter by a single airport.

## The pause/resume model — critical for dedup

A PRM service can be **paused** mid-delivery. Example: the agent is walking a wheelchair passenger to the gate, but the flight is delayed, so they park the passenger and the agent goes to another task. Later, a different agent (or the same one) resumes the service.

When this happens, the source system writes **two rows with the same `id`**:

| row_id | id      | start_time | paused_at | end_time | agent_name |
|--------|---------|-----------|-----------|----------|-----------|
| 1      | 3860991 | 0237      | 0320      | 0320     | Alice      |
| 2      | 3860991 | 0405      | NULL      | 0420     | Bob        |

**Counting rule:** `COUNT(DISTINCT id)` — this service counts as **1**, not 2.

**Duration rule:** Sum of active segments per id.
- First row: `paused_at (0320) - start_time (0237)` = 43 minutes active
- Second row: `end_time (0420) - start_time (0405)` = 15 minutes active
- Total active for service id 3860991: **58 minutes**

The `TimeHelpers.CalculateActiveMinutes(start, pausedAt, end)` function in the Shared library handles the single-row case. The SQL in PRM Service aggregates multiple rows by grouping on `id` when calculating totals.

## HHMM integer encoding

Times in `prm_services` are stored as integers in HHMM format. This is NOT minutes-since-midnight — it's a packed `hours * 100 + minutes`.

- `237` = 02:37
- `1430` = 14:30
- `0` = 00:00
- `2359` = 23:59

Conversion (see `PrmDashboard.Shared.Extensions.TimeHelpers`):

```csharp
double minutes = (hhmm / 100) * 60 + (hhmm % 100);
```

**Gotcha:** Midnight-crossing services (start 2330, end 0100) require special handling. For the POC, assume services do not cross midnight — the source system splits them into two records at the day boundary. If you encounter real midnight-crossing data later, add explicit handling in the SQL aggregation layer.

**Gotcha:** Do NOT write range queries like `WHERE start_time > 800 AND start_time < 1700` without understanding that this is HHMM encoding, not minutes. That range excludes services starting at 0830 (830) because 830 > 800 is true but 830 is 08:30, not 13:50.

## Common calculations

### Total PRM services for a date range

```sql
SELECT COUNT(DISTINCT id)
FROM prm_services
WHERE loc_name = :airport
  AND service_date BETWEEN :from AND :to;
```

### Average services per agent per day

```sql
SELECT
  COUNT(DISTINCT id) * 1.0 / (COUNT(DISTINCT agent_no) * COUNT(DISTINCT service_date))
FROM prm_services
WHERE loc_name = :airport
  AND service_date BETWEEN :from AND :to;
```

### Average duration (handling pause/resume correctly)

```sql
-- Per-id active minutes, then average
SELECT AVG(total_minutes) FROM (
  SELECT id, SUM(
    CASE
      WHEN paused_at IS NOT NULL
        THEN (paused_at DIV 100) * 60 + (paused_at MOD 100)
           - (start_time DIV 100) * 60 - (start_time MOD 100)
      ELSE
        (end_time DIV 100) * 60 + (end_time MOD 100)
        - (start_time DIV 100) * 60 - (start_time MOD 100)
    END
  ) AS total_minutes
  FROM prm_services
  WHERE loc_name = :airport
    AND service_date BETWEEN :from AND :to
  GROUP BY id
) per_service;
```

### Fulfillment rate

```sql
SELECT
  SUM(CASE WHEN no_show_flag IS NULL OR no_show_flag != 'N' THEN 1 ELSE 0 END) * 100.0
  / NULLIF(COUNT(DISTINCT id), 0) AS fulfillment_pct
FROM prm_services
WHERE loc_name = :airport
  AND service_date BETWEEN :from AND :to;
```

### Self vs Outsourced split

```sql
SELECT prm_agent_type, COUNT(DISTINCT id) AS cnt
FROM prm_services
WHERE loc_name = :airport
  AND service_date BETWEEN :from AND :to
GROUP BY prm_agent_type;
```

## Time-of-day patterns

Real PRM workloads are peaked. When generating seed data or validating analytics, expect roughly:

| Time window | Share of daily volume |
|-------------|----------------------|
| 00-04       | ~3%  (very low — red-eye flights) |
| 04-08       | ~2%  (low — pre-morning) |
| **08-12**   | **~40% (peak — morning departures)** |
| 12-16       | ~25% (high — midday mix) |
| 16-20       | ~20% (high — evening departures) |
| 20-24       | ~10% (medium — late evening) |

The Fulfillment tab "PRM by Time of Day" chart colors these bins: red (peak), amber (high), green (medium), gray (low).

## Walk-up vs pre-requested

- **Pre-requested** (`requested = 1`) — passenger booked PRM assistance via PNR ahead of time
- **Walk-up** (`requested = 0`) — passenger arrived at the airport and asked for assistance on the spot

**Fulfillment rate** compares provided services to pre-requested ones. Walk-up rate is the fraction of provided services that weren't pre-requested.

```
fulfillment_rate  = provided_for_requested / total_requested
walk_up_rate      = (total_provided - total_requested_and_provided) / total_provided
```

## Airline region colors (Tab 2)

When displaying top airlines, bars are color-coded by carrier region:

| Region | Airlines (examples) | Suggested color |
|--------|---------------------|-----------------|
| Indian | AI, 6E, UK | Red (#ef5350) / Blue (#42a5f5) |
| Gulf   | EK, QR, EY, SV | Orange (#ffa726) / Teal (#26a69a) |
| APAC   | SQ, CX, TG, MH | Green (#66bb6a) |
| Other  | LH, BA, AF, DL, UA | Gray (#78909c) |

This is hardcoded in the frontend for visual consistency. No server-side logic assumes these groupings.

## POS locations

`pos_location` is where the service was scanned / began. Common values (no hard enum — accept any string):

- `"Aircraft Point"` — at the aircraft door
- `"Check-in Counter"` — at check-in
- `"Gate Area"` — at the departure gate
- `"Immigration"` — after passport control
- `"Baggage Claim"` — at arrival

## What to NOT assume

- **Do not assume a service maps to exactly one row.** Always aggregate by `id` for totals.
- **Do not assume all services have `agent_name` and `agent_no` populated.** Outsourced services sometimes lack agent identity.
- **Do not assume `flight_number` is unique per day.** Multiple airlines can have the same flight number.
- **Do not assume `start_time < end_time` in raw integer comparison.** `2330` < `0100` is true but the service crosses midnight.
- **Do not assume `requested >= actual provided`.** Walk-ups can exceed requests.

## Dashboard tabs cheat-sheet

| Tab | What it answers | Key queries |
|-----|-----------------|-------------|
| **Overview** | "How's PRM volume and performance overall?" | `COUNT(DISTINCT id)`, avg duration, fulfillment %, location distribution |
| **Top 10** | "Who/what are my biggest drivers?" | Top airlines, flights, agents, routes, no-show rate |
| **Service Breakup** | "What's the mix of service types?" | 9-way service split, monthly matrix, duration per type, day-of-week pattern |
| **Fulfillment** | "Are we meeting demand?" | Requested vs provided, Agent Type → Service → Flight sankey, time-of-day, cumulative pace |

All 4 tabs share the same filter set: airport, date range, airline, service, handled_by (SELF/OUTSOURCED).

## References

- SQL schema: `database/init/02-tenant-schema.sql` + `backend/src/PrmDashboard.TenantService/Schema/Migrations/001_create_prm_services.sql`
- Entity model: `backend/src/PrmDashboard.Shared/Models/PrmServiceRecord.cs`
- Time helpers: `backend/src/PrmDashboard.Shared/Extensions/TimeHelpers.cs`
