using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using SalaGest.Api.Models;

namespace SalaGest.Api.Services;

public sealed class BearerSessionValidationMiddleware(RequestDelegate next,
    ILogger<BearerSessionValidationMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context, UserManager<AppUser> users,
        SignInManager<AppUser> signIn, IOptions<IdentityOptions> options)
    {
        var endpoint = context.GetEndpoint();
        if (endpoint is null || endpoint.Metadata.GetMetadata<IAllowAnonymous>() is not null ||
            (endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>().Count == 0 &&
             endpoint.Metadata.GetOrderedMetadata<AuthorizationPolicy>().Count == 0))
        {
            await next(context);
            return;
        }

        var authentication = await context.AuthenticateAsync(IdentityConstants.BearerScheme);
        if (!authentication.Succeeded)
        {
            await next(context); // Authorization produces the normal 401 challenge.
            return;
        }

        bool valid;
        try
        {
            var principal = authentication.Principal;
            var stamp = principal.FindFirst(options.Value.ClaimsIdentity.SecurityStampClaimType)?.Value;
            var user = string.IsNullOrEmpty(stamp) ? null : await signIn.ValidateSecurityStampAsync(principal);
            valid = user is not null && await signIn.CanSignInAsync(user) &&
                !await users.IsLockedOutAsync(user) &&
                (user.LockoutEnd is null || user.LockoutEnd <= DateTimeOffset.UtcNow);
            if (valid)
            {
                var persistedRoles = await users.GetRolesAsync(user!);
                var tokenRoles = principal.FindAll(options.Value.ClaimsIdentity.RoleClaimType).Select(c => c.Value);
                valid = new HashSet<string>(persistedRoles, StringComparer.Ordinal).SetEquals(tokenRoles);
            }
        }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            // Never fall back to the old token claims when the store is unavailable.
            logger.LogWarning("Bearer session validation unavailable ({ExceptionType}).", exception.GetType().Name);
            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            await context.Response.WriteAsJsonAsync(new { error = "Não foi possível validar a sessão. Tente novamente." });
            return;
        }

        if (!valid)
        {
            await context.ChallengeAsync(IdentityConstants.BearerScheme);
            return;
        }
        await next(context);
    }
}
