# PrmDashboard.CsvExporter

Phase 1 migration tool (see `docs/superpowers/specs/2026-04-20-mysql-to-duckdb-migration-design.md`).

Dumps the entire MySQL contents — master tables plus each active tenant's `prm_services` — into a `data/` folder of deterministic RFC 4180 CSV files. MySQL is read-only from the tool's perspective; this is safe to run against production data.

## Usage

Start MySQL (or point at an existing instance), then run from the repo root:

```bash
dotnet run --project backend/tools/PrmDashboard.CsvExporter -- --out ./data
```

Show all options with `--help` / `-h`.

Resolution order for the master connection string:

1. `--master "Server=...;Port=...;Database=prm_master;User=...;Password=..."`
2. `MASTER_CONNECTION_STRING` env var
3. `appsettings.json` — `ConnectionStrings:MasterDb`

### Running outside the docker network

When the tool runs from the host (not inside the docker compose network), the `db_host` column stored in `tenants` will be the docker-internal hostname (`mysql`) which won't resolve from the host. Pass `--tenant-host <hostname>` to override the host used for per-tenant connection strings:

```bash
dotnet run --project backend/tools/PrmDashboard.CsvExporter -- \
  --master "Server=localhost;Port=3306;Database=prm_master;User=root;Password=rootpassword" \
  --tenant-host localhost \
  --out ./data
```

Port, database, user, and password still come from the master DB — only `db_host` is overridden. When running inside the docker network (e.g., via `docker compose run`), omit the flag.

## Output layout

One directory per active tenant slug (from `tenants WHERE is_active = 1` in the master DB), plus a `master/` directory. The POC seed creates three tenants; your environment may differ:

```text
data/
├── master/
│   ├── tenants.csv
│   ├── employees.csv
│   └── employee_airports.csv
├── aeroground/
│   └── prm_services.csv
├── skyserve/
│   └── prm_services.csv
└── globalprm/
    └── prm_services.csv
```

## CSV format guarantees

- UTF-8 encoding, **no BOM**
- Unix line endings (**LF**, not CRLF)
- RFC 4180 quoting: fields containing `,`, `"`, `\n`, or `\r` are quoted; embedded quotes are doubled
- `NULL` → empty cell (not the literal word `null`)
- Booleans → `true` / `false` (lowercase)
- `DateOnly` → `yyyy-MM-dd`
- `DateTime` → `yyyy-MM-ddTHH:mm:ssZ` (UTC, ISO-8601)
- HHMM integer columns (`start_time`, `paused_at`, `end_time`) stay as integers — no zero-padding
- Numeric types formatted with invariant culture (`.` as decimal separator, no thousands separators)

## Verification

The tool re-queries `SELECT COUNT(*) FROM ({selectSql}) AS sub` for every table it dumps and prints a summary:

```text
Table                          Rows   Source  Status    Path
master.tenants                    3        3  OK        /abs/data/master/tenants.csv
master.employees                 12       12  OK        /abs/data/master/employees.csv
...
aeroground.prm_services        4821     4821  OK        /abs/data/aeroground/prm_services.csv
```

Exit codes:

- `0` — all row counts match source
- `1` — one or more tables had a row-count mismatch
- `2` — master connection string not provided (no `--master`, no `MASTER_CONNECTION_STRING`, no `appsettings.json`)

## What is **not** exported

Per the phase 1 spec (lines 40–49 of the design doc):

- `refresh_tokens` — obsolete; AuthService moves to in-memory store in phase 3
- `schema_migrations` tracker rows — no migration framework in the new model

## Sensitivity

`data/master/tenants.csv` contains the raw `db_host`, `db_port`, `db_name`, `db_user`, and `db_password` columns from the master DB — the full connection credentials for every active tenant DB. Treat the entire `data/` directory with the same sensitivity as the master MySQL itself:

- Do not commit it (already gitignored — see `.gitignore`).
- Do not share or upload it to external tools without redacting credentials.
- The console output redacts `Password=****` in its banner; the CSV does not.

Phase 3 of the migration drops these columns from the runtime model — at that point tenant resolution becomes purely slug→folder mapping and credentials no longer live anywhere in `data/`.

## Safe to re-run

Yes. All CSVs are overwritten in place. The tool opens MySQL read-only (no writes).
