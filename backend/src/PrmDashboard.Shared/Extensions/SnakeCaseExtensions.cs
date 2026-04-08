using System.Text.RegularExpressions;

namespace PrmDashboard.Shared.Extensions;

public static class SnakeCaseExtensions
{
    /// <summary>
    /// Converts PascalCase or camelCase to snake_case.
    /// EF Core column-name convention used across master and tenant contexts.
    /// Two-pass regex: first splits ABCd → AB_Cd, then ab → _C → a_bC.
    /// </summary>
    public static string ToSnakeCase(this string input)
    {
        if (string.IsNullOrEmpty(input)) return input;
        var step1 = Regex.Replace(input, @"([A-Z]+)([A-Z][a-z])", "$1_$2");
        var step2 = Regex.Replace(step1, @"([a-z\d])([A-Z])", "$1_$2");
        return step2.ToLowerInvariant();
    }
}
