[CmdletBinding()]
param([Parameter(Mandatory)][string]$ManifestPath)
. "$PSScriptRoot/SqlPreparation.Common.ps1"
$m = Read-HmlAuthorization $ManifestPath
$c = Open-HmlConnection $m
try {
    $t = Invoke-HmlQuery $c "SELECT CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) ServerName"
    Assert-Hml ($t.Rows[0].ServerName -ieq $m.serverName) 'Servidor real divergente.'
    Write-Output 'Conexao Windows com Encrypt=True e TrustServerCertificate=False aprovada. Execute sob cada identidade autorizada.'
} finally { $c.Dispose() }
