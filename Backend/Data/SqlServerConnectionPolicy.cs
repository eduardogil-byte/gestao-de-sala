using Microsoft.Data.SqlClient;

namespace SalaGest.Api.Data;

public static class SqlServerConnectionPolicy
{
    public static void Validate(string connectionString, IHostEnvironment environment)
    {
        if (environment.IsDevelopment())
            return;

        var settings = new SqlConnectionStringBuilder(connectionString);
        if (settings.TrustServerCertificate)
            throw new InvalidOperationException(
                "A connection string do SQL Server deve validar o certificado fora de Development.");
    }
}
