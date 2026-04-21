# PrmDashboard.ParquetBuilder

Phase 2 migration tool (see `docs/superpowers/specs/2026-04-20-mysql-to-duckdb-migration-design.md`).

Walks a `data/` folder produced by `PrmDashboard.CsvExporter` (phase 1) and converts every `*.csv` into a sibling `*.parquet` using embedded DuckDB. Source CSVs are untouched.

## Usage

From the repo root, after phase 1 has populated `data/`:

```bash
dotnet run --project backend/tools/PrmDashboard.ParquetBuilder -- --dir ./data
```

Show all options with `--help` / `-h`.

## Output layout

Each CSV produces a Parquet file in the same directory. The directory tree under `data/` is otherwise preserved:

```text
data/
├── master/
│   ├── tenants.csv + tenants.parquet
│   ├── employees.csv + employees.parquet
│   └── employee_airports.csv + employee_airports.parquet
├── aeroground/
│   └── prm_services.csv + prm_services.parquet
├── skyserve/
│   └── prm_services.csv + prm_services.parquet
└── globalprm/
    └── prm_services.csv + prm_services.parquet
```

## How it works

For each CSV the tool runs (via embedded DuckDB — no external binary required):

```sql
COPY (SELECT * FROM read_csv_auto('file.csv')) TO 'file.parquet' (FORMAT 'parquet')
```

DuckDB infers column types from the CSV header + sampled rows. The phase-1 exporter's deterministic formatting (ISO-8601 dates, invariant-culture numerics, `true`/`false` booleans, empty-cell-for-null) is designed so inference lands on the expected types: `INTEGER`, `DATE`, `TIMESTAMP`, `BOOLEAN`, `VARCHAR`.

Compression: DuckDB default (`SNAPPY`). Row group size: DuckDB default (122,880 rows). No CLI flags to tune either — this is a migration tool with tight scope.

## Verification

Every conversion is self-checked:

1. `SELECT COUNT(*) FROM read_csv_auto('file.csv')` — source row count
2. Write the Parquet via `COPY`
3. `SELECT COUNT(*) FROM 'file.parquet'` — round-trip row count
4. Summary row: `OK` iff the two counts match

At end of run:

```text
=== Summary ===
File                                                         CSV rows  Parquet rows  Status
master\tenants.parquet                                              3             3  OK
master\employees.parquet                                           12            12  OK
aeroground\prm_services.parquet                                  6660          6660  OK
...

SUCCESS: all row counts match source.
```

Exit codes:

- `0` — all row counts match source
- `1` — one or more files had a row-count mismatch
- `2` — `--dir` missing, directory not found, or no `.csv` files found under it

## Safe to re-run

Yes. Existing `*.parquet` files are deleted before each conversion, then rewritten. Source CSVs are never modified. Press `Ctrl-C` during a run to request graceful cancellation (the current file finishes; remaining files are skipped). A second `Ctrl-C` force-quits.

## What the tool does NOT do

- Does not modify source CSVs. The CSV set remains the human-readable source of truth; Parquet is the query format.
- Does not clean up stale Parquet files whose source CSV has been removed. If you delete a tenant mid-migration, you'll need to remove its `data/{slug}/` directory yourself — phase 4 of the overall migration guides that cleanup.
