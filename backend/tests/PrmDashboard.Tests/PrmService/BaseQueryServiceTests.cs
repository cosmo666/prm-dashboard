using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.Tests.PrmService;

public class BaseQueryServiceTests
{
    [Fact]
    public void BuildWhereClause_SingleAirport_ProducesEqualityAndOneParam()
    {
        var filters = new PrmFilterParams { Airport = "DEL" };
        var (sql, parms) = BaseQueryService.BuildWhereClauseForTest(filters);

        Assert.Contains("loc_name = $a0", sql);
        Assert.Single(parms);
        Assert.Equal("a0", parms[0].ParameterName);
        Assert.Equal("DEL", parms[0].Value);
    }

    [Fact]
    public void BuildWhereClause_CsvAirports_ProducesInClause()
    {
        var filters = new PrmFilterParams { Airport = "DEL,BOM" };
        var (sql, parms) = BaseQueryService.BuildWhereClauseForTest(filters);

        Assert.Contains("loc_name IN (", sql);
        Assert.Equal(2, parms.Count);
        Assert.Equal(new[] { "DEL", "BOM" }, parms.Select(p => p.Value).ToArray());
        Assert.Equal(new[] { "a0", "a1" }, parms.Select(p => p.ParameterName).ToArray());
    }

    [Fact]
    public void BuildWhereClause_AllFiltersSet_AppendsEachPredicate()
    {
        var filters = new PrmFilterParams
        {
            Airport = "DEL",
            DateFrom = new DateOnly(2026, 3, 1),
            DateTo = new DateOnly(2026, 3, 31),
            Airline = "AI,6E",
            Service = "WCHR",
            HandledBy = "SELF",
            Flight = "AI101",
            AgentNo = "A001"
        };
        var (sql, parms) = BaseQueryService.BuildWhereClauseForTest(filters);

        Assert.Contains("loc_name = $a0", sql);
        Assert.Contains("service_date >= $df", sql);
        Assert.Contains("service_date <= $dt", sql);
        Assert.Contains("airline IN (", sql);
        Assert.Contains("service IN (", sql);
        Assert.Contains("prm_agent_type IN (", sql);
        Assert.Contains("flight = $f", sql);
        Assert.Contains("agent_no = $ag", sql);

        // 1 airport + 2 dates + 2 airlines + 1 service + 1 handledBy + flight + agentNo = 9
        Assert.Equal(9, parms.Count);
    }

    [Fact]
    public void GetPrevPeriodStart_SevenDayRange_ReturnsSevenDaysEarlier()
    {
        var from = new DateOnly(2026, 3, 8);
        var to = new DateOnly(2026, 3, 14);
        Assert.Equal(new DateOnly(2026, 3, 1),
            BaseQueryService.GetPrevPeriodStartForTest(from, to));
    }
}
