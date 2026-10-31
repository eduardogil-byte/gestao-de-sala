using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using SalaGest.Api.Data;
using Xunit;

namespace SalaGest.Backend.Tests;

public sealed class DbSeedStartupTests
{
    [Fact]
    public void SeedIsDisabledWithoutExplicitConfiguration()
    {
        var config = new ConfigurationBuilder().Build();

        Assert.False(DbSeed.ShouldRunAtStartup(config, Environment("Development")));
        Assert.False(DbSeed.ShouldRunAtStartup(config, Environment("Production")));
    }

    [Fact]
    public void ExplicitSeedIsAllowedOnlyInDevelopment()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Bootstrap:EnableDevelopmentSeed"] = "true"
            })
            .Build();

        Assert.True(DbSeed.ShouldRunAtStartup(config, Environment("Development")));
        Assert.Throws<InvalidOperationException>(() =>
            DbSeed.ShouldRunAtStartup(config, Environment("Production")));
        Assert.Throws<InvalidOperationException>(() =>
            DbSeed.ShouldRunAtStartup(config, Environment("Staging")));
    }

    [Fact]
    public void TrustingSqlServerCertificateIsRejectedOutsideDevelopment()
    {
        const string untrustedCertificate = "Server=sql.example;Database=SalaGest;TrustServerCertificate=True";
        const string validatedCertificate = "Server=sql.example;Database=SalaGest;TrustServerCertificate=False";

        SqlServerConnectionPolicy.Validate(untrustedCertificate, Environment("Development"));
        Assert.Throws<InvalidOperationException>(() =>
            SqlServerConnectionPolicy.Validate(untrustedCertificate, Environment("Staging")));
        SqlServerConnectionPolicy.Validate(validatedCertificate, Environment("Staging"));
    }

    private static IHostEnvironment Environment(string name) => new TestHostEnvironment(name);

    private sealed class TestHostEnvironment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "SalaGest.Tests";
        public string ContentRootPath { get; set; } = Directory.GetCurrentDirectory();
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
