using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Data;
using SalaGest.Api.Models;
using SalaGest.Api.Services;
using SalaGest.Homologacao;
using Xunit;

namespace SalaGest.Backend.Tests;

public sealed class HomologationSafetyTests
{
    private static readonly DateTimeOffset Now = new(2027, 1, 1, 0, 0, 0, TimeSpan.Zero);
    private static HomologationManifest Approved() => new()
    {
        AuthorizationVersion = 2,
        ApprovedForSyntheticUse = true, ApprovedBy = "Responsável fictício", ExpiresAtUtc = Now.AddDays(1),
        ServerEndpoint = "localhost", ServerName = "SYNTHETIC", Database = HomologationSafety.DatabaseName,
        ApplicationSid = "0x0102030405060708", MaintenanceSid = "0x0807060504030201",
        InstallerSid = "0x0101010101010101", InstallerOriginalLogin = "MicrosoftAccount\\synthetic@example.invalid",
        InstallerOriginalSid = "0x0202020202020202"
    };
    private const string Connection = "Server=localhost;Database=SalaGest_Etapa6_Testes;Integrated Security=True;Encrypt=True;TrustServerCertificate=False";
    private static HomologationSnapshot Valid() => new("SYNTHETIC", HomologationSafety.DatabaseName,
        Approved().ApplicationSid, Approved().ApplicationSid, false, false, true,
        [HomologationSafety.DatabaseName], ["CONNECT SQL", "VIEW ANY DATABASE"], ["CONNECT"], false, false, false, true);

    [Fact]
    public void ExplicitApprovedSettingsAndLeastPrivilegeSnapshotAreAcceptedWithoutConnecting()
    {
        Assert.NotEmpty(HomologationSafety.RequiredConnection(Approved(), Connection, "false", "false", Now));
        HomologationSafety.ValidateSnapshot(Approved(), Valid());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("Server=localhost;Database=SalaGestDb;Integrated Security=True;Encrypt=True")]
    [InlineData("Server=localhost\\SQLEXPRESS;Database=SalaGest_Etapa6_Testes;Integrated Security=True;Encrypt=True")]
    [InlineData("Server=localhost;Database=SalaGest_Etapa6_Testes;Integrated Security=True;Encrypt=False")]
    [InlineData("Server=localhost;Database=SalaGest_Etapa6_Testes;Integrated Security=True;TrustServerCertificate=True")]
    [InlineData("Server=localhost;Database=SalaGest_Etapa6_Testes;Integrated Security=False;Encrypt=True")]
    public void MissingFallbackWrongDestinationAndInsecureTransportAreRejected(string? connection)
        => Assert.Throws<InvalidOperationException>(() => HomologationSafety.RequiredConnection(Approved(), connection, "false", "false", Now));

    [Fact]
    public void ReservationExpirySeedSsoAndSharedIdentityAreRejected()
    {
        foreach (var manifest in new[] { Approved() with { AuthorizationVersion = 1 }, Approved() with { ApprovedForSyntheticUse = false }, Approved() with { ExpiresAtUtc = Now },
            Approved() with { MaintenanceSid = Approved().ApplicationSid }, Approved() with { Database = "SalaGestDb" },
            Approved() with { ExpiresAtUtc = Now.AddDays(8) } })
            Assert.Throws<InvalidOperationException>(() => HomologationSafety.RequiredConnection(manifest, Connection, "false", "false", Now));
        Assert.Throws<InvalidOperationException>(() => HomologationSafety.RequiredConnection(Approved(), Connection, null, "false", Now));
        Assert.Throws<InvalidOperationException>(() => HomologationSafety.RequiredConnection(Approved(), Connection, "false", "true", Now));
    }

    [Fact]
    public void AdministrativeUnknownCrossDatabaseAndImpersonatedSnapshotsAreRejected()
    {
        foreach (var snapshot in new[] {
            Valid() with { ServerName = "OTHER" }, Valid() with { Database = "SalaGestDb" },
            Valid() with { LoginSid = Approved().MaintenanceSid }, Valid() with { OriginalLoginSid = Approved().MaintenanceSid },
            Valid() with { Sysadmin = true }, Valid() with { DbOwner = true }, Valid() with { CanSeeDatabases = false },
            Valid() with { UserDatabases = [HomologationSafety.DatabaseName, "SalaGestDb"] },
            Valid() with { UserDatabases = [] }, Valid() with { ServerPermissions = ["CONTROL SERVER"] },
            Valid() with { DatabasePermissions = ["CREATE TABLE"] }, Valid() with { CanAlterObjects = true },
            Valid() with { MissingDmlPermissions = true }, Valid() with { CanWriteMigrationHistory = true },
            Valid() with { Encrypted = false }, Valid() with { CanAccessOtherDatabase = true } })
            Assert.Throws<InvalidOperationException>(() => HomologationSafety.ValidateSnapshot(Approved(), snapshot));
    }

    [Fact]
    public void SyntheticFixtureBuildsCompleteGraphWithoutOpeningAnyDatabase()
    {
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(Connection).Options);
        SyntheticFixture.Add(db, new AppUser { Id = "synthetic-1" }, new AppUser { Id = "synthetic-2" });
        T[] Entries<T>() where T : class => db.ChangeTracker.Entries<T>().Select(e => e.Entity).ToArray();
        Assert.Equal(2, Entries<Semester>().Length);
        Assert.Equal(3, Entries<ClassGroup>().Length);
        Assert.Equal(3, Entries<Room>().Length);
        Assert.Equal(new[] { 8m, 10m }, Entries<CurricularCapability>().Select(c => c.RequiredHours).Order().ToArray());
        Assert.Contains(Entries<ComputerGroup>(), group => group.OperationalQuantity is null);
        Assert.Contains(Entries<GroupSoftware>(), software => software.LicenseQuantity is null);
        Assert.Contains(Entries<GroupSoftware>(), software => software.LicenseExpiresOn == new DateOnly(2020, 1, 1));
        Assert.Contains(Entries<GroupSoftware>(), software => software.LicenseExpiresOn == new DateOnly(2099, 12, 31));
        Assert.Empty(Entries<BookingRequest>());
        Assert.Empty(Entries<RoomOccupation>());
        Assert.All(Entries<AppUser>(), user => Assert.Null(user.Cpf));
        Assert.Equal(System.Data.ConnectionState.Closed, db.Database.GetDbConnection().State);
    }
}
