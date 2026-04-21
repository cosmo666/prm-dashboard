namespace PrmDashboard.ParquetBuilder.Build;

/// <summary>
/// Pure helpers that locate CSV files under a root and compute their Parquet siblings.
/// Throws on missing directory or non-CSV input — callers should validate upstream.
/// </summary>
public static class FileDiscovery
{
    /// <summary>
    /// Returns all <c>*.csv</c> files under <paramref name="root"/>, recursively.
    /// Extension matching follows the filesystem (case-insensitive on Windows/NTFS;
    /// case-sensitive on typical Linux filesystems — the phase-1 exporter always
    /// writes lowercase, so the distinction rarely matters in practice).
    /// Enumeration is lazy; exceptions surface on iteration.
    /// </summary>
    public static IEnumerable<string> FindCsvFiles(string root) =>
        Directory.EnumerateFiles(root, "*.csv", SearchOption.AllDirectories);

    /// <summary>
    /// Replaces the <c>.csv</c> extension with <c>.parquet</c>. Throws if the input
    /// does not end with <c>.csv</c> (case-insensitive).
    /// </summary>
    public static string CsvToParquetPath(string csvPath)
    {
        var ext = Path.GetExtension(csvPath);
        if (!string.Equals(ext, ".csv", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException($"Expected a .csv path, got: {csvPath}", nameof(csvPath));

        var dir = Path.GetDirectoryName(csvPath) ?? "";
        var stem = Path.GetFileNameWithoutExtension(csvPath);
        return Path.Combine(dir, stem + ".parquet");
    }
}
