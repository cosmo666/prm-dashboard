using PrmDashboard.Shared.Extensions;
using Xunit;

namespace PrmDashboard.Tests.Shared;

/// <summary>
/// Tests the two-pass regex used by <see cref="SnakeCaseExtensions.ToSnakeCase"/>
/// that maps EF Core PascalCase property names to snake_case column names.
/// </summary>
public class SnakeCaseExtensionsTests
{
    [Theory]
    [InlineData("CamelCase", "camel_case")]
    [InlineData("LastLogin", "last_login")]
    [InlineData("DbPassword", "db_password")]
    [InlineData("", "")]
    [InlineData("already_snake", "already_snake")]
    // Acronym handling: the first regex ([A-Z]+)([A-Z][a-z]) splits "IATAC" + "ode"
    // into "IATA_Code", then lowercased -> "iata_code". Documented actual behavior.
    [InlineData("IATACode", "iata_code")]
    public void ToSnakeCase_ConvertsExpected(string input, string expected)
    {
        Assert.Equal(expected, input.ToSnakeCase());
    }
}
