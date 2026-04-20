using Microsoft.AspNetCore.Mvc;

namespace PrmDashboard.Shared.DTOs;

/// <summary>
/// Query-string filter parameters accepted by every PRM analytics endpoint.
///
/// Wire contract notes:
///   * Property names use snake_case in the query string; each property carries
///     an explicit [FromQuery(Name = ...)] because ASP.NET Core's default model
///     binder does NOT strip underscores (so `handled_by` would silently not
///     bind to `HandledBy`).
///   * `Airport`, `Airline`, `Service`, `HandledBy` accept a comma-delimited list
///     of values (e.g. `?airport=DEL,BOM` or `?airline=AI,BA`). Use <see cref="AirportList"/>
///     / <see cref="AirlineList"/> etc. in query logic to get the parsed array
///     — DO NOT split manually.
/// </summary>
public class PrmFilterParams
{
    [FromQuery(Name = "airport")]
    public string Airport { get; set; } = string.Empty;

    [FromQuery(Name = "date_from")]
    public DateOnly? DateFrom { get; set; }

    [FromQuery(Name = "date_to")]
    public DateOnly? DateTo { get; set; }

    // Multi-valued CSV fields — parsed via the *List accessors below.
    [FromQuery(Name = "airline")]
    public string? Airline { get; set; }

    [FromQuery(Name = "service")]
    public string? Service { get; set; }

    [FromQuery(Name = "handled_by")]
    public string? HandledBy { get; set; }

    [FromQuery(Name = "flight")]
    public string? Flight { get; set; }

    [FromQuery(Name = "agent_no")]
    public string? AgentNo { get; set; }

    // --- Parsed CSV accessors ---------------------------------------------
    // These are computed — not bound — and split the raw CSV into a trimmed,
    // empty-filtered array. Returns null when the underlying field is unset
    // so callers can cheaply test `is { Length: > 0 }`.

    public string[]? AirportList => SplitCsv(Airport);
    public string[]? AirlineList => SplitCsv(Airline);
    public string[]? ServiceList => SplitCsv(Service);
    public string[]? HandledByList => SplitCsv(HandledBy);

    private static string[]? SplitCsv(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var parts = value.Split(
            ',',
            StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return parts.Length == 0 ? null : parts;
    }
}
