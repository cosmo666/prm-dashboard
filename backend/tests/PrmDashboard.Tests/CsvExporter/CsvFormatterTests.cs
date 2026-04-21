using System.Globalization;
using System.IO;
using PrmDashboard.CsvExporter.Csv;
using Xunit;

namespace PrmDashboard.Tests.CsvExporter;

public class CsvFormatterTests
{
    [Fact]
    public void FormatField_Null_ReturnsEmptyString()
    {
        Assert.Equal("", CsvFormatter.FormatField(null));
        Assert.Equal("", CsvFormatter.FormatField(DBNull.Value));
    }

    [Fact]
    public void FormatField_PlainString_ReturnsUnquoted()
    {
        Assert.Equal("hello", CsvFormatter.FormatField("hello"));
    }

    [Fact]
    public void FormatField_StringWithComma_IsQuoted()
    {
        Assert.Equal("\"hello, world\"", CsvFormatter.FormatField("hello, world"));
    }

    [Fact]
    public void FormatField_StringWithQuote_IsQuotedAndQuoteDoubled()
    {
        Assert.Equal("\"she said \"\"hi\"\"\"", CsvFormatter.FormatField("she said \"hi\""));
    }

    [Fact]
    public void FormatField_StringWithNewline_IsQuoted()
    {
        Assert.Equal("\"line1\nline2\"", CsvFormatter.FormatField("line1\nline2"));
    }

    [Fact]
    public void FormatField_StringWithCarriageReturn_IsQuoted()
    {
        Assert.Equal("\"line1\rline2\"", CsvFormatter.FormatField("line1\rline2"));
    }

    [Fact]
    public void FormatField_Integer_ReturnsBareNumber()
    {
        Assert.Equal("800", CsvFormatter.FormatField(800));      // HHMM value stays as int
        Assert.Equal("-1", CsvFormatter.FormatField(-1));
        Assert.Equal("0", CsvFormatter.FormatField(0));
    }

    [Fact]
    public void FormatField_Long_ReturnsBareNumber()
    {
        Assert.Equal("9999999999", CsvFormatter.FormatField(9999999999L));
    }

    [Fact]
    public void FormatField_BoolTrue_LowercaseTrue()
    {
        Assert.Equal("true", CsvFormatter.FormatField(true));
    }

    [Fact]
    public void FormatField_BoolFalse_LowercaseFalse()
    {
        Assert.Equal("false", CsvFormatter.FormatField(false));
    }

    [Fact]
    public void FormatField_DateOnly_IsIsoDate()
    {
        Assert.Equal("2026-04-21", CsvFormatter.FormatField(new DateOnly(2026, 4, 21)));
    }

    [Fact]
    public void FormatField_DateTime_IsIsoUtc()
    {
        // Explicitly UTC
        var dt = new DateTime(2026, 4, 21, 7, 30, 5, DateTimeKind.Utc);
        Assert.Equal("2026-04-21T07:30:05Z", CsvFormatter.FormatField(dt));
    }

    [Fact]
    public void FormatField_DateTime_UnspecifiedTreatedAsUtc()
    {
        // MySqlConnector returns Unspecified kind for DATETIME columns; we must treat as UTC.
        var dt = new DateTime(2026, 4, 21, 7, 30, 5, DateTimeKind.Unspecified);
        Assert.Equal("2026-04-21T07:30:05Z", CsvFormatter.FormatField(dt));
    }

    [Fact]
    public void FormatField_Decimal_UsesInvariantCulture()
    {
        var prev = Thread.CurrentThread.CurrentCulture;
        try
        {
            Thread.CurrentThread.CurrentCulture = new CultureInfo("de-DE"); // comma decimal
            Assert.Equal("1234.56", CsvFormatter.FormatField(1234.56m));
        }
        finally { Thread.CurrentThread.CurrentCulture = prev; }
    }

    [Fact]
    public void FormatField_Double_UsesInvariantCulture()
    {
        Assert.Equal("3.14", CsvFormatter.FormatField(3.14));
    }

    [Fact]
    public void WriteRow_EmitsFieldsWithCommasAndLfOnly()
    {
        using var sw = new StringWriter { NewLine = "\n" };
        CsvFormatter.WriteRow(sw, new object?[] { "a", 1, null, "b,c" });
        Assert.Equal("a,1,,\"b,c\"\n", sw.ToString());
    }

    [Fact]
    public void WriteRow_EmptyEnumerable_EmitsOnlyNewline()
    {
        using var sw = new StringWriter { NewLine = "\n" };
        CsvFormatter.WriteRow(sw, Array.Empty<object?>());
        Assert.Equal("\n", sw.ToString());
    }
}
