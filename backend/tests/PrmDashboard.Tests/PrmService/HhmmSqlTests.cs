using DuckDB.NET.Data;
using PrmDashboard.PrmService.Sql;
using Xunit;

namespace PrmDashboard.Tests.PrmService;

public class HhmmSqlTests
{
    [Fact]
    public void ToMinutes_ProducesExpectedExpression()
    {
        // DuckDB requires // for integer division; plain / on integer literals yields DOUBLE.
        Assert.Equal(
            "((start_time // 100) * 60 + (start_time % 100))",
            HhmmSql.ToMinutes("start_time"));
    }

    [Fact]
    public void ActiveMinutesExpr_UsesCoalesceAndGreatest()
    {
        var expr = HhmmSql.ActiveMinutesExpr("start_time", "paused_at", "end_time");
        Assert.Contains("COALESCE(paused_at, end_time)", expr);
        Assert.Contains("GREATEST(", expr);
        Assert.Contains("start_time", expr);
    }

    [Theory]
    [InlineData(945, 585)]   // 9:45 → 9*60 + 45
    [InlineData(0, 0)]
    [InlineData(2359, 1439)] // 23:59
    [InlineData(237, 157)]   // 2:37
    public async Task ToMinutes_EvaluatesCorrectlyInDuckDb(int hhmm, int expectedMinutes)
    {
        await using var conn = new DuckDBConnection("DataSource=:memory:");
        await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = $"SELECT {HhmmSql.ToMinutes(hhmm.ToString())}";
        var result = await cmd.ExecuteScalarAsync();
        Assert.Equal((long)expectedMinutes, System.Convert.ToInt64(result));
    }

    [Theory]
    [InlineData(900, null, 1030, 90)]   // no pause: 9:00 → 10:30 = 90 min
    [InlineData(900, 920, 1030, 20)]    // paused at 9:20: 9:00 → 9:20 = 20 min
    [InlineData(1030, null, 900, 0)]    // clock skew: end before start → clamped to 0
    public async Task ActiveMinutesExpr_MatchesLegacyBehaviour(
        int start, int? pausedAt, int end, int expected)
    {
        await using var conn = new DuckDBConnection("DataSource=:memory:");
        await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
        var pausedLiteral = pausedAt.HasValue ? pausedAt.Value.ToString() : "NULL::INTEGER";
        cmd.CommandText = $"SELECT {HhmmSql.ActiveMinutesExpr(start.ToString(), pausedLiteral, end.ToString())}";
        var result = await cmd.ExecuteScalarAsync();
        Assert.Equal((long)expected, System.Convert.ToInt64(result));
    }
}
