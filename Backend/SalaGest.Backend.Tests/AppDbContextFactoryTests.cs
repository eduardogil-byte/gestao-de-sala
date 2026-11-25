using System.Data;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SalaGest.Api.Data;
using Xunit;

namespace SalaGest.Backend.Tests;

[CollectionDefinition("Factory configuration", DisableParallelization = true)]
public sealed class FactoryConfigurationCollection { }

[Collection("Factory configuration")]
public sealed class AppDbContextFactoryTests
{
    [Theory]
    [InlineData(null, "Development", null, "LocalOnly")]
    [InlineData("Development", "Production", null, "LocalOnly")]
    [InlineData("Development", null, "EnvironmentOnly", "EnvironmentOnly")]
    [InlineData("Production", "Development", null, "BaseOnly")]
    public void SelectsEnvironmentAndHonorsConnectionOverrideWithoutConnecting(
        string? dotnet, string? aspnet, string? overrideDatabase, string expected)
    {
        WithConfiguration(dotnet, aspnet, overrideDatabase, path =>
        {
            WriteConfig(path, "appsettings.Development.json", "LocalOnly");
            using var context = new AppDbContextFactory().CreateDbContext([]);
            var connection = context.Database.GetDbConnection();
            Assert.Equal(expected, connection.Database);
            Assert.Equal(ConnectionState.Closed, connection.State);
        });
    }

    [Fact]
    public void MissingDevelopmentFileDoesNotFallBackToBaseDatabase()
        => WithConfiguration("Development", null, null, _ =>
            Assert.Throws<FileNotFoundException>(() => new AppDbContextFactory().CreateDbContext([])));

    [Theory]
    [InlineData("{}")]
    [InlineData("{\"ConnectionStrings\":{\"DefaultConnection\":\"\"}}")]
    public void MissingOrEmptyLocalConnectionDoesNotFallBackToBaseDatabase(string json)
        => WithConfiguration("Development", null, null, path =>
        {
            File.WriteAllText(Path.Combine(path, "appsettings.Development.json"), json);
            Assert.Throws<InvalidOperationException>(() => new AppDbContextFactory().CreateDbContext([]));
        });

    private static void WithConfiguration(string? dotnet, string? aspnet, string? overrideDatabase, Action<string> test)
    {
        string[] keys = ["DOTNET_ENVIRONMENT", "ASPNETCORE_ENVIRONMENT",
            "ConnectionStrings__DefaultConnection", "SQLCONNSTR_DefaultConnection",
            "SQLAZURECONNSTR_DefaultConnection", "CUSTOMCONNSTR_DefaultConnection"];
        var previous = keys.ToDictionary(key => key, Environment.GetEnvironmentVariable);
        var directory = Directory.GetCurrentDirectory();
        var path = Path.Combine(Path.GetTempPath(), "SalaGestFactoryTests-" + Guid.NewGuid());
        Directory.CreateDirectory(path);
        try
        {
            foreach (var key in keys) Environment.SetEnvironmentVariable(key, null);
            Environment.SetEnvironmentVariable(keys[0], dotnet);
            Environment.SetEnvironmentVariable(keys[1], aspnet);
            if (overrideDatabase is not null)
                Environment.SetEnvironmentVariable(keys[2], Connection(overrideDatabase));
            WriteConfig(path, "appsettings.json", "BaseOnly");
            Directory.SetCurrentDirectory(path);
            test(path);
        }
        finally
        {
            Directory.SetCurrentDirectory(directory);
            foreach (var entry in previous) Environment.SetEnvironmentVariable(entry.Key, entry.Value);
            Directory.Delete(path, recursive: true);
        }
    }

    private static string Connection(string database)
        => $"Server=synthetic.invalid;Database={database};Integrated Security=True;Encrypt=True;TrustServerCertificate=False";

    private static void WriteConfig(string path, string file, string database)
        => File.WriteAllText(Path.Combine(path, file), JsonSerializer.Serialize(new
        {
            ConnectionStrings = new { DefaultConnection = Connection(database) }
        }));
}
