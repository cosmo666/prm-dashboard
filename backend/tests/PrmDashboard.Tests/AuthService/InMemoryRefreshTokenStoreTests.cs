using System.Threading.Tasks;
using PrmDashboard.AuthService.Services;
using Xunit;

namespace PrmDashboard.Tests.AuthService;

public class InMemoryRefreshTokenStoreTests
{
    private static RefreshTokenEntry FutureEntry(int employeeId = 1, string slug = "aeroground")
        => new(employeeId, slug, DateTime.UtcNow.AddDays(7));

    private static RefreshTokenEntry ExpiredEntry(int employeeId = 1, string slug = "aeroground")
        => new(employeeId, slug, DateTime.UtcNow.AddHours(-1));

    [Fact]
    public void Add_NewToken_CanBeConsumed()
    {
        var store = new InMemoryRefreshTokenStore();
        var entry = FutureEntry();
        store.Add("abc", entry);

        Assert.True(store.TryConsume("abc", out var retrieved));
        Assert.Equal(entry, retrieved);
    }

    [Fact]
    public void Add_DuplicateToken_Throws()
    {
        var store = new InMemoryRefreshTokenStore();
        store.Add("abc", FutureEntry());
        Assert.Throws<InvalidOperationException>(() => store.Add("abc", FutureEntry()));
    }

    [Fact]
    public void TryConsume_ValidToken_ReturnsEntryAndRemoves()
    {
        var store = new InMemoryRefreshTokenStore();
        store.Add("abc", FutureEntry());

        Assert.True(store.TryConsume("abc", out _));
        Assert.False(store.TryConsume("abc", out _)); // removed after first consume
    }

    [Fact]
    public void TryConsume_ExpiredToken_ReturnsFalseAndRemoves()
    {
        var store = new InMemoryRefreshTokenStore();
        store.Add("abc", ExpiredEntry());

        Assert.False(store.TryConsume("abc", out _));
        // Expired entry is purged — a later add of the same token works
        store.Add("abc", FutureEntry());
        Assert.True(store.TryConsume("abc", out _));
    }

    [Fact]
    public void TryConsume_UnknownToken_ReturnsFalse()
    {
        var store = new InMemoryRefreshTokenStore();
        Assert.False(store.TryConsume("never-added", out _));
    }

    [Fact]
    public async Task TryConsume_RaceBetweenTwoThreads_OnlyOneWins()
    {
        // Atomic-rotation regression guard: two concurrent TryConsume calls on the same
        // token must produce exactly one true result.
        var store = new InMemoryRefreshTokenStore();
        store.Add("abc", FutureEntry());

        var t1 = Task.Run(() => store.TryConsume("abc", out _));
        var t2 = Task.Run(() => store.TryConsume("abc", out _));

        var results = await Task.WhenAll(t1, t2);
        // Exactly one winner
        Assert.Equal(1, results.Count(r => r));
    }

    [Fact]
    public void Revoke_KnownToken_Removes()
    {
        var store = new InMemoryRefreshTokenStore();
        store.Add("abc", FutureEntry());
        store.Revoke("abc");
        Assert.False(store.TryConsume("abc", out _));
    }

    [Fact]
    public void Revoke_UnknownToken_Ignored()
    {
        var store = new InMemoryRefreshTokenStore();
        store.Revoke("never-added"); // must not throw
    }
}
