using System.Data;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Services;
using SalaGest.Homologacao;

if (args.Length == 1 && args[0] == "help")
{
    Console.WriteLine("check / migrate-check: somente leitura. migrate --confirm-migrations e provision --confirm-synthetic: escrita futura com autorizacao externa. Use os wrappers PowerShell revisados.");
    return 0;
}
try
{
    if (args.SequenceEqual(new[] { "migrate-check" })) return await MaintenanceRunner.RunAsync(false);
    if (args.SequenceEqual(new[] { "migrate", "--confirm-migrations" })) return await MaintenanceRunner.RunAsync(true);
    var provision = args.SequenceEqual(new[] { "provision", "--confirm-synthetic" });
    if (!provision && !args.SequenceEqual(new[] { "check" }))
        throw new InvalidOperationException("Comando inválido. Use help ou check.");
    if (Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") != HomologationSafety.EnvironmentName)
        throw new InvalidOperationException("Ambiente Homologation obrigatório.");
    if (provision && (Environment.GetEnvironmentVariable("SALAGEST_HML_ALLOW_PROVISION") != "YES" || Console.IsInputRedirected))
        throw new InvalidOperationException("Provisionamento exige autorização explícita e terminal interativo.");
    var manifest = HomologationSafety.LoadManifest();
    var connectionString = HomologationSafety.RequiredConnection(manifest,
        Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection"),
        Environment.GetEnvironmentVariable("Bootstrap__EnableDevelopmentSeed"),
        Environment.GetEnvironmentVariable("Authentication__InstitutionalSso__Enabled"), DateTimeOffset.UtcNow);
    await using var connection = new SqlConnection(connectionString);
    await HomologationSafety.VerifyAsync(connection, manifest);
    var services = new ServiceCollection();
    services.AddLogging(logging => logging.ClearProviders());
    services.AddDbContext<AppDbContext>(options => options.UseSqlServer(connection, sql => sql.UseCompatibilityLevel(120)));
    services.AddIdentityCore<AppUser>(options =>
    {
        options.User.RequireUniqueEmail = true;
        options.Password.RequiredLength = 8;
        options.Password.RequireNonAlphanumeric = false;
        options.Password.RequireUppercase = false;
        options.Password.RequireLowercase = false;
        options.Password.RequireDigit = true;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(1);
        options.Lockout.MaxFailedAccessAttempts = 5;
    }).AddRoles<IdentityRole>().AddEntityFrameworkStores<AppDbContext>()
        .AddUserManager<SessionUserManager>().AddSignInManager();
    await using var provider = services.BuildServiceProvider();
    await using var scope = provider.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var expected = db.Database.GetMigrations().ToArray();
    var applied = (await db.Database.GetAppliedMigrationsAsync()).ToArray();
    if (!expected.SequenceEqual(applied)) throw new InvalidOperationException("Histórico de migrations divergente. Nenhuma migration será aplicada por esta ferramenta.");
    if (!provision)
    {
        Console.WriteLine("CHECK APROVADO: destino, identidade, permissões, TLS e migrations conferidos. Nenhuma escrita executada.");
        return 0;
    }
    await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
    // Check every mapped application table; never clear, update or reuse an existing dataset.
    var tables = db.Model.GetEntityTypes().Select(t => (Schema: t.GetSchema() ?? "dbo", Table: t.GetTableName()))
        .Where(t => t.Table is not null).Distinct().ToArray();
    foreach (var table in tables)
    {
        var schemaName = table.Schema.Replace("]", "]]");
        var tableName = table.Table!.Replace("]", "]]");
        await using var emptyCheck = connection.CreateCommand();
        emptyCheck.Transaction = (SqlTransaction)transaction.GetDbTransaction();
        // Identifiers come exclusively from the EF model and are bracket-escaped, never from input.
        emptyCheck.CommandText = $"SELECT CASE WHEN EXISTS(SELECT 1 FROM [{schemaName}].[{tableName}]) THEN 1 ELSE 0 END";
        var any = Convert.ToInt32(await emptyCheck.ExecuteScalarAsync());
        if (any != 0) throw new InvalidOperationException("Banco contém dados. Provisionamento recusado sem alterar registros existentes.");
    }
    var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
    var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
    foreach (var role in new[] { "Admin", "Professor" }) Check(await roles.CreateAsync(new IdentityRole(role)));
    var accounts = new[] { ("admin.sg6@example.invalid", "Admin SG6", "Admin"),
        ("docente01.sg6@example.invalid", "Docente fictício 01", "Professor"),
        ("docente02.sg6@example.invalid", "Docente fictício 02", "Professor") };
    var created = new List<AppUser>();
    foreach (var (email, name, role) in accounts)
    {
        var user = new AppUser { Id = Guid.NewGuid().ToString(), UserName = email, Email = email, DisplayName = name };
        var password = ReadPassword($"Senha para {email}: ");
        Check(await users.CreateAsync(user, password));
        Check(await users.AddToRoleAsync(user, role));
        created.Add(user);
    }
    SyntheticFixture.Add(db, created[1], created[2]);
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    Console.WriteLine("Massa SG6 criada: 1 Admin, 2 Professores, 2 semestres e catálogo/inventário sintéticos. Senhas não registradas.");
    return 0;
}
catch (InvalidOperationException error)
{
    Console.Error.WriteLine($"BLOQUEADO: {error.Message}");
    return 2;
}
catch (Exception)
{
    Console.Error.WriteLine("BLOQUEADO: operação não concluída. Nenhum detalhe privado será registrado; confira o ambiente autorizado.");
    return 2;
}

static void Check(IdentityResult result)
{
    if (!result.Succeeded) throw new InvalidOperationException("Identity recusou a criação. Confira política de senha, unicidade e configuração. A transação será revertida.");
}

static string ReadPassword(string prompt)
{
    Console.Write(prompt);
    var value = new StringBuilder();
    while (true)
    {
        var key = Console.ReadKey(intercept: true);
        if (key.Key == ConsoleKey.Enter) break;
        if (key.Key == ConsoleKey.Backspace) { if (value.Length > 0) value.Length--; }
        else if (!char.IsControl(key.KeyChar)) value.Append(key.KeyChar);
    }
    Console.WriteLine();
    return value.ToString();
}
