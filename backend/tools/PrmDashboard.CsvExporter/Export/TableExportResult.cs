namespace PrmDashboard.CsvExporter.Export;

/// <summary>
/// Outcome of exporting one SELECT to one CSV file.
/// <paramref name="Matches"/> is <c>true</c> iff <paramref name="RowsWritten"/> == <paramref name="SourceCount"/>.
/// </summary>
public sealed record TableExportResult(
    string Label,
    string OutputPath,
    int RowsWritten,
    int SourceCount,
    bool Matches);
