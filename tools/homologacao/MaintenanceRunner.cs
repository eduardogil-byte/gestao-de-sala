using System.Text.Json;
using System.Security.Principal;
using Microsoft.Win32;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Data;
using SalaGest.Api.Services;

namespace SalaGest.Homologacao;

// Separate from application startup and provisioning. No design-time EF factory or config fallback.
public static class MaintenanceRunner
{
    private static async Task VerifyOtherInstancesAsync(HomologationManifest manifest)
    {
        if (!OperatingSystem.IsWindows()) throw new InvalidOperationException("Homologacao exige Windows.");
        using var identity = WindowsIdentity.GetCurrent();
        if (new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator))
            throw new InvalidOperationException("Nao execute manutencao em sessao Windows elevada.");
        var path = Environment.GetEnvironmentVariable("SALAGEST_HML_MANIFEST")!;
        var repository = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../.."));
        if (Path.GetFullPath(path).StartsWith(repository + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Manifesto deve ser externo ao repositorio.");
        using var json = JsonDocument.Parse(await File.ReadAllTextAsync(path));
        var blocked = json.RootElement.GetProperty("blockedEndpoints").EnumerateArray().Select(e => e.GetString()!).ToArray();
        using var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL");
        var local = key?.GetValueNames().Select(n => n == "MSSQLSERVER" ? "localhost" : @"localhost\" + n).ToArray()
            ?? throw new InvalidOperationException("Inventario local indisponivel.");
        if (!local.Contains(manifest.ServerEndpoint, StringComparer.OrdinalIgnoreCase) || blocked.Length == 0 ||
            local.Where(e => !e.Equals(manifest.ServerEndpoint, StringComparison.OrdinalIgnoreCase)).Any(e => !blocked.Contains(e, StringComparer.OrdinalIgnoreCase)))
            throw new InvalidOperationException("Inventario de instancias incompleto.");
        foreach (var endpoint in blocked)
        {
            if (string.IsNullOrWhiteSpace(endpoint) || endpoint.Equals(manifest.ServerEndpoint, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Lista de bloqueio invalida.");
            var b = new SqlConnectionStringBuilder { DataSource = endpoint, InitialCatalog = "master", IntegratedSecurity = true,
                Encrypt = SqlConnectionEncryptOption.Mandatory, TrustServerCertificate = false, ConnectTimeout = 5 };
            await using var c = new SqlConnection(b.ConnectionString);
            try { await c.OpenAsync(); }
            catch (SqlException e) when (e.Number == 18456) { continue; }
            throw new InvalidOperationException("Bloqueio de outra instancia nao comprovado; erros TLS/rede nao sao prova.");
        }
    }

    public static void Validate(string actualServer, string database, string sid, string originalSid,
        bool sysadmin, bool owner, bool otherAccess, string[] databases, string[] serverPermissions,
        string[] databasePermissions, string[] expected, string[] applied, HomologationManifest manifest)
    {
        if (!actualServer.Equals(manifest.ServerName, StringComparison.OrdinalIgnoreCase) ||
            database != HomologationSafety.DatabaseName ||
            !sid.Equals(manifest.MaintenanceSid, StringComparison.OrdinalIgnoreCase) ||
            !originalSid.Equals(manifest.MaintenanceSid, StringComparison.OrdinalIgnoreCase) ||
            sysadmin || owner || otherAccess || databases.Length != 1 || databases[0] != database)
            throw new InvalidOperationException("Destino ou identidade de manutencao nao autorizado.");
        string[] serverAllowed = ["CONNECT SQL", "VIEW ANY DATABASE", "VIEW ANY COLUMN ENCRYPTION KEY DEFINITION", "VIEW ANY COLUMN MASTER KEY DEFINITION"];
        string[] dbAllowed = ["CONNECT", "SELECT", "INSERT", "UPDATE", "DELETE", "VIEW DEFINITION",
            "CREATE TABLE", "VIEW ANY COLUMN ENCRYPTION KEY DEFINITION", "VIEW ANY COLUMN MASTER KEY DEFINITION"];
        if (serverPermissions.Any(p => !serverAllowed.Contains(p, StringComparer.OrdinalIgnoreCase)) ||
            databasePermissions.Any(p => !dbAllowed.Contains(p, StringComparer.OrdinalIgnoreCase)) ||
            !serverPermissions.Contains("VIEW ANY DATABASE", StringComparer.OrdinalIgnoreCase))
            throw new InvalidOperationException("Permissoes efetivas de manutencao excessivas ou desconhecidas.");
        if (expected.Length != 16 || applied.Length > expected.Length || !expected.Take(applied.Length).SequenceEqual(applied))
            throw new InvalidOperationException("Conjunto ou historico das 16 migrations divergente.");
    }

    public static async Task<int> RunAsync(bool write)
    {
        if (Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") != HomologationSafety.EnvironmentName ||
            (write && Environment.GetEnvironmentVariable("SALAGEST_HML_ALLOW_MIGRATE") != "YES"))
            throw new InvalidOperationException("Manutencao sem ambiente/autorizacao explicita.");
        var manifest = HomologationSafety.LoadManifest();
        var settings = HomologationSafety.RequiredConnection(manifest,
            Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection"),
            Environment.GetEnvironmentVariable("Bootstrap__EnableDevelopmentSeed"),
            Environment.GetEnvironmentVariable("Authentication__InstitutionalSso__Enabled"), DateTimeOffset.UtcNow);
        await using var connection = new SqlConnection(settings);
        await connection.OpenAsync();
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(connection).Options);
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = """
            SELECT CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')), DB_NAME(),
              CONVERT(varchar(256),SUSER_SID(),1),CONVERT(varchar(256),SUSER_SID(ORIGINAL_LOGIN()),1),
              IS_SRVROLEMEMBER('sysadmin'), IS_MEMBER('db_owner'),
              CASE WHEN EXISTS(SELECT 1 FROM sys.databases WHERE database_id>4 AND name<>DB_NAME() AND HAS_DBACCESS(name)=1) THEN 1 ELSE 0 END;
            SELECT name FROM sys.databases WHERE database_id>4;
            SELECT permission_name FROM fn_my_permissions(NULL,'SERVER');
            SELECT permission_name FROM fn_my_permissions(NULL,'DATABASE');
            """;
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync() || Enumerable.Range(0, 7).Any(r.IsDBNull))
            throw new InvalidOperationException("Metadados de manutencao incompletos.");
        var server = r.GetString(0); var database = r.GetString(1); var sid = r.GetString(2); var original = r.GetString(3);
        var admin = r.GetInt32(4) != 0; var owner = r.GetInt32(5) != 0; var other = r.GetInt32(6) != 0;
        async Task<string[]> Next()
        {
            if (!await r.NextResultAsync()) throw new InvalidOperationException("Metadados ausentes.");
            var rows = new List<string>();
            while (await r.ReadAsync()) rows.Add(r.GetString(0));
            return rows.ToArray();
        }
        var databases = await Next(); var serverPermissions = await Next(); var databasePermissions = await Next();
        await r.DisposeAsync();
        using var authorization = JsonDocument.Parse(await File.ReadAllTextAsync(Environment.GetEnvironmentVariable("SALAGEST_HML_MANIFEST")!));
        var reservation = authorization.RootElement.GetProperty("reservationId").GetString();
        if (!Guid.TryParse(reservation, out var reservationId) || reservationId == Guid.Empty)
            throw new InvalidOperationException("Reserva sem identificador valido.");
        await using var marker = connection.CreateCommand();
        marker.CommandText = "SELECT CONVERT(nvarchar(36),value) FROM sys.extended_properties WHERE class=0 AND name=N'SalaGestHomologationReservation'";
        if (!string.Equals(await marker.ExecuteScalarAsync() as string, reservationId.ToString(), StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Banco nao foi criado sob esta reserva. Reutilizacao proibida.");
        var expected = db.Database.GetMigrations().ToArray();
        var applied = (await db.Database.GetAppliedMigrationsAsync()).ToArray();
        Validate(server, database, sid, original, admin, owner, other, databases, serverPermissions, databasePermissions, expected, applied, manifest);
        await VerifyOtherInstancesAsync(manifest);
        if (!write) { Console.WriteLine("Manutencao validada sem escrita."); return 0; }
        await db.Database.MigrateAsync();
        if (!expected.SequenceEqual(await db.Database.GetAppliedMigrationsAsync()))
            throw new InvalidOperationException("Historico final divergente. Interrompa; nao repetir automaticamente.");
        Console.WriteLine("Migrations aplicadas no destino aprovado. Validar permissoes antes de iniciar API.");
        return 0;
    }
}
