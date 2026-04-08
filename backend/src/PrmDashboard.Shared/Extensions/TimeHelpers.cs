namespace PrmDashboard.Shared.Extensions;

public static class TimeHelpers
{
    /// <summary>
    /// Converts HHMM integer (e.g., 237 = 02:37) to minutes since midnight.
    /// </summary>
    public static double HhmmToMinutes(int hhmm)
    {
        int hours = hhmm / 100;
        int minutes = hhmm % 100;
        return hours * 60 + minutes;
    }

    /// <summary>
    /// Calculates active service duration in minutes for a single row.
    /// If paused: returns start→pause duration. If not paused: returns start→end.
    /// </summary>
    public static double CalculateActiveMinutes(int startTime, int? pausedAt, int endTime)
    {
        if (pausedAt.HasValue)
            return HhmmToMinutes(pausedAt.Value) - HhmmToMinutes(startTime);

        return HhmmToMinutes(endTime) - HhmmToMinutes(startTime);
    }

    /// <summary>
    /// Formats HHMM integer to "HH:MM" string.
    /// </summary>
    public static string FormatHhmm(int hhmm)
    {
        int hours = hhmm / 100;
        int minutes = hhmm % 100;
        return $"{hours:D2}:{minutes:D2}";
    }
}
