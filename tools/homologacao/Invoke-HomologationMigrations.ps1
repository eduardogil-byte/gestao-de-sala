[CmdletBinding()]
param([Parameter(Mandatory)][string]$ManifestPath, [switch]$AuthorizeMigrations)
. "$PSScriptRoot/SqlPreparation.Common.ps1"
Assert-HmlNonAdministrator
$m = Read-HmlAuthorization $ManifestPath
# Test with the real maintenance token, including every other local instance.
& "$PSScriptRoot/Test-HomologationIdentity.ps1" -ManifestPath $ManifestPath
$b = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
$b.DataSource=$m.serverEndpoint; $b.InitialCatalog='SalaGest_Etapa6_Testes'; $b.IntegratedSecurity=$true
$b.Encrypt=$true; $b.TrustServerCertificate=$false
$values = @{
    SALAGEST_HML_MANIFEST=$ManifestPath; ASPNETCORE_ENVIRONMENT='Homologation'; DOTNET_ENVIRONMENT='Homologation'
    Bootstrap__EnableDevelopmentSeed='false'; Authentication__InstitutionalSso__Enabled='false'
    ConnectionStrings__DefaultConnection=$b.ConnectionString; SALAGEST_HML_ALLOW_MIGRATE='NO'
}
$previous=@{}
try {
    foreach ($name in $values.Keys) { $previous[$name]=[Environment]::GetEnvironmentVariable($name,'Process'); [Environment]::SetEnvironmentVariable($name,$values[$name],'Process') }
    $tool=Join-Path $PSScriptRoot 'bin/Debug/net8.0/SalaGest.Homologacao.dll'
    Assert-Hml (Test-Path -LiteralPath $tool) 'Compile a ferramenta antes; nenhum build implicito.'
    & dotnet $tool migrate-check
    Assert-Hml ($LASTEXITCODE -eq 0) 'Manutencao bloqueada; nenhuma migration liberada.'
    if ($AuthorizeMigrations) {
        $env:SALAGEST_HML_ALLOW_MIGRATE='YES'
        & dotnet $tool migrate --confirm-migrations
        Assert-Hml ($LASTEXITCODE -eq 0) 'Migration interrompida. Revisar estado; nao repetir automaticamente.'
    }
} finally { foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name,$previous[$name],'Process') } }
