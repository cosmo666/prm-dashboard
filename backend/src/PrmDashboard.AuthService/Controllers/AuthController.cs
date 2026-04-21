using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using PrmDashboard.AuthService.Services;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.AuthService.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private static readonly CookieOptions BaseRefreshCookieOptions = new()
    {
        HttpOnly = true,
        Secure = true,
        SameSite = SameSiteMode.Strict,
        Path = "/api/auth"  // Scoped to auth endpoints only — gateway forwards /api/auth/** here
    };

    private readonly AuthenticationService _authService;

    public AuthController(AuthenticationService authService)
    {
        _authService = authService;
    }

    [EnableRateLimiting("auth-strict")]
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        var tenantSlug = Request.Headers["X-Tenant-Slug"].FirstOrDefault();
        if (string.IsNullOrEmpty(tenantSlug))
            return Problem(detail: "Missing X-Tenant-Slug header", statusCode: 400, title: "Bad Request");

        var result = await _authService.LoginAsync(tenantSlug, request, ct);
        if (result == null)
            return Problem(detail: "Invalid credentials", statusCode: 401, title: "Unauthorized");

        // Create refresh token and set as httpOnly cookie
        var refreshToken = await _authService.CreateRefreshTokenAsync(result.Employee.Id, tenantSlug, ct);
        SetRefreshTokenCookie(refreshToken.Token, refreshToken.ExpiresAt);

        return Ok(result);
    }

    [EnableRateLimiting("auth-standard")]
    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh(CancellationToken ct)
    {
        var token = Request.Cookies["refreshToken"];
        if (string.IsNullOrEmpty(token))
            return Problem(detail: "No refresh token", statusCode: 401, title: "Unauthorized");

        var (accessToken, newRefreshToken, newExpiresAt) = await _authService.RefreshAsync(token, ct);
        if (accessToken == null || newRefreshToken == null || newExpiresAt == null)
            return Problem(detail: "Invalid or expired refresh token", statusCode: 401, title: "Unauthorized");

        SetRefreshTokenCookie(newRefreshToken, newExpiresAt.Value);
        return Ok(new RefreshResponse(accessToken));
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        var token = Request.Cookies["refreshToken"];
        if (!string.IsNullOrEmpty(token))
        {
            await _authService.RevokeRefreshTokenAsync(token, ct);
            Response.Cookies.Delete("refreshToken", BaseRefreshCookieOptions);
        }
        return Ok(new { message = "Logged out" });
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        var employeeIdClaim = User.FindFirst("sub")?.Value;
        if (employeeIdClaim == null || !int.TryParse(employeeIdClaim, out var employeeId))
            return Unauthorized();

        var profile = await _authService.GetProfileAsync(employeeId, ct);
        if (profile == null) return NotFound();

        return Ok(profile);
    }

    private void SetRefreshTokenCookie(string token, DateTime expires)
    {
        var options = new CookieOptions
        {
            HttpOnly = BaseRefreshCookieOptions.HttpOnly,
            Secure = BaseRefreshCookieOptions.Secure,
            SameSite = BaseRefreshCookieOptions.SameSite,
            Path = BaseRefreshCookieOptions.Path,
            Expires = expires
        };
        Response.Cookies.Append("refreshToken", token, options);
    }
}
