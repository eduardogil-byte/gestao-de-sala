using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace SalaGest.Api.Data;

// Permite gerar migrations sem iniciar a API ou executar o seed antes da criação das tabelas.
public sealed class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var environment = Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT")
            ?? Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
        var development = string.Equals(environment, "Development", StringComparison.OrdinalIgnoreCase);
        // A factory só precisa da conexão. Em Development, não herdar o banco do arquivo base.
        var config = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile(development ? "appsettings.Development.json" : "appsettings.json", optional: false)
            .AddEnvironmentVariables()
            .Build();
        var connection = config.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection não configurada");
        if (string.IsNullOrWhiteSpace(connection))
            throw new InvalidOperationException("ConnectionStrings:DefaultConnection vazia");
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer(connection).Options;
        return new AppDbContext(options);
    }
}
