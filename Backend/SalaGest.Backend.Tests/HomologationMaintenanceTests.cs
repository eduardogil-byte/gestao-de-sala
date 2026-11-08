using SalaGest.Api.Services;
using SalaGest.Homologacao;
using Xunit;

namespace SalaGest.Backend.Tests;

public sealed class HomologationMaintenanceTests
{
    private static readonly HomologationManifest Manifest = new()
    {
        ServerName = "SYNTHETIC", Database = HomologationSafety.DatabaseName,
        ApplicationSid = "0x0102030405060708", MaintenanceSid = "0x0807060504030201"
    };
    private static readonly string[] Migrations = Enumerable.Range(1,16).Select(i => $"Migration{i:D2}").ToArray();

    [Fact]
    public void AcceptsEmptyOrMatchingPrefixHistoryWithoutOpeningConnection()
    {
        foreach (var count in new[] {0, 7, 16})
            Check(applied: Migrations.Take(count).ToArray());
    }

    [Theory]
    [InlineData("server")]
    [InlineData("database")]
    [InlineData("application")]
    [InlineData("impersonation")]
    [InlineData("sysadmin")]
    [InlineData("owner")]
    [InlineData("otherAccess")]
    [InlineData("otherDatabase")]
    [InlineData("serverPrivilege")]
    [InlineData("databasePrivilege")]
    [InlineData("missingVisibility")]
    [InlineData("unknownHistory")]
    [InlineData("wrongCount")]
    public void RejectsUnsafeMaintenanceSnapshots(string failure)
    {
        Assert.Throws<InvalidOperationException>(() => Check(failure));
    }

    private static void Check(string failure = "", string[]? applied = null)
        => MaintenanceRunner.Validate(failure == "server" ? "OTHER" : Manifest.ServerName,
            failure == "database" ? "SalaGestDb" : Manifest.Database,
            failure == "application" ? Manifest.ApplicationSid : Manifest.MaintenanceSid,
            failure == "impersonation" ? Manifest.ApplicationSid : Manifest.MaintenanceSid,
            failure == "sysadmin", failure == "owner", failure == "otherAccess",
            failure == "otherDatabase" ? [Manifest.Database,"Other"] : [Manifest.Database],
            failure == "serverPrivilege" ? ["CONTROL SERVER","VIEW ANY DATABASE"] : failure == "missingVisibility" ? [] : ["CONNECT SQL","VIEW ANY DATABASE"],
            failure == "databasePrivilege" ? ["CONTROL"] : ["CONNECT","CREATE TABLE","SELECT","INSERT","UPDATE","DELETE","VIEW DEFINITION"],
            failure == "wrongCount" ? Migrations.Take(15).ToArray() : Migrations,
            failure == "unknownHistory" ? ["Unknown"] : applied ?? [], Manifest);
}
