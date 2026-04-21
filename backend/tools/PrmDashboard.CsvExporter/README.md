# PrmDashboard.CsvExporter

Phase 1 migration tool (see `docs/superpowers/specs/2026-04-20-mysql-to-duckdb-migration-design.md`).

Dumps the entire MySQL contents — master tables plus each active tenant's `prm_services` — into a `data/` folder of deterministic RFC 4180 CSV files. MySQL is read-only from the tool's perspective; this is safe to run against production data.

## Usage

Start MySQL (or point at an existing instance), then:

```bash
# From repo root
cd backend
dotnet run --project tools/PrmDashboard.CsvExporter -- --out ../data
```

Resolution order for the master connection string:

1. `--master "Server=...;Port=...;Database=prm_master;User=...;Password=..."`
2. `MASTER_CONNECTION_STRING` env var
3. `appsettings.json` — `ConnectionStrings:MasterDb`

## Output layout

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

Exits non-zero if any row-count mismatches; success on all-OK.

## What is **not** exported

Per the phase 1 spec (lines 40–49 of the design doc):

- `refresh_tokens` — obsolete; AuthService moves to in-memory store in phase 3
- `schema_migrations` tracker rows — no migration framework in the new model

## Safe to re-run

Yes. All CSVs are overwritten in place. The tool opens MySQL read-only (no writes).
