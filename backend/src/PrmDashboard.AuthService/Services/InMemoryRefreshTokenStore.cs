using System.Collections.Concurrent;

namespace PrmDashboard.AuthService.Services;

/// <summary>
/// Internal refresh-token record. Held in the in-memory dictionary keyed by the
/// cryptographically-random token string itself. The dictionary value holds only
/// what's needed to reissue a JWT on refresh — employee details (name, airports)
/// are re-read from Parquet each time to avoid staleness.
/// </summary>
public sealed record RefreshTokenEntry(int EmployeeId, string TenantSlug, DateTime ExpiresAt);

/// <summary>
/// Wire-shape record returned from <see cref="AuthenticationService.CreateRefreshTokenAsync"/>.
/// Kept separate from <see cref="RefreshTokenEntry"/> so the controller doesn't see
/// the EmployeeId/TenantSlug the store holds internally.
/// </summary>
public sealed record RefreshTokenIssued(string Token, DateTime ExpiresAt);

/// <summary>
/// In-memory refresh-token store. Singleton DI. Replaces the <c>refresh_tokens</c>
/// MySQL table from the legacy AuthService. Process restart invalidates all tokens —
/// an accepted POC compromise per the Phase 3 migration spec.
/// </summary>
public sealed class InMemoryRefreshTokenStore
{
    private readonly ConcurrentDictionary<string, RefreshTokenEntry> _tokens = new();

    /// <summary>
    /// Adds a new token. Token strings are cryptographically random, so collisions are
    /// effectively impossible. If a collision does happen, throws — indicates a bug.
    /// </summary>
    public void Add(string token, RefreshTokenEntry entry)
    {
        if (!_tokens.TryAdd(token, entry))
            throw new InvalidOperationException("Refresh token collision — this should be effectively impossible.");
    }

    /// <summary>
    /// Atomically removes and returns the token entry if it exists AND has not expired.
    /// Returns false if the token is unknown, already consumed, or expired. Expired
    /// entries are removed either way (housekeeping).
    /// </summary>
    public bool TryConsume(string token, out RefreshTokenEntry entry)
    {
        if (!_tokens.TryRemove(token, out var candidate))
        {
            entry = default!;
            return false;
        }

        if (candidate.ExpiresAt <= DateTime.UtcNow)
        {
            entry = default!;
            return false;
        }

        entry = candidate;
        return true;
    }

    /// <summary>
    /// Removes a token if present. No-op if not. Used by logout.
    /// </summary>
    public void Revoke(string token) => _tokens.TryRemove(token, out _);
}
