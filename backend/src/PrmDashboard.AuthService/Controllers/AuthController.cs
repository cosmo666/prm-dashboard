using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PrmDashboard.AuthService.Services;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.AuthService.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly AuthenticationService _authService;

    public AuthController(AuthenticationService authService)
    {
        _authService = authService;
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        var tenantSlug = Request.Headers["X-Tenant-Slug"].FirstOrDefault();
        if (string.IsNullOrEmpty(tenantSlug))
            return BadRequest(new { error = "Missing X-Tenant-Slug header" });

        var result = await _authService.LoginAsync(tenantSlug, request, ct);
        if (result == null)
            return Unauthorized(new { error = "Invalid credentials" });

        // Create refresh token and set as httpOnly cookie
        var refreshToken = await _authService.CreateRefreshTokenAsync(result.Employee.Id, ct);
        SetRefreshTokenCookie(refreshToken.Token, refreshToken.ExpiresAt);

        return Ok(result);
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh(CancellationToken ct)
    {
        var token = Request.Cookies["refreshToken"];
        if (string.IsNullOrEmpty(token))
            return Unauthorized(new { error = "No refresh token" });

        var (accessToken, newRefreshToken) = await _authService.RefreshAsync(token, ct);
        if (accessToken == null || newRefreshToken == null)
            return Unauthorized(new { error = "Invalid or expired refresh token" });

        SetRefreshTokenCookie(newRefreshToken.Token, newRefreshToken.ExpiresAt);
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
            Response.Cookies.Delete("refreshToken");
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
        Response.Cookies.Append("refreshToken", token, new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Strict,
            Expires = expires
        });
    }
}
