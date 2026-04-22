namespace PrmDashboard.PrmService.Sql;

/// <summary>
/// SQL-expression builders for the HHMM integer time-encoding used in
/// <c>prm_services.parquet</c>. Callers interpolate the returned strings
/// into DuckDB queries; values are always column names or integer literals —
/// never user-supplied strings — so no SQL-injection surface.
/// </summary>
public static class HhmmSql
{
    /// <summary>
    /// Expression that converts an HHMM INTEGER expression to total minutes
    /// since midnight. Example: <c>945</c> (9:45) → <c>585</c>.
    /// </summary>
    public static string ToMinutes(string colExpr) =>
        $"(({colExpr} // 100) * 60 + ({colExpr} % 100))";

    /// <summary>
    /// Expression for the active-minutes contribution of a single row.
    /// Mirrors <see cref="Shared.Extensions.TimeHelpers.CalculateActiveMinutes"/>:
    /// <c>(COALESCE(paused_at, end_time) - start_time)</c> in minutes,
    /// clamped to ≥ 0 via <c>GREATEST(..., 0)</c>.
    /// </summary>
    public static string ActiveMinutesExpr(string startCol, string pausedAtCol, string endCol) =>
        $"GREATEST({ToMinutes($"COALESCE({pausedAtCol}, {endCol})")} - {ToMinutes(startCol)}, 0)";
}
