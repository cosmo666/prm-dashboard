"""
Generate realistic PRM service seed data for 3 tenant databases.
Output: SQL INSERT statements to stdout.

Usage:
    python database/seed/generate_prm_data.py > database/init/05-seed-prm-data.sql
"""

import random
from datetime import date, timedelta

random.seed(42)  # Reproducible output

# --- Configuration ---

TENANTS = [
    {"db": "aeroground_db", "airports": ["BLR", "HYD", "DEL"]},
    {"db": "skyserve_db",   "airports": ["BLR", "BOM", "MAA"]},
    {"db": "globalprm_db",  "airports": ["SYD", "KUL", "JFK"]},
]

DATE_START = date(2025, 12, 1)
DATE_END   = date(2026, 3, 31)
DAILY_MIN, DAILY_MAX = 10, 18  # per airport per day

# Weighted distributions
AIRLINES = [
    ("IX", 35), ("AI", 15), ("EK", 8), ("QF", 7), ("SQ", 7),
    ("EY", 6), ("CX", 5), ("SV", 5), ("MH", 4), ("TG", 4),
    ("BA", 2), ("LH", 2),
]

SERVICES = [
    ("WCHR", 53), ("WCHC", 12), ("MAAS", 10), ("WCHS", 8),
    ("DPNA", 5), ("UMNR", 4), ("BLND", 3), ("MEDA", 3), ("WCMP", 2),
]

LOCATIONS = [
    ("Aircraft Point", 42), ("AircraftGate-A", 28), ("Boarding Gate", 15),
    ("Checkin Counter", 8), ("Belt Area", 5), ("Aircraft Door", 2),
]

# Time-of-day hour weights (index = hour bucket start)
HOUR_WEIGHTS = {
    (0, 4):   15,
    (4, 8):   15,
    (8, 12):  30,
    (12, 17): 20,
    (17, 22): 20,
}

FIRST_NAMES = [
    "Aarav", "Aditi", "Aisha", "Arjun", "Carlos", "Chen", "Devi", "Elena",
    "Fatima", "George", "Hana", "Ibrahim", "James", "Kaori", "Lakshmi",
    "Maria", "Nadia", "Omar", "Priya", "Raj", "Sato", "Tara", "Uma",
    "Viktor", "Wei", "Yuki", "Zara", "Ahmed", "Bianca", "David",
]

LAST_NAMES = [
    "Kumar", "Singh", "Patel", "Sharma", "Williams", "Johnson", "Lee",
    "Chen", "Ali", "Garcia", "Mueller", "Tanaka", "Kim", "Nguyen",
    "Santos", "Brown", "Wilson", "Anderson", "Taylor", "Thomas",
]

AGENT_NAMES = [
    "Agent A1", "Agent A2", "Agent A3", "Agent B1", "Agent B2",
    "Agent C1", "Agent C2", "Agent D1",
]

AGENT_NOS = ["AG001", "AG002", "AG003", "AG004", "AG005", "AG006", "AG007", "AG008"]


def weighted_choice(items):
    """Pick from list of (value, weight) tuples."""
    values, weights = zip(*items)
    return random.choices(values, weights=weights, k=1)[0]


def random_hour():
    """Return a random hour based on time-of-day weights."""
    buckets = list(HOUR_WEIGHTS.keys())
    weights = [HOUR_WEIGHTS[b] for b in buckets]
    lo, hi = random.choices(buckets, weights=weights, k=1)[0]
    return random.randint(lo, hi - 1)


def make_hhmm(hour, minute):
    """Encode hour+minute as HHMM integer."""
    return hour * 100 + minute


def escape(s):
    """Escape single quotes for SQL."""
    return s.replace("'", "''")


def generate_tenant(tenant, id_counter):
    """Generate INSERT statements for one tenant DB."""
    rows = []
    db = tenant["db"]
    airports = tenant["airports"]

    d = DATE_START
    while d <= DATE_END:
        for airport in airports:
            daily_count = random.randint(DAILY_MIN, DAILY_MAX)
            for _ in range(daily_count):
                sid = id_counter
                id_counter += 1

                airline = weighted_choice(AIRLINES)
                flight_num = random.randint(100, 9999)
                flight = f"{airline}{flight_num}"
                service = weighted_choice(SERVICES)
                location = weighted_choice(LOCATIONS)
                pax = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
                agent_idx = random.randint(0, len(AGENT_NAMES) - 1)
                agent_name = AGENT_NAMES[agent_idx]
                agent_no = AGENT_NOS[agent_idx]
                seat = f"{random.randint(1, 42)}{random.choice('ABCDEF')}"
                agent_type = "OUTSOURCED" if random.random() < 0.005 else "SELF"
                no_show = "'N'" if random.random() < 0.04 else "NULL"
                requested = 1 if random.random() < 0.02 else 0
                is_paused = random.random() < 0.12

                start_h = random_hour()
                start_m = random.randint(0, 59)
                duration = random.randint(15, 90)

                if is_paused:
                    # Split into two segments
                    seg1 = random.randint(5, duration - 5)
                    seg2 = duration - seg1
                    pause_m = start_m + seg1
                    pause_h = start_h + pause_m // 60
                    pause_m = pause_m % 60

                    # Row 1: start -> paused
                    end1_m = pause_m
                    end1_h = pause_h
                    rows.append(_row(
                        sid, flight, flight_num, agent_name, agent_no, pax,
                        agent_type, make_hhmm(start_h, start_m),
                        make_hhmm(pause_h, pause_m),
                        make_hhmm(end1_h, end1_m),
                        service, seat, location, no_show, airport, airline,
                        requested, d,
                    ))

                    # Row 2: resumed -> end
                    gap = random.randint(5, 30)
                    resume_m = pause_m + gap
                    resume_h = pause_h + resume_m // 60
                    resume_m = resume_m % 60
                    end_m = resume_m + seg2
                    end_h = resume_h + end_m // 60
                    end_m = end_m % 60

                    # Cap at 23:59
                    if end_h > 23:
                        end_h, end_m = 23, 59
                    if resume_h > 23:
                        resume_h, resume_m = 23, 59

                    rows.append(_row(
                        sid, flight, flight_num, agent_name, agent_no, pax,
                        agent_type, make_hhmm(resume_h, resume_m),
                        None,
                        make_hhmm(end_h, end_m),
                        service, seat, location, no_show, airport, airline,
                        requested, d,
                    ))
                else:
                    end_m = start_m + duration
                    end_h = start_h + end_m // 60
                    end_m = end_m % 60
                    if end_h > 23:
                        end_h, end_m = 23, 59

                    rows.append(_row(
                        sid, flight, flight_num, agent_name, agent_no, pax,
                        agent_type, make_hhmm(start_h, start_m),
                        None,
                        make_hhmm(end_h, end_m),
                        service, seat, location, no_show, airport, airline,
                        requested, d,
                    ))

        d += timedelta(days=1)

    return db, rows, id_counter


def _row(sid, flight, flight_num, agent_name, agent_no, pax, agent_type,
         start_time, paused_at, end_time, service, seat, location, no_show,
         airport, airline, requested, service_date):
    pa = str(paused_at) if paused_at is not None else "NULL"
    return (
        f"({sid},'{escape(flight)}',{flight_num},'{escape(agent_name)}',"
        f"'{escape(agent_no)}','{escape(pax)}','{agent_type}',"
        f"{start_time},{pa},{end_time},'{service}','{seat}',NULL,NULL,NULL,"
        f"'{location}',{no_show},'{airport}',NULL,'{airline}','Employee',NULL,"
        f"{requested},'{service_date.isoformat()}')"
    )


def main():
    print("-- Generated PRM seed data")
    print("-- Do not edit manually. Regenerate with: python database/seed/generate_prm_data.py")
    print()

    id_counter = 1
    total_rows = 0

    for tenant in TENANTS:
        db, rows, id_counter = generate_tenant(tenant, id_counter)
        total_rows += len(rows)

        print(f"USE {db};")
        print()

        # Batch inserts (500 rows per statement for MySQL)
        cols = (
            "id, flight, flight_number, agent_name, agent_no, passenger_name, "
            "prm_agent_type, start_time, paused_at, end_time, service, seat_number, "
            "scanned_by, scanned_by_user, remarks, pos_location, no_show_flag, "
            "loc_name, arrival, airline, emp_type, departure, requested, service_date"
        )
        batch_size = 500
        for i in range(0, len(rows), batch_size):
            batch = rows[i:i + batch_size]
            print(f"INSERT INTO prm_services ({cols}) VALUES")
            print(",\n".join(batch) + ";")
            print()

        print(f"-- {db}: {len(rows)} rows")
        print()

    print(f"-- Total rows: {total_rows}")


if __name__ == "__main__":
    main()
