using System.Text;
using MySqlConnector;
using PrmDashboard.CsvExporter.Csv;

namespace PrmDashboard.CsvExporter.Export;

public static class TableExporter
{
    private static readonly UTF8Encoding Utf8NoBom = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);

    /// <summary>
    /// Streams <paramref name="selectSql"/> from MySQL to a CSV at <paramref name="outputPath"/>.
    /// Creates parent directories. Overwrites existing file. Returns row-count verification result.
    /// </summary>
    public static async Task<TableExportResult> ExportAsync(
        string connectionString,
        string label,
        string selectSql,
        string outputPath,
        CancellationToken ct = default)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);

        await using var conn = new MySqlConnection(connectionString);
        await conn.OpenAsync(ct);

        // 1. Source row count — wrap user SQL so the same filters apply.
        long sourceCount;
        await using (var countCmd = conn.CreateCommand())
        {
            countCmd.CommandText = $"SELECT COUNT(*) FROM ({selectSql}) AS sub";
            var o = await countCmd.ExecuteScalarAsync(ct);
            sourceCount = Convert.ToInt64(o);
        }

        // 2. Stream SELECT into CSV
        long rowsWritten = 0;
        await using (var selectCmd = conn.CreateCommand())
        {
            selectCmd.CommandText = selectSql;
            await using var reader = await selectCmd.ExecuteReaderAsync(ct);

            await using var stream = new FileStream(outputPath, FileMode.Create, FileAccess.Write, FileShare.Read);
            await using var writer = new StreamWriter(stream, Utf8NoBom) { NewLine = "\n" };

            // Header row
            var header = new object?[reader.FieldCount];
            for (int i = 0; i < reader.FieldCount; i++) header[i] = reader.GetName(i);
            CsvFormatter.WriteRow(writer, header);

            // Data rows
            var buf = new object?[reader.FieldCount];
            while (await reader.ReadAsync(ct))
            {
                for (int i = 0; i < reader.FieldCount; i++)
                    buf[i] = reader.IsDBNull(i) ? null : reader.GetValue(i);

                CsvFormatter.WriteRow(writer, buf);
                rowsWritten++;
            }
        }

        return new TableExportResult(
            Label: label,
            OutputPath: outputPath,
            RowsWritten: rowsWritten,
            SourceCount: sourceCount,
            Matches: rowsWritten == sourceCount);
    }
}
