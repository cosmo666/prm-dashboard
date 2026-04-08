---
name: rms-domain
description: RMS domain knowledge for airport ground operations. Use when implementing scheduling, task assignment, resource tracking, demand forecasting, or any ground handling workflow.
---

# RMS Domain Knowledge

## Core Entities

### Staff (Resource)
- Has: name, employee_id, role(s), qualifications/certifications, home terminal, contract type (full-time/part-time/seasonal), max hours/week
- Qualifications: ramp safety, pushback, dangerous goods, de-icing, load control, passenger handling, equipment operation
- Relationships: belongs to team(s), has availability windows, assigned to shifts and tasks, tracked by location during shift

### Shift
- Has: start_time (UTC), end_time (UTC), role_required, terminal/zone, min_staff, max_staff
- Types: morning (early), day, afternoon, night, split, on-call, standby
- Edge case: overnight shifts cross midnight (start_time > end_time in local time)
- Airport context: shifts aligned to flight wave patterns (peak arrival/departure windows)

### Task
- Has: task_type, flight_id, gate/stand, start_time, end_time, required_qualifications, required_equipment, SLA_target, priority
- Types: pushback, baggage loading/unloading, aircraft cleaning, catering, de-icing, fueling, passenger boarding, cargo handling, water/waste service
- Lifecycle: unassigned → assigned → in_progress → completed/escalated
- Linked to flight turns — when a flight delays, tasks must cascade and reassign

### Flight Turn
- Has: flight_number, arrival_time, departure_time, aircraft_type, gate/stand, airline, ground_handling_window
- The ground handling window (arrival → departure) defines the task timeline
- Turnaround time varies by aircraft type (narrow-body: 30-45 min, wide-body: 60-90 min)

### Equipment
- Has: equipment_id, type (GPU, tug, belt loader, de-icing truck, pushback tractor), status, location, assigned_terminal
- Availability: tracked like staff — has schedules, maintenance windows, breakdowns
- Some tasks require specific equipment — must co-schedule staff + equipment

### Roster
- Has: start_date, end_date, team/terminal, status (draft/published/active/archived)
- A grid mapping staff × time slots → shifts
- Must be published to become active; drafts are editable
- Planning horizon: typically 1-4 weeks ahead, adjusted daily based on flight schedule changes

### Qualification
- Has: qualification_id, name, category (safety/operational/equipment), expiry_date
- Staff must hold valid (non-expired) qualifications for assigned tasks
- Regulatory requirement — non-compliance is an audit finding

## Business Rules

### Scheduling Constraints
- No double-booking: staff cannot have overlapping shifts or tasks
- Minimum rest: configurable hours between consecutive shifts (IATA/labor law, typically 11 hours)
- Maximum hours: weekly/monthly limits per contract type and local labor regulations
- Qualification match: staff must hold all required qualifications for the assigned task
- Coverage: each shift must meet minimum staffing per role per terminal
- Equipment pairing: tasks requiring equipment must have both staff AND equipment available

### Task Assignment Algorithm
When assigning staff to a task:
1. Filter by required qualifications (valid, non-expired)
2. Check shift — staff must be on-shift during the task window
3. Check no overlapping task assignments
4. Check proximity — prefer staff already in the same terminal/zone
5. Check workload balance — distribute tasks fairly across available staff
6. Check equipment co-availability if task requires equipment
7. Return ranked candidates with conflict details

### Disruption Handling
When a flight delays or cancels:
1. Identify all tasks linked to the affected flight turn
2. Recalculate task windows based on new flight times
3. Check if currently assigned staff are still available in the new window
4. If not, trigger reassignment using the task assignment algorithm
5. Notify affected staff via mobile app
6. Log all changes with reason (disruption audit trail)

### SLA Management
- Each airline contract defines SLA targets per task type (e.g., bags on belt within 20 min of arrival)
- Track actual vs target completion times
- Flag SLA breaches in real-time for ops managers
- Generate SLA compliance reports per airline, terminal, shift

### Demand Forecasting
- Input: flight schedule (seasonal/daily), historical staffing data, special events
- Output: predicted staffing requirements per role, per terminal, per time window
- Used to generate draft rosters and identify understaffing risks ahead of time

## Timezone Handling
- Store all times in UTC
- Each airport has a configured timezone (display times in airport local)
- DST transitions: shift times must adjust correctly
- Multi-airport operations: if supporting multiple airports, each has its own timezone config
- Flight times come from external systems in various formats — normalize to UTC on ingest

## Common Patterns

### Shift Patterns
- Fixed: same shifts every week (admin/office staff)
- Rotating: cycle through shift types aligned to flight waves
- Flexible: staff bid for preferred shifts, system assigns based on seniority/fairness
- On-call/standby: activated when disruptions create staffing gaps

### Reporting
- OTP impact analysis: how staffing levels correlate with on-time departures
- SLA compliance dashboards per airline contract
- Staff utilization rates (actual hours worked vs scheduled)
- Qualification expiry forecasts (who needs recertification soon)
- Cost analysis: overtime, standby activations, contractor usage
