using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SalaGest.Api.Contracts;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Services;

namespace SalaGest.Api.Endpoints;

public static partial class ApiEndpoints
{
    private const string InstitutionalOidcScheme = "InstitutionalOidc";
    private const string IssuerClaim = "salagest:validated-issuer";
    private const string FlowProperty = "salagest:institutional-flow";
    private const string UserProperty = "salagest:local-user-id";

    private static void MapInstitutionalAuthentication(IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api/auth/institutional").WithTags("Autenticação institucional");

        api.MapGet("/config", (IOptions<InstitutionalSsoOptions> options) =>
            Results.Ok(new { enabled = options.Value.Enabled })).AllowAnonymous();

        api.MapGet("/login", (IOptions<InstitutionalSsoOptions> options) =>
        {
            if (!options.Value.Enabled) return Results.NotFound();
            var properties = new AuthenticationProperties { RedirectUri = "/api/auth/institutional/callback" };
            properties.Items[FlowProperty] = "login";
            return Results.Challenge(properties, [InstitutionalOidcScheme]);
        }).AllowAnonymous();

        api.MapPost("/link/start", async (InstitutionalLinkStartRequest input, ClaimsPrincipal current,
            InstitutionalLoginTickets tickets, IOptions<InstitutionalSsoOptions> options,
            UserManager<AppUser> users, SignInManager<AppUser> signIn) =>
        {
            if (!options.Value.Enabled) return Results.NotFound();
            var userId = current.FindFirstValue(ClaimTypes.NameIdentifier) ?? current.FindFirstValue("sub");
            if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(input.Password))
                return Results.Unauthorized();
            var user = await users.FindByIdAsync(userId);
            if (user is null || !await CanAccessAsync(user, users, signIn))
                return Results.Json(new ApiError("A conta local não está autorizada para vinculação."), statusCode: 403);
            if (!(await signIn.CheckPasswordSignInAsync(user, input.Password, lockoutOnFailure: true)).Succeeded)
                return Results.Json(new ApiError("Não foi possível confirmar a senha local."), statusCode: 403);
            return Results.Ok(new { ticket = tickets.Create(userId, forLink: true) });
        }).RequireAuthorization();

        api.MapPost("/link", ([FromForm] InstitutionalLinkRequest input, InstitutionalLoginTickets tickets,
            IOptions<InstitutionalSsoOptions> options) =>
        {
            if (!options.Value.Enabled) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(input.Ticket) || !tickets.TryConsume(input.Ticket, forLink: true, out var userId))
                return Results.BadRequest(new ApiError("A solicitação de vinculação expirou. Inicie novamente pela sua conta do SalaGest."));
            var properties = new AuthenticationProperties { RedirectUri = "/api/auth/institutional/callback" };
            properties.Items[FlowProperty] = "link";
            properties.Items[UserProperty] = userId;
            return Results.Challenge(properties, [InstitutionalOidcScheme]);
        }).AllowAnonymous();

        api.MapGet("/callback", CompleteInstitutionalLogin).AllowAnonymous();

        api.MapPost("/exchange", async (InstitutionalExchangeRequest input,
            InstitutionalLoginTickets tickets, UserManager<AppUser> users,
            SignInManager<AppUser> signIn, IOptions<InstitutionalSsoOptions> options) =>
        {
            if (!options.Value.Enabled) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(input.Code) || input.Code.Length > 100 ||
                !tickets.TryConsume(input.Code, forLink: false, out var userId))
                return Results.Unauthorized();
            var user = await users.FindByIdAsync(userId);
            if (user is null || !await CanAccessAsync(user, users, signIn)) return Results.Unauthorized();
            signIn.AuthenticationScheme = IdentityConstants.BearerScheme;
            await signIn.SignInAsync(user, isPersistent: false);
            return Results.Empty;
        }).AllowAnonymous();
    }

    private static async Task<IResult> CompleteInstitutionalLogin(HttpContext context,
        IOptions<InstitutionalSsoOptions> configured, UserManager<AppUser> users,
        SignInManager<AppUser> signIn, InstitutionalLoginTickets tickets, AppDbContext db)
    {
        var options = configured.Value;
        if (!options.Enabled) return Results.NotFound();
        var external = await context.AuthenticateAsync(IdentityConstants.ExternalScheme);
        if (!external.Succeeded || external.Principal is null)
        {
            await context.SignOutAsync(IdentityConstants.ExternalScheme);
            return Results.Redirect(CallbackUrl(options, "ssoError", "provider"));
        }

        try
        {
            var issuer = external.Principal.FindFirstValue(IssuerClaim);
            var subject = external.Principal.FindFirstValue("sub");
            if (string.IsNullOrWhiteSpace(issuer) || string.IsNullOrWhiteSpace(subject) || subject.Length > 512)
                return Results.Redirect(CallbackUrl(options, "ssoError", "identity"));

            var provider = InstitutionalLoginTickets.ProviderKey(issuer);
            var providerSubject = InstitutionalLoginTickets.SubjectKey(subject);
            var flow = external.Properties is not null &&
                external.Properties.Items.TryGetValue(FlowProperty, out var foundFlow) ? foundFlow : null;
            if (flow == "link")
            {
                var userId = external.Properties is not null &&
                    external.Properties.Items.TryGetValue(UserProperty, out var foundUserId) ? foundUserId : null;
                var user = string.IsNullOrWhiteSpace(userId) ? null : await users.FindByIdAsync(userId);
                if (user is null || !await CanAccessAsync(user, users, signIn))
                    return Results.Redirect(CallbackUrl(options, "ssoError", "link"));
                if (await db.UserLogins.AnyAsync(x => x.LoginProvider == provider && x.ProviderKey == providerSubject))
                    return Results.Redirect(CallbackUrl(options, "ssoError", "link"));
                await using var transaction = await db.Database.BeginTransactionAsync();
                try
                {
                    var linked = await users.AddLoginAsync(user, new UserLoginInfo(provider, providerSubject, "Conta institucional"));
                    if (!linked.Succeeded)
                    {
                        await transaction.RollbackAsync();
                        return Results.Redirect(CallbackUrl(options, "ssoError", "link"));
                    }
                    var auditId = InstitutionalLoginTickets.AuditIdentityId(provider, providerSubject);
                    AuditTrail.Add(db, "InstitutionalIdentity", auditId, "Vinculada", user.Id,
                        null, new { Provider = provider });
                    await db.SaveChangesAsync();
                    await transaction.CommitAsync();
                    return Results.Redirect(CallbackUrl(options, "ssoLinked", "1"));
                }
                catch (DbUpdateException)
                {
                    await transaction.RollbackAsync();
                    return Results.Redirect(CallbackUrl(options, "ssoError", "link"));
                }
            }

            if (flow != "login")
                return Results.Redirect(CallbackUrl(options, "ssoError", "identity"));

            var localUser = await users.FindByLoginAsync(provider, providerSubject);
            if (localUser is null || !await CanAccessAsync(localUser, users, signIn))
                return Results.Redirect(CallbackUrl(options, "ssoError", "unlinked"));
            var code = tickets.Create(localUser.Id, forLink: false);
            return Results.Redirect(CallbackUrl(options, "ssoCode", code, inFragment: true));
        }
        finally
        {
            await context.SignOutAsync(IdentityConstants.ExternalScheme);
        }
    }

    private static async Task<bool> CanAccessAsync(AppUser user, UserManager<AppUser> users,
        SignInManager<AppUser> signIn)
    {
        if (!await signIn.CanSignInAsync(user) || await users.IsLockedOutAsync(user)) return false;
        var lockoutEnd = await users.GetLockoutEndDateAsync(user);
        return lockoutEnd is null || lockoutEnd <= DateTimeOffset.UtcNow;
    }

    private static string CallbackUrl(InstitutionalSsoOptions options, string key, string value, bool inFragment = false)
    {
        if (!inFragment) return QueryHelpers.AddQueryString(options.FrontendCallbackUrl!, key, value);
        var target = new UriBuilder(options.FrontendCallbackUrl!)
        { Fragment = $"{Uri.EscapeDataString(key)}={Uri.EscapeDataString(value)}" };
        return target.Uri.ToString();
    }
}

public sealed record InstitutionalExchangeRequest(string Code);
public sealed record InstitutionalLinkRequest(string Ticket);
public sealed record InstitutionalLinkStartRequest(string Password);
