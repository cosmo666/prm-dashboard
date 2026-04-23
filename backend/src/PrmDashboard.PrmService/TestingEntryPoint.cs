namespace PrmDashboard.PrmService;

/// <summary>
/// Anchor type used by <c>WebApplicationFactory&lt;PrmServiceEntryPoint&gt;</c>
/// in integration tests to locate the PrmService assembly without the
/// global-namespace <c>Program</c> class (which is ambiguous when the test
/// project also references AuthService, TenantService, and the tool projects,
/// each of which also has a top-level <c>Program</c>).
/// </summary>
public sealed class PrmServiceEntryPoint { }
