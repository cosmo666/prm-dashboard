using DuckDB.NET.Data;

namespace PrmDashboard.ParquetBuilder.Build;

public static class ParquetConverter
{
    /// <summary>
    /// Reads <paramref name="csvPath"/> via DuckDB's <c>read_csv_auto</c> and writes
    /// a Parquet file at <paramref name="parquetPath"/>. Overwrites any existing target.
    /// After writing, re-queries both files through the same in-memory DuckDB to
    /// compare row counts and returns a <see cref="ConversionResult"/>.
    /// </summary>
    public static async Task<ConversionResult> ConvertAsync(
        string csvPath,
        string parquetPath,
        CancellationToken ct = default)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(parquetPath)!);

        // Overwrite-in-place: DuckDB's COPY errors if the target exists. Explicit delete
        // is portable across DuckDB versions.
        if (File.Exists(parquetPath)) File.Delete(parquetPath);

        // In-memory DuckDB — no database file needed, we're just using the query engine.
        await using var conn = new DuckDBConnection("DataSource=:memory:");
        await conn.OpenAsync(ct);

        // 1. Count source rows (same path DuckDB will use during the COPY).
        long csvRows;
        await using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = $"SELECT COUNT(*) FROM read_csv_auto('{EscapeSingleQuotes(csvPath)}')";
            var o = await cmd.ExecuteScalarAsync(ct);
            csvRows = Convert.ToInt64(o);
        }

        // 2. Write Parquet.
        await using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText =
                $"COPY (SELECT * FROM read_csv_auto('{EscapeSingleQuotes(csvPath)}')) " +
                $"TO '{EscapeSingleQuotes(parquetPath)}' (FORMAT 'parquet')";
            await cmd.ExecuteNonQueryAsync(ct);
        }

        // 3. Count the rows DuckDB actually wrote to the Parquet.
        long parquetRows;
        await using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = $"SELECT COUNT(*) FROM '{EscapeSingleQuotes(parquetPath)}'";
            var o = await cmd.ExecuteScalarAsync(ct);
            parquetRows = Convert.ToInt64(o);
        }

        return new ConversionResult(
            CsvPath: csvPath,
            ParquetPath: parquetPath,
            CsvRows: csvRows,
            ParquetRows: parquetRows,
            Matches: csvRows == parquetRows);
    }

    // DuckDB SQL uses single quotes for string literals. Paths rarely contain single quotes
    // on Windows, but doubling-up is the standard SQL-literal escape and costs nothing.
    private static string EscapeSingleQuotes(string path) => path.Replace("'", "''");
}
