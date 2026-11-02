using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SalaGest.Api.Data;
using SalaGest.Api.Models;

namespace SalaGest.Api.Services;

// Keep permanent privilege changes and session revocation in the same transaction.
public class SessionUserManager(IUserStore<AppUser> store, IOptions<IdentityOptions> options,
    IPasswordHasher<AppUser> hasher, IEnumerable<IUserValidator<AppUser>> validators,
    IEnumerable<IPasswordValidator<AppUser>> passwordValidators, ILookupNormalizer normalizer,
    IdentityErrorDescriber errors, IServiceProvider services, ILogger<UserManager<AppUser>> logger,
    AppDbContext db) : UserManager<AppUser>(store, options, hasher, validators, passwordValidators,
        normalizer, errors, services, logger)
{
    public override Task<IdentityResult> AddToRoleAsync(AppUser user, string role) =>
        ChangeRoles(user, () => base.AddToRoleAsync(user, role));
    public override Task<IdentityResult> RemoveFromRoleAsync(AppUser user, string role) =>
        ChangeRoles(user, () => base.RemoveFromRoleAsync(user, role));
    public override Task<IdentityResult> AddToRolesAsync(AppUser user, IEnumerable<string> roles) =>
        ChangeRoles(user, () => base.AddToRolesAsync(user, roles));
    public override Task<IdentityResult> RemoveFromRolesAsync(AppUser user, IEnumerable<string> roles) =>
        ChangeRoles(user, () => base.RemoveFromRolesAsync(user, roles));

    private async Task<IdentityResult> ChangeRoles(AppUser user, Func<Task<IdentityResult>> change)
    {
        await using var transaction = db.Database.CurrentTransaction is null
            ? await db.Database.BeginTransactionAsync() : null;
        var result = await change();
        if (!result.Succeeded) return result;
        var stampResult = await UpdateSecurityStampAsync(user);
        if (!stampResult.Succeeded)
            throw new InvalidOperationException("Não foi possível invalidar as sessões após alterar os papéis.");
        if (transaction is not null) await transaction.CommitAsync();
        return result;
    }
}
