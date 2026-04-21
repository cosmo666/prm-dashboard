using System.IO;
using System.Linq;
using PrmDashboard.ParquetBuilder.Build;
using Xunit;

namespace PrmDashboard.Tests.ParquetBuilder;

public class FileDiscoveryTests
{
    [Fact]
    public void CsvToParquetPath_ReplacesExtension()
    {
        Assert.Equal(
            Path.Combine("data", "master", "tenants.parquet"),
            FileDiscovery.CsvToParquetPath(Path.Combine("data", "master", "tenants.csv")));
    }

    [Fact]
    public void CsvToParquetPath_PreservesSubdirectories()
    {
        Assert.Equal(
            Path.Combine("a", "b", "c", "prm_services.parquet"),
            FileDiscovery.CsvToParquetPath(Path.Combine("a", "b", "c", "prm_services.csv")));
    }

    [Fact]
    public void CsvToParquetPath_UppercaseExtension_NormalizesToLowercaseParquet()
    {
        // Filesystem may be case-insensitive on Windows; we still want the output extension
        // to be ".parquet" deterministically.
        Assert.Equal(
            Path.Combine("data", "tenants.parquet"),
            FileDiscovery.CsvToParquetPath(Path.Combine("data", "tenants.CSV")));
    }

    [Fact]
    public void CsvToParquetPath_NotACsv_Throws()
    {
        Assert.Throws<ArgumentException>(() =>
            FileDiscovery.CsvToParquetPath(Path.Combine("data", "tenants.txt")));
    }

    [Fact]
    public void FindCsvFiles_EmptyDirectory_ReturnsEmpty()
    {
        using var tmp = new TempDir();
        Assert.Empty(FileDiscovery.FindCsvFiles(tmp.Path));
    }

    [Fact]
    public void FindCsvFiles_FlatDirectory_FindsTopLevelCsvs()
    {
        using var tmp = new TempDir();
        File.WriteAllText(Path.Combine(tmp.Path, "a.csv"), "");
        File.WriteAllText(Path.Combine(tmp.Path, "b.csv"), "");
        File.WriteAllText(Path.Combine(tmp.Path, "c.txt"), "");

        var found = FileDiscovery.FindCsvFiles(tmp.Path).OrderBy(f => f).ToList();

        Assert.Equal(2, found.Count);
        Assert.EndsWith("a.csv", found[0]);
        Assert.EndsWith("b.csv", found[1]);
    }

    [Fact]
    public void FindCsvFiles_NestedDirectories_Recurses()
    {
        using var tmp = new TempDir();
        var masterDir = Path.Combine(tmp.Path, "master");
        var tenantDir = Path.Combine(tmp.Path, "aeroground");
        Directory.CreateDirectory(masterDir);
        Directory.CreateDirectory(tenantDir);
        File.WriteAllText(Path.Combine(masterDir, "tenants.csv"), "");
        File.WriteAllText(Path.Combine(tenantDir, "prm_services.csv"), "");

        var found = FileDiscovery.FindCsvFiles(tmp.Path).OrderBy(f => f).ToList();

        Assert.Equal(2, found.Count);
    }

    [Fact]
    public void FindCsvFiles_MissingDirectory_Throws()
    {
        Assert.Throws<DirectoryNotFoundException>(() =>
            FileDiscovery.FindCsvFiles(Path.Combine(Path.GetTempPath(), $"nonexistent-{System.Guid.NewGuid():N}")).ToList());
    }

    private sealed class TempDir : IDisposable
    {
        public string Path { get; }
        public TempDir()
        {
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"pb-test-{System.Guid.NewGuid():N}");
            Directory.CreateDirectory(Path);
        }
        public void Dispose()
        {
            try { Directory.Delete(Path, recursive: true); } catch { /* best-effort cleanup */ }
        }
    }
}
