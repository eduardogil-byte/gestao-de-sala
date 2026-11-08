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
    reservationId='11111111-1111-1111-1111-111111111111'; approvedForSyntheticUse=$true
    database='SalaGest_Etapa6_Testes'; serverEndpoint='localhost'; serverName='SYNTHETIC'
    applicationSid='0x0102030405060708'; maintenanceSid='0x0807060504030201'; installerSid='0x0101010101010101'
    blockedEndpoints=@('localhost\SYNTHETIC'); approvedBy='Synthetic approver'
    expiresAtUtc=[DateTimeOffset]::UtcNow.AddHours(1).ToString('o')
}
Assert-HmlAuthorization $valid
$cases=@(
    @{database='SalaGestDb'}, @{approvedForSyntheticUse=$false}, @{approvedForSyntheticUse='true'},
    @{expiresAtUtc=[DateTimeOffset]::UtcNow.AddDays(-1).ToString('o')},
    @{expiresAtUtc=[DateTimeOffset]::UtcNow.AddDays(8).ToString('o')},
    @{maintenanceSid=$valid.applicationSid}, @{installerSid=$valid.maintenanceSid},
    @{applicationSid='not-a-sid'}, @{blockedEndpoints=@()}, @{reservationId=''}, @{approvedBy=''}
)
foreach ($case in $cases) {
    $copy=$valid | ConvertTo-Json | ConvertFrom-Json
    foreach ($key in $case.Keys) { $copy.$key=$case[$key] }
    $rejected=$false
    try { Assert-HmlAuthorization $copy } catch { $rejected=$true }
    Assert-Hml $rejected 'Manifesto inseguro foi aceito.'
}
Assert-Hml ((Quote-HmlIdentifier 'test]name') -ceq '[test]]name]') 'Escape de identificador incorreto.'
Write-Output "OFFLINE APROVADO: parser, manifesto valido, $($cases.Count) recusas e escape de identificador; nenhuma conexao SQL."
