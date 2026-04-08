namespace PrmDashboard.Shared.DTOs;

public record LoginRequest(string Username, string Password);

public record LoginResponse(string AccessToken, EmployeeDto Employee);

public record RefreshResponse(string AccessToken);

public record EmployeeDto(
    int Id,
    string DisplayName,
    string? Email,
    List<AirportDto> Airports
);

public record AirportDto(string Code, string Name);
