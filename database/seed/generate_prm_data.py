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

# --- Per-airport volume profiles (daily min/max services) ---
AIRPORT_VOLUME = {
    "BLR": (14, 22),  # large hub
    "DEL": (16, 24),  # busiest Indian airport
    "HYD": (8, 14),   # mid-size
    "BOM": (15, 23),  # large hub
    "MAA": (7, 12),   # smaller
    "SYD": (12, 20),  # large international
    "KUL": (9, 15),   # medium international
    "JFK": (18, 28),  # massive hub
}

# --- Per-tenant airline mixes (reflects real carrier presence) ---
AIRLINES_BY_TENANT = {
    "aeroground_db": [
        ("IX", 30), ("AI", 20), ("6E", 15), ("UK", 10), ("EK", 8),
        ("SQ", 5), ("QR", 4), ("LH", 3), ("BA", 3), ("TG", 2),
    ],
    "skyserve_db": [
        ("AI", 25), ("IX", 18), ("6E", 12), ("EK", 10), ("QR", 8),
        ("SQ", 7), ("MH", 6), ("CX", 5), ("SV", 5), ("BA", 4),
    ],
    "globalprm_db": [
        ("QF", 22), ("SQ", 15), ("EK", 12), ("AA", 10), ("BA", 8),
        ("CX", 7), ("MH", 6), ("DL", 5), ("UA", 5), ("JL", 5), ("LH", 5),
    ],
}

# --- Per-airport service type profiles ---
SERVICES_BY_AIRPORT = {
    "BLR": [("WCHR", 50), ("WCHC", 14), ("MAAS", 12), ("WCHS", 8), ("DPNA", 5), ("UMNR", 4), ("BLND", 3), ("MEDA", 2), ("WCMP", 2)],
    "DEL": [("WCHR", 55), ("WCHC", 10), ("MAAS", 8), ("WCHS", 10), ("DPNA", 6), ("UMNR", 3), ("BLND", 4), ("MEDA", 2), ("WCMP", 2)],
    "HYD": [("WCHR", 60), ("WCHC", 8), ("MAAS", 10), ("WCHS", 7), ("DPNA", 5), ("UMNR", 4), ("BLND", 2), ("MEDA", 3), ("WCMP", 1)],
    "BOM": [("WCHR", 48), ("WCHC", 15), ("MAAS", 10), ("WCHS", 9), ("DPNA", 6), ("UMNR", 5), ("BLND", 3), ("MEDA", 2), ("WCMP", 2)],
    "MAA": [("WCHR", 58), ("WCHC", 10), ("MAAS", 12), ("WCHS", 6), ("DPNA", 4), ("UMNR", 4), ("BLND", 2), ("MEDA", 3), ("WCMP", 1)],
    "SYD": [("WCHR", 40), ("WCHC", 18), ("MAAS", 15), ("WCHS", 8), ("DPNA", 5), ("UMNR", 6), ("BLND", 3), ("MEDA", 3), ("WCMP", 2)],
    "KUL": [("WCHR", 45), ("WCHC", 12), ("MAAS", 14), ("WCHS", 10), ("DPNA", 6), ("UMNR", 5), ("BLND", 3), ("MEDA", 3), ("WCMP", 2)],
    "JFK": [("WCHR", 35), ("WCHC", 20), ("MAAS", 15), ("WCHS", 10), ("DPNA", 5), ("UMNR", 7), ("BLND", 3), ("MEDA", 3), ("WCMP", 2)],
}

LOCATIONS = [
    ("Aircraft Point", 42), ("AircraftGate-A", 28), ("Boarding Gate", 15),
    ("Checkin Counter", 8), ("Belt Area", 5), ("Aircraft Door", 2),
]

# --- Per-airport time-of-day profiles ---
HOUR_WEIGHTS_BY_AIRPORT = {
    "BLR": {(0, 4): 10, (4, 8): 20, (8, 12): 30, (12, 17): 20, (17, 22): 20},
    "DEL": {(0, 4): 12, (4, 8): 25, (8, 12): 25, (12, 17): 18, (17, 22): 20},
    "HYD": {(0, 4): 8, (4, 8): 15, (8, 12): 35, (12, 17): 22, (17, 22): 20},
    "BOM": {(0, 4): 15, (4, 8): 18, (8, 12): 25, (12, 17): 22, (17, 22): 20},
    "MAA": {(0, 4): 5, (4, 8): 15, (8, 12): 35, (12, 17): 25, (17, 22): 20},
    "SYD": {(0, 4): 5, (4, 8): 10, (8, 12): 30, (12, 17): 30, (17, 22): 25},
    "KUL": {(0, 4): 8, (4, 8): 12, (8, 12): 28, (12, 17): 28, (17, 22): 24},
    "JFK": {(0, 4): 12, (4, 8): 15, (8, 12): 22, (12, 17): 25, (17, 22): 26},
}

# --- Per-tenant outsourced ratio and no-show rate ---
OUTSOURCE_RATE = {"aeroground_db": 0.15, "skyserve_db": 0.25, "globalprm_db": 0.08}
NO_SHOW_RATE = {"aeroground_db": 0.04, "skyserve_db": 0.06, "globalprm_db": 0.03}
PAUSE_RATE = {"aeroground_db": 0.12, "skyserve_db": 0.08, "globalprm_db": 0.15}
REQUESTED_RATE = {"aeroground_db": 0.02, "skyserve_db": 0.05, "globalprm_db": 0.10}

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

ROUTES = {
    "BLR": [("DEL", 20), ("BOM", 18), ("MAA", 12), ("HYD", 10), ("CCU", 8), ("GOI", 6), ("DXB", 5), ("SIN", 5), ("LHR", 4), ("DOH", 3), ("KUL", 3), ("BKK", 3), ("SYD", 3)],
    "HYD": [("DEL", 20), ("BOM", 18), ("BLR", 14), ("MAA", 10), ("CCU", 8), ("GOI", 5), ("DXB", 5), ("SIN", 5), ("LHR", 4), ("DOH", 3), ("KUL", 3), ("BKK", 2)],
    "DEL": [("BOM", 20), ("BLR", 16), ("HYD", 12), ("MAA", 10), ("CCU", 8), ("GOI", 6), ("DXB", 5), ("LHR", 5), ("SIN", 4), ("DOH", 4), ("JFK", 3), ("SFO", 3)],
    "BOM": [("DEL", 20), ("BLR", 16), ("HYD", 12), ("MAA", 10), ("GOI", 8), ("CCU", 6), ("DXB", 5), ("LHR", 5), ("SIN", 4), ("DOH", 3), ("JFK", 3)],
    "MAA": [("DEL", 18), ("BOM", 16), ("BLR", 14), ("HYD", 10), ("CCU", 8), ("SIN", 6), ("DXB", 5), ("KUL", 5), ("LHR", 4), ("DOH", 3), ("SYD", 3)],
    "SYD": [("MEL", 20), ("BNE", 15), ("PER", 10), ("SIN", 8), ("HKG", 6), ("LAX", 5), ("DXB", 5), ("AKL", 5), ("NRT", 4), ("DEL", 3), ("BOM", 3)],
    "KUL": [("SIN", 20), ("BKK", 15), ("JKT", 12), ("HKG", 8), ("DEL", 6), ("BOM", 5), ("SYD", 5), ("NRT", 4), ("DOH", 4), ("LHR", 3), ("DXB", 3)],
    "JFK": [("LAX", 18), ("SFO", 14), ("ORD", 12), ("LHR", 10), ("DXB", 6), ("CDG", 5), ("DEL", 5), ("BOM", 4), ("SIN", 4), ("NRT", 3), ("HKG", 3)],
}

AGENT_NAMES = [
    "Agent A1", "Agent A2", "Agent A3", "Agent B1", "Agent B2",
    "Agent C1", "Agent C2", "Agent D1",
]

AGENT_NOS = ["AG001", "AG002", "AG003", "AG004", "AG005", "AG006", "AG007", "AG008"]


def weighted_choice(items):
    """Pick from list of (value, weight) tuples."""
    values, weights = zip(*items)
    return random.choices(values, weights=weights, k=1)[0]


def random_hour(airport):
    """Return a random hour based on airport-specific time-of-day weights."""
    hw = HOUR_WEIGHTS_BY_AIRPORT.get(airport, HOUR_WEIGHTS_BY_AIRPORT["BLR"])
    buckets = list(hw.keys())
    weights = [hw[b] for b in buckets]
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

    airlines = AIRLINES_BY_TENANT.get(db, AIRLINES_BY_TENANT["aeroground_db"])
    outsource_rate = OUTSOURCE_RATE.get(db, 0.15)
    no_show_rate = NO_SHOW_RATE.get(db, 0.04)
    pause_rate = PAUSE_RATE.get(db, 0.12)
    requested_rate = REQUESTED_RATE.get(db, 0.02)

    d = DATE_START
    while d <= DATE_END:
        for airport in airports:
            vol_min, vol_max = AIRPORT_VOLUME.get(airport, (10, 18))
            daily_count = random.randint(vol_min, vol_max)
            services = SERVICES_BY_AIRPORT.get(airport, SERVICES_BY_AIRPORT["BLR"])
            for _ in range(daily_count):
                sid = id_counter
                id_counter += 1

                airline = weighted_choice(airlines)
                flight_num = random.randint(100, 9999)
                flight = f"{airline}{flight_num}"
                service = weighted_choice(services)
                location = weighted_choice(LOCATIONS)
                pax = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
                agent_idx = random.randint(0, len(AGENT_NAMES) - 1)
                agent_name = AGENT_NAMES[agent_idx]
                agent_no = AGENT_NOS[agent_idx]
                seat = f"{random.randint(1, 42)}{random.choice('ABCDEF')}"
                agent_type = "OUTSOURCED" if random.random() < outsource_rate else "SELF"
                no_show = "'N'" if random.random() < no_show_rate else "NULL"
                requested = 1 if random.random() < requested_rate else 0
                is_paused = random.random() < pause_rate

                start_h = random_hour(airport)
                start_m = random.randint(0, 59)
                duration = random.randint(15, 90)

                # Pick a route (departure = local airport, arrival = destination)
                route_options = ROUTES.get(airport, [("UNK", 1)])
                arrival = weighted_choice(route_options)
                departure = airport

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
                        requested, d, departure, arrival,
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
                        requested, d, departure, arrival,
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
                        requested, d, departure, arrival,
                    ))

        d += timedelta(days=1)

    return db, rows, id_counter


def _row(sid, flight, flight_num, agent_name, agent_no, pax, agent_type,
         start_time, paused_at, end_time, service, seat, location, no_show,
         airport, airline, requested, service_date, departure, arrival):
    pa = str(paused_at) if paused_at is not None else "NULL"
    return (
        f"({sid},'{escape(flight)}',{flight_num},'{escape(agent_name)}',"
        f"'{escape(agent_no)}','{escape(pax)}','{agent_type}',"
        f"{start_time},{pa},{end_time},'{service}','{seat}',NULL,NULL,NULL,"
        f"'{location}',{no_show},'{airport}','{arrival}','{airline}','Employee','{departure}',"
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
