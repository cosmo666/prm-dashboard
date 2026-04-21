namespace PrmDashboard.ParquetBuilder.Build;

/// <summary>
/// Outcome of converting one CSV to one Parquet.
/// <paramref name="Matches"/> is <c>true</c> iff <paramref name="CsvRows"/> == <paramref name="ParquetRows"/>.
/// </summary>
public sealed record ConversionResult(
    string CsvPath,
    string ParquetPath,
    long CsvRows,
    long ParquetRows,
    bool Matches);
