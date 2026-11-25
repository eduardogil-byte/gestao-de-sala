[CmdletBinding(DefaultParameterSetName = 'Check')]
param(
    [Parameter(Mandatory)][string]$ManifestPath,
    [Parameter(ParameterSetName = 'Start')][switch]$StartApi,
    [Parameter(Mandatory, ParameterSetName = 'Provision')][switch]$ProvisionSynthetic,
    [Parameter(Mandatory, ParameterSetName = 'Provision')][switch]$ConfirmSyntheticProvision
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/SqlPreparation.Common.ps1"
Assert-HmlNonAdministrator
& "$PSScriptRoot/Test-HomologationIdentity.ps1" -ManifestPath $ManifestPath
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$manifestFile = (Resolve-Path -LiteralPath $ManifestPath).Path
if ($manifestFile.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Mantenha o manifesto aprovado fora do repositório.'
}
$manifest = Get-Content -LiteralPath $manifestFile -Raw -Encoding utf8 | ConvertFrom-Json
$connection = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
$connection.DataSource = [string]$manifest.serverEndpoint
$connection.InitialCatalog = 'SalaGest_Etapa6_Testes'
$connection.IntegratedSecurity = $true
$connection.Encrypt = $true
$connection.TrustServerCertificate = $false
$connection.ApplicationName = 'SalaGest.Homologacao'
$values = @{
    SALAGEST_HML_MANIFEST = $manifestFile
    ASPNETCORE_ENVIRONMENT = 'Homologation'
    DOTNET_ENVIRONMENT = 'Homologation'
    Bootstrap__EnableDevelopmentSeed = 'false'
    Authentication__InstitutionalSso__Enabled = 'false'
    ConnectionStrings__DefaultConnection = $connection.ConnectionString
    Cors__FrontendOrigins__0 = 'http://127.0.0.1:5183'
    SALAGEST_HML_ALLOW_PROVISION = 'NO'
}
if ($ProvisionSynthetic -and $ConfirmSyntheticProvision) { $values.SALAGEST_HML_ALLOW_PROVISION = 'YES' }
$previous = @{}
try {
    foreach ($name in $values.Keys) {
        $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $values[$name], 'Process')
    }
    $tool = Join-Path $PSScriptRoot 'bin/Debug/net8.0/SalaGest.Homologacao.dll'
    if (-not (Test-Path -LiteralPath $tool)) { throw 'Compile a ferramenta antes. Nenhum build ou restore é implícito no lançamento.' }
    & dotnet $tool check
    if ($LASTEXITCODE -ne 0) { throw 'Homologação bloqueada pela validação. A API não será iniciada.' }
    if ($ProvisionSynthetic -and $ConfirmSyntheticProvision) {
        & dotnet $tool provision --confirm-synthetic
        if ($LASTEXITCODE -ne 0) { throw 'Provisionamento sintético não concluído.' }
    }
    if ($StartApi) {
        $api = Join-Path $repoRoot 'Backend/bin/Debug/net8.0/SalaGest.Api.dll'
        if (-not (Test-Path -LiteralPath $api)) { throw 'Compile a API antes.' }
        # Execute an already-built artifact, without launchSettings or machine User Secrets.
        & dotnet $api --contentRoot (Join-Path $repoRoot 'Backend') --urls 'http://127.0.0.1:5118'
        if ($LASTEXITCODE -ne 0) { throw 'A API de homologação foi interrompida.' }
    }
} finally {
    foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
