namespace PrmDashboard.ParquetBuilder.Build;

/// <summary>
/// Pure helpers that locate CSV files under a root and compute their Parquet siblings.
/// Throws on missing directory or non-CSV input — callers should validate upstream.
/// </summary>
public static class FileDiscovery
{
    /// <summary>
    /// Returns all <c>*.csv</c> files under <paramref name="root"/>, recursively.
    /// Case-insensitive match on the extension. Returns absolute or relative paths
    /// depending on what <paramref name="root"/> was.
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
