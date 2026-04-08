using PrmDashboard.Shared.Extensions;
using Xunit;

namespace PrmDashboard.Tests.Shared;

/// <summary>
/// Tests for <see cref="TimeHelpers.CalculateActiveMinutes"/>, which owns the
/// PRM duration semantics (HHMM encoding, paused-state handling, negative guard).
/// </summary>
public class TimeHelpersTests
{
    [Fact]
    public void CalculateActiveMinutes_SimpleCase_ReturnsFullDuration()
    {
        // 08:00 -> 08:30, not paused, expect 30 minutes
        var minutes = TimeHelpers.CalculateActiveMinutes(startTime: 800, pausedAt: null, endTime: 830);
        Assert.Equal(30, minutes);
    }

    [Fact]
    public void CalculateActiveMinutes_PausedCase_ReturnsOnlyActivePortion()
    {
        // Started at 08:00, paused at 08:15 (end_time irrelevant once paused), expect 15
        var minutes = TimeHelpers.CalculateActiveMinutes(startTime: 800, pausedAt: 815, endTime: 830);
        Assert.Equal(15, minutes);
    }

    [Fact]
    public void CalculateActiveMinutes_NegativeGuard_ReturnsZero()
    {
        // Start after end (bad data) -> guard returns 0 rather than a negative value
        var minutes = TimeHelpers.CalculateActiveMinutes(startTime: 1000, pausedAt: null, endTime: 900);
        Assert.Equal(0, minutes);
    }

    [Fact]
    public void CalculateActiveMinutes_ZeroDuration_ReturnsZero()
    {
        // Same timestamp for start and end -> 0 minutes
        var minutes = TimeHelpers.CalculateActiveMinutes(startTime: 800, pausedAt: null, endTime: 800);
        Assert.Equal(0, minutes);
    }
}
