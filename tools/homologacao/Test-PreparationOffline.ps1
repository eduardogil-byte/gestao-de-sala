# Offline assertions only: never dot-source installation entry points or open a connection.
$ErrorActionPreference='Stop'
. "$PSScriptRoot/SqlPreparation.Common.ps1"
$errors=@()
Get-ChildItem $PSScriptRoot -Filter '*.ps1' | ForEach-Object {
    $tokens=$null; $parseErrors=$null
    [System.Management.Automation.Language.Parser]::ParseFile($_.FullName,[ref]$tokens,[ref]$parseErrors) | Out-Null
    $errors += $parseErrors
}
Assert-Hml ($errors.Count -eq 0) 'Erro de sintaxe PowerShell.'
$valid = [pscustomobject]@{
    authorizationVersion=2
    reservationId='11111111-1111-1111-1111-111111111111'; approvedForSyntheticUse=$true
    database='SalaGest_Etapa6_Testes'; serverEndpoint='localhost'; serverName='SYNTHETIC'
    applicationSid='0x0102030405060708'; maintenanceSid='0x0807060504030201'; installerSid='0x0101010101010101'
    installerOriginalLogin='MicrosoftAccount\synthetic@example.invalid'; installerOriginalSid='0x0202020202020202'
    blockedEndpoints=@('localhost\SYNTHETIC'); approvedBy='Synthetic approver'
    expiresAtUtc=[DateTimeOffset]::UtcNow.AddHours(1).ToString('o')
}
Assert-HmlAuthorization $valid
$cases=@(
    @{database='SalaGestDb'}, @{approvedForSyntheticUse=$false}, @{approvedForSyntheticUse='true'},
    @{expiresAtUtc=[DateTimeOffset]::UtcNow.AddDays(-1).ToString('o')},
    @{expiresAtUtc=[DateTimeOffset]::UtcNow.AddDays(8).ToString('o')},
    @{maintenanceSid=$valid.applicationSid}, @{installerSid=$valid.maintenanceSid},
    @{applicationSid='not-a-sid'}, @{installerOriginalSid='not-a-sid'}, @{installerOriginalLogin=''},
    @{authorizationVersion=1}, @{blockedEndpoints=@()}, @{reservationId=''}, @{approvedBy=''}
)
foreach ($case in $cases) {
    $copy=$valid | ConvertTo-Json | ConvertFrom-Json
    foreach ($key in $case.Keys) { $copy.$key=$case[$key] }
    $rejected=$false
    try { Assert-HmlAuthorization $copy } catch { $rejected=$true }
    Assert-Hml $rejected 'Manifesto inseguro foi aceito.'
}
Assert-HmlServerIdentity $valid $valid.installerSid $valid.installerSid $valid.installerOriginalLogin $valid.installerOriginalSid
$identityCases = @(
    @('0x9999999999999999',$valid.installerOriginalLogin,$valid.installerOriginalSid),
    @($valid.installerSid,'MicrosoftAccount\other@example.invalid',$valid.installerOriginalSid),
    @($valid.installerSid,$valid.installerOriginalLogin,'0x9999999999999999')
)
foreach ($snapshot in $identityCases) {
    $rejected=$false
    try { Assert-HmlServerIdentity $valid $valid.installerSid $snapshot[0] $snapshot[1] $snapshot[2] } catch { $rejected=$true }
    Assert-Hml $rejected 'Divergencia de identidade ou impersonacao foi aceita.'
}
$localManifest = $valid | ConvertTo-Json | ConvertFrom-Json
$localManifest.serverName = 'NotJohh'
foreach ($allowed in @('localhost','NotJohh','NOTJOHH')) {
    $localManifest.serverEndpoint = $allowed
    Assert-Hml ((Assert-HmlLocalDefaultEndpoint $localManifest 'NotJohh' @('MSSQLSERVER','SQLEXPRESS','MSSQLSERVEREXPRE')) -ceq 'localhost') 'Nome local equivalente foi recusado.'
}
foreach ($forbidden in @('remote.example','127.0.0.1','localhost\SQLEXPRESS','NotJohh\SQLEXPRESS','localhost\MSSQLSERVEREXPRE')) {
    $localManifest.serverEndpoint = $forbidden
    $rejected=$false
    try { Assert-HmlLocalDefaultEndpoint $localManifest 'NotJohh' @('MSSQLSERVER','SQLEXPRESS','MSSQLSERVEREXPRE') | Out-Null } catch { $rejected=$true }
    Assert-Hml $rejected 'Alias remoto ou instancia nomeada foi aceita como instancia padrao.'
}
$localManifest.serverEndpoint = 'NotJohh'
foreach ($invalidInventory in @(@('SQLEXPRESS'), @('MSSQLSERVER'))) {
    $rejected=$false
    try {
        if ($invalidInventory.Count -eq 1 -and $invalidInventory[0] -eq 'MSSQLSERVER') { $localManifest.serverName='OTHER' }
        Assert-HmlLocalDefaultEndpoint $localManifest 'NotJohh' $invalidInventory | Out-Null
    } catch { $rejected=$true }
    finally { $localManifest.serverName='NotJohh' }
    Assert-Hml $rejected 'Inventario ou identidade de computador divergente foi aceito.'
}
Assert-Hml ((Quote-HmlIdentifier 'test]name') -ceq '[test]]name]') 'Escape de identificador incorreto.'
Write-Output "OFFLINE APROVADO: parser, manifesto v2, identidades e equivalencia segura da instancia padrao; nenhuma conexao SQL."
