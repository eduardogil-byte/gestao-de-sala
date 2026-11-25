using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Data;

namespace SalaGest.Api.Services;

public sealed record HomologationManifest
{
    public int AuthorizationVersion { get; init; }
    public bool ApprovedForSyntheticUse { get; init; }
    public string ServerEndpoint { get; init; } = "";
    public string ServerName { get; init; } = "";
    public string Database { get; init; } = "";
    public string ApplicationSid { get; init; } = "";
    public string MaintenanceSid { get; init; } = "";
    public string InstallerSid { get; init; } = "";
    public string InstallerOriginalLogin { get; init; } = "";
    public string InstallerOriginalSid { get; init; } = "";
    public string ApprovedBy { get; init; } = "";
    public DateTimeOffset ExpiresAtUtc { get; init; }
}

public sealed record HomologationSnapshot(string ServerName, string Database, string LoginSid,
    string OriginalLoginSid, bool Sysadmin, bool DbOwner, bool CanSeeDatabases,
    string[] UserDatabases, string[] ServerPermissions, string[] DatabasePermissions,
    bool CanAlterObjects, bool MissingDmlPermissions, bool CanWriteMigrationHistory,
    bool Encrypted, bool CanAccessOtherDatabase = false);

// Opt-in only. No application configuration or connection fallback is accepted in this environment.
public static class HomologationSafety
{
    public const string EnvironmentName = "Homologation";
    public const string DatabaseName = "SalaGest_Etapa6_Testes";
    public const string RestoreDatabaseName = "SalaGestRestore_Etapa6_Testes";

    public static HomologationManifest LoadManifest()
    {
        var path = Environment.GetEnvironmentVariable("SALAGEST_HML_MANIFEST");
        Require(!string.IsNullOrWhiteSpace(path) && Path.IsPathFullyQualified(path), "Manifesto externo obrigatório.");
        try
        {
            return JsonSerializer.Deserialize<HomologationManifest>(File.ReadAllText(path!),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                ?? throw new InvalidOperationException("Manifesto inválido.");
        }
        catch (Exception error) when (error is IOException or JsonException or UnauthorizedAccessException)
        { throw new InvalidOperationException("Não foi possível ler o manifesto de homologação."); }
    }

    public static string RequiredConnection(HomologationManifest manifest, string? connection,
        string? seed, string? sso, DateTimeOffset now)
    {
        Require(manifest.AuthorizationVersion == 2 && manifest.ApprovedForSyntheticUse && !string.IsNullOrWhiteSpace(manifest.ApprovedBy) &&
            manifest.ExpiresAtUtc > now && manifest.ExpiresAtUtc <= now.AddDays(7), "Reserva da instância não aprovada ou expirada.");
        Require(manifest.Database == DatabaseName && !string.IsNullOrWhiteSpace(manifest.ServerName) &&
            !string.IsNullOrWhiteSpace(manifest.ServerEndpoint), "Destino não autorizado.");
        Require(Regex.IsMatch(manifest.ApplicationSid, "^0x[0-9A-Fa-f]{16,}$") &&
            Regex.IsMatch(manifest.MaintenanceSid, "^0x[0-9A-Fa-f]{16,}$") &&
            Regex.IsMatch(manifest.InstallerSid, "^0x[0-9A-Fa-f]{16,}$") &&
            Regex.IsMatch(manifest.InstallerOriginalSid, "^0x[0-9A-Fa-f]{16,}$") &&
            !string.IsNullOrWhiteSpace(manifest.InstallerOriginalLogin) &&
            new[] { manifest.ApplicationSid, manifest.MaintenanceSid, manifest.InstallerSid }
                .Distinct(StringComparer.OrdinalIgnoreCase).Count() == 3, "Identidades distintas e explícitas são obrigatórias.");
        Require(seed == "false" && sso == "false", "Seed e SSO devem estar expressamente desabilitados.");
        Require(!string.IsNullOrWhiteSpace(connection), "Conexão de homologação obrigatória, sem fallback.");
        SqlConnectionStringBuilder settings;
        try { settings = new SqlConnectionStringBuilder(connection); }
        catch (ArgumentException) { throw new InvalidOperationException("Conexão de homologação inválida."); }
        Require(settings.DataSource.Equals(manifest.ServerEndpoint, StringComparison.OrdinalIgnoreCase) &&
            settings.InitialCatalog == DatabaseName, "Conexão fora do destino autorizado.");
        Require(settings.IntegratedSecurity && string.IsNullOrEmpty(settings.UserID) && string.IsNullOrEmpty(settings.Password),
            "Use exclusivamente a identidade Windows restrita, sem credenciais na conexão.");
        Require(!settings.TrustServerCertificate && settings.Encrypt.ToString() is "True" or "Mandatory" or "Strict",
            "TLS com certificado confiável é obrigatório.");
        Require(string.IsNullOrEmpty(settings.AttachDBFilename) && !settings.UserInstance &&
            string.IsNullOrEmpty(settings.FailoverPartner), "Attach, user instance e failover não são autorizados.");
        return settings.ConnectionString;
    }

    public static void ValidateSnapshot(HomologationManifest manifest, HomologationSnapshot snapshot)
    {
        Require(snapshot.ServerName.Equals(manifest.ServerName, StringComparison.OrdinalIgnoreCase) &&
            snapshot.Database == DatabaseName, "Servidor ou banco efetivo divergente.");
        Require(snapshot.LoginSid.Equals(manifest.ApplicationSid, StringComparison.OrdinalIgnoreCase) &&
            snapshot.OriginalLoginSid.Equals(manifest.ApplicationSid, StringComparison.OrdinalIgnoreCase), "Identidade efetiva divergente ou impersonada.");
        Require(!snapshot.Sysadmin && !snapshot.DbOwner, "Identidade administrativa não pode executar a homologação.");
        Require(!snapshot.CanAccessOtherDatabase, "A identidade possui acesso a outro banco de usuário.");
        Require(snapshot.CanSeeDatabases && snapshot.UserDatabases.Contains(DatabaseName) &&
            snapshot.UserDatabases.All(name => name is DatabaseName or RestoreDatabaseName),
            "A instância contém bancos não autorizados ou seu inventário não pôde ser comprovado.");
        string[] serverAllowed = ["CONNECT SQL", "VIEW ANY DATABASE", "VIEW ANY COLUMN ENCRYPTION KEY DEFINITION", "VIEW ANY COLUMN MASTER KEY DEFINITION"];
        string[] databaseAllowed = ["CONNECT", "SELECT", "INSERT", "UPDATE", "DELETE", "VIEW DEFINITION",
            "VIEW ANY COLUMN ENCRYPTION KEY DEFINITION", "VIEW ANY COLUMN MASTER KEY DEFINITION"];
        Require(snapshot.ServerPermissions.All(p => serverAllowed.Contains(p, StringComparer.OrdinalIgnoreCase)) &&
            snapshot.DatabasePermissions.All(p => databaseAllowed.Contains(p, StringComparer.OrdinalIgnoreCase)) &&
            !snapshot.CanAlterObjects && !snapshot.CanWriteMigrationHistory && !snapshot.MissingDmlPermissions,
            "Permissões excessivas ou DML insuficiente para a aplicação.");
        Require(snapshot.Encrypted, "A sessão SQL não comprovou criptografia.");
    }

    public static async Task VerifyAsync(SqlConnection connection, HomologationManifest manifest,
        CancellationToken cancellationToken = default)
    {
        try
        {
            if (connection.State != System.Data.ConnectionState.Open) await connection.OpenAsync(cancellationToken);
            await using var command = connection.CreateCommand();
            command.CommandTimeout = 10;
            command.CommandText = """
                SELECT CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')), DB_NAME(),
                  CONVERT(varchar(256),SUSER_SID(),1), CONVERT(varchar(256),SUSER_SID(ORIGINAL_LOGIN()),1),
                  IS_SRVROLEMEMBER('sysadmin'), IS_MEMBER('db_owner'),
                  HAS_PERMS_BY_NAME(NULL,NULL,'VIEW ANY DATABASE'),
                  CASE WHEN EXISTS(SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
                    WHERE HAS_PERMS_BY_NAME(QUOTENAME(s.name)+'.'+QUOTENAME(t.name),'OBJECT','ALTER')=1
                    OR HAS_PERMS_BY_NAME(QUOTENAME(s.name)+'.'+QUOTENAME(t.name),'OBJECT','CONTROL')=1) THEN 1 ELSE 0 END,
                  CASE WHEN NOT EXISTS(SELECT 1 FROM sys.tables WHERE name='AspNetUsers') OR EXISTS(
                    SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
                    WHERE t.name<>'__EFMigrationsHistory' AND (COALESCE(HAS_PERMS_BY_NAME(QUOTENAME(s.name)+'.'+QUOTENAME(t.name),'OBJECT','SELECT'),0)<>1
                    OR COALESCE(HAS_PERMS_BY_NAME(QUOTENAME(s.name)+'.'+QUOTENAME(t.name),'OBJECT','INSERT'),0)<>1
                    OR COALESCE(HAS_PERMS_BY_NAME(QUOTENAME(s.name)+'.'+QUOTENAME(t.name),'OBJECT','UPDATE'),0)<>1
                    OR COALESCE(HAS_PERMS_BY_NAME(QUOTENAME(s.name)+'.'+QUOTENAME(t.name),'OBJECT','DELETE'),0)<>1)) THEN 1 ELSE 0 END,
                  CASE WHEN COALESCE(HAS_PERMS_BY_NAME('dbo.__EFMigrationsHistory','OBJECT','INSERT'),1)<>0
                    OR COALESCE(HAS_PERMS_BY_NAME('dbo.__EFMigrationsHistory','OBJECT','UPDATE'),1)<>0
                    OR COALESCE(HAS_PERMS_BY_NAME('dbo.__EFMigrationsHistory','OBJECT','DELETE'),1)<>0 THEN 1 ELSE 0 END,
                  CASE WHEN EXISTS(SELECT 1 FROM sys.databases WHERE database_id>4 AND name<>DB_NAME()
                    AND HAS_DBACCESS(name)=1) THEN 1 ELSE 0 END;
                SELECT name FROM sys.databases WHERE database_id>4;
                SELECT permission_name FROM fn_my_permissions(NULL,'SERVER');
                SELECT permission_name FROM fn_my_permissions(NULL,'DATABASE');
                """;
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            Require(await reader.ReadAsync(cancellationToken) && Enumerable.Range(0, 11).All(i => !reader.IsDBNull(i)), "Metadados SQL incompletos.");
            var transport = new SqlConnectionStringBuilder(connection.ConnectionString);
            var encrypted = !transport.TrustServerCertificate && transport.Encrypt.ToString() is "True" or "Mandatory" or "Strict";
            var snapshot = new HomologationSnapshot(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
                reader.GetInt32(4) != 0, reader.GetInt32(5) != 0, reader.GetInt32(6) == 1, [], [], [],
                reader.GetInt32(7) != 0, reader.GetInt32(8) != 0, reader.GetInt32(9) != 0, encrypted, reader.GetInt32(10) != 0);
            async Task<string[]> NextRows()
            {
                Require(await reader.NextResultAsync(cancellationToken), "Inventário SQL incompleto.");
                var values = new List<string>();
                while (await reader.ReadAsync(cancellationToken)) values.Add(reader.GetString(0));
                return values.ToArray();
            }
            var databases = await NextRows();
            var serverPermissions = await NextRows();
            var databasePermissions = await NextRows();
            ValidateSnapshot(manifest, snapshot with { UserDatabases = databases, ServerPermissions = serverPermissions, DatabasePermissions = databasePermissions });
            await reader.DisposeAsync();
            await using var context = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(connection).Options);
            var expected = context.Database.GetMigrations().ToArray();
            var applied = (await context.Database.GetAppliedMigrationsAsync(cancellationToken)).ToArray();
            Require(expected.SequenceEqual(applied), "Histórico de migrations divergente. Nenhuma migration será aplicada.");
        }
        catch (SqlException) { throw new InvalidOperationException("A validação SQL de homologação falhou; execução bloqueada."); }
    }

    private static void Require(bool valid, string message)
    { if (!valid) throw new InvalidOperationException(message); }
}
