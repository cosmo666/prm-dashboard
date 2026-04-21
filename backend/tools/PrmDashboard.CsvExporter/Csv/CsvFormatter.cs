using System.Globalization;
using System.IO;

namespace PrmDashboard.CsvExporter.Csv;

/// <summary>
/// Deterministic RFC 4180 CSV field/row formatting per phase 1 spec:
/// UTF-8 (no BOM decided at writer level), LF line endings, null -> empty,
/// bool -> "true"/"false", DateOnly -> "yyyy-MM-dd", DateTime -> ISO-8601 UTC,
/// numeric types emitted via invariant culture.
/// </summary>
public static class CsvFormatter
{
    public static string FormatField(object? value)
    {
        if (value is null || value is DBNull) return "";

        string s = value switch
        {
            bool b        => b ? "true" : "false",
            DateOnly d    => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            DateTime dt   => DateTime.SpecifyKind(dt, DateTimeKind.Utc)
                                .ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture),
            IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
            _             => value.ToString() ?? ""
        };

        return NeedsQuoting(s) ? Quote(s) : s;
    }

    /// <summary>
    /// Writes one CSV row terminated by LF. Callers must configure <paramref name="writer"/>
    /// with <c>NewLine = "\n"</c> and a UTF-8-no-BOM encoding.
    /// </summary>
    public static void WriteRow(TextWriter writer, IEnumerable<object?> fields)
    {
        bool first = true;
        foreach (var f in fields)
        {
            if (!first) writer.Write(',');
            writer.Write(FormatField(f));
            first = false;
        }
        writer.Write('\n');
    }

    private static bool NeedsQuoting(string s)
    {
        foreach (var c in s)
        {
            if (c == ',' || c == '"' || c == '\n' || c == '\r') return true;
        }
        return false;
    }

    private static string Quote(string s) => "\"" + s.Replace("\"", "\"\"") + "\"";
}
