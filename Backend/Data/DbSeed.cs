using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Models;

namespace SalaGest.Api.Data;

public static class DbSeed
{
    public static async Task InitializeAsync(IServiceProvider services, IConfiguration config)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        foreach (var role in new[] { "Admin", "Professor" })
            if (!await roles.RoleExistsAsync(role))
                await roles.CreateAsync(new IdentityRole(role));

        if (!await db.Shifts.AnyAsync())
        {
            db.Shifts.AddRange(
                new SchoolShift { Name = "Manhã", StartsAt = new TimeOnly(8, 0), EndsAt = new TimeOnly(12, 0) },
                new SchoolShift { Name = "Tarde", StartsAt = new TimeOnly(13, 30), EndsAt = new TimeOnly(17, 30) },
                new SchoolShift { Name = "Noite", StartsAt = new TimeOnly(18, 30), EndsAt = new TimeOnly(22, 30) });
            await db.SaveChangesAsync();
        }

        var adminEmail = config["Seed:AdminEmail"]?.Trim();
        var adminPassword = config["Seed:AdminPassword"];
        if (!string.IsNullOrWhiteSpace(adminEmail) && !string.IsNullOrWhiteSpace(adminPassword))
        {
            var admin = await users.FindByEmailAsync(adminEmail);
            var newlyCreated = admin is null;
            if (admin is null)
            {
                admin = new AppUser
                {
                    Email = adminEmail,
                    UserName = adminEmail,
                    DisplayName = "Administrador",
                    EmailConfirmed = true
                };
                var result = await users.CreateAsync(admin, adminPassword);
                if (!result.Succeeded)
                    throw new InvalidOperationException("Não foi possível criar o administrador: " +
                        string.Join("; ", result.Errors.Select(e => e.Description)));
            }
            if (!await users.IsInRoleAsync(admin, "Admin"))
            {
                // Se a conta já existia, não promovemos um usuário comum a administrador
                // só porque seu e-mail apareceu na configuração de inicialização.
                if (admin.EmailConfirmed != true)
                    throw new InvalidOperationException("Conta do admin já existe sem confirmação; configure outro e-mail de seed.");
                // Conta recém-criada tem EmailConfirmed=true; conta preexistente não recebe elevação automática.
                if (!newlyCreated)
                    throw new InvalidOperationException("E-mail do admin já cadastrado como usuário comum. Configure outro Seed:AdminEmail.");
                var roleResult = await users.AddToRoleAsync(admin, "Admin");
                if (!roleResult.Succeeded)
                    throw new InvalidOperationException("Falha ao atribuir papel Admin");
            }
        }
    }
}
