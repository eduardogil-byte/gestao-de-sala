using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;

namespace SalaGest.Api.Services;

public sealed class InstitutionalSsoOptions
{
    public bool Enabled { get; set; }
    public string? Authority { get; set; }
    public string? ClientId { get; set; }
    public string? ClientSecret { get; set; }
    public string CallbackPath { get; set; } = "/signin-institutional";
    public string? FrontendCallbackUrl { get; set; }

    public void Validate(bool isDevelopment)
    {
        if (!Uri.TryCreate(Authority, UriKind.Absolute, out var authority) ||
            authority.Scheme != Uri.UriSchemeHttps || !string.IsNullOrEmpty(authority.Query) ||
            !string.IsNullOrEmpty(authority.Fragment) || !string.IsNullOrEmpty(authority.UserInfo))
            throw new InvalidOperationException("Authentication:InstitutionalSso:Authority deve ser uma URL HTTPS válida.");
        if (string.IsNullOrWhiteSpace(ClientId) || string.IsNullOrWhiteSpace(ClientSecret))
            throw new InvalidOperationException("Authentication:InstitutionalSso:ClientId e ClientSecret são obrigatórios quando o SSO está habilitado.");
        if (string.IsNullOrWhiteSpace(CallbackPath) || !CallbackPath.StartsWith('/') ||
            CallbackPath.StartsWith("//", StringComparison.Ordinal) || CallbackPath.Contains('?') ||
            CallbackPath.Contains('#') || CallbackPath.Contains('\\'))
            throw new InvalidOperationException("Authentication:InstitutionalSso:CallbackPath deve ser um caminho local válido.");
        if (!Uri.TryCreate(FrontendCallbackUrl, UriKind.Absolute, out var frontend) ||
            (frontend.Scheme != Uri.UriSchemeHttps &&
                !(isDevelopment && frontend.Scheme == Uri.UriSchemeHttp && frontend.IsLoopback)) ||
            !string.IsNullOrEmpty(frontend.Query) || !string.IsNullOrEmpty(frontend.Fragment) ||
            !string.IsNullOrEmpty(frontend.UserInfo))
            throw new InvalidOperationException("Authentication:InstitutionalSso:FrontendCallbackUrl deve ser uma URL HTTPS sem query ou fragmento (HTTP loopback somente em Development).");
    }
}

public sealed class InstitutionalLoginTickets
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(2);
    private readonly ConcurrentDictionary<string, Ticket> _tickets = new(StringComparer.Ordinal);

    public string Create(string userId, bool forLink)
    {
        RemoveExpired();
        var code = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');
        _tickets[code] = new Ticket(userId, forLink, DateTimeOffset.UtcNow.Add(Lifetime));
        return code;
    }

    public bool TryConsume(string code, bool forLink, out string userId)
    {
        userId = "";
        if (!_tickets.TryRemove(code, out var ticket) || ticket.ForLink != forLink ||
            ticket.ExpiresAt <= DateTimeOffset.UtcNow) return false;
        userId = ticket.UserId;
        return true;
    }

    public static string ProviderKey(string issuer)
    {
        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(issuer));
        return "oidc:" + Convert.ToHexString(digest).ToLowerInvariant();
    }

    public static string SubjectKey(string subject)
    {
        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(subject));
        return "sub:" + Convert.ToHexString(digest).ToLowerInvariant();
    }

    public static string AuditIdentityId(string provider, string subject)
    {
        var digest = SHA256.HashData(Encoding.UTF8.GetBytes($"{provider}\n{subject}"));
        return Convert.ToHexString(digest).ToLowerInvariant();
    }

    private void RemoveExpired()
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var (code, ticket) in _tickets)
            if (ticket.ExpiresAt <= now) _tickets.TryRemove(code, out _);
    }

    private sealed record Ticket(string UserId, bool ForLink, DateTimeOffset ExpiresAt);
}
