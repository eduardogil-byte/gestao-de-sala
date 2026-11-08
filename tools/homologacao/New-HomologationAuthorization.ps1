[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$OutputPath,
    [Parameter(Mandatory)][string]$ServerEndpoint,
    [Parameter(Mandatory)][string]$ServerName,
    [Parameter(Mandatory)][string]$ApplicationSid,
    [Parameter(Mandatory)][string]$MaintenanceSid,
    [Parameter(Mandatory)][string]$InstallerSid,
    [Parameter(Mandatory)][string[]]$BlockedEndpoints,
    [Parameter(Mandatory)][string]$ApprovedBy,
    [Parameter(Mandatory)][DateTimeOffset]$ExpiresAtUtc,
    [Parameter(Mandatory)][switch]$ApproveExclusiveReservation
)
. "$PSScriptRoot/SqlPreparation.Common.ps1"
Assert-Hml $ApproveExclusiveReservation.IsPresent 'Aprovacao explicita obrigatoria.'
Assert-Hml (-not (Test-Path -LiteralPath $OutputPath)) 'Nao sobrescrever manifesto existente.'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Assert-Hml ([IO.Path]::IsPathRooted($OutputPath) -and -not [IO.Path]::GetFullPath($OutputPath).StartsWith($repo + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) 'Use diretorio externo previamente protegido por ACL.'
Assert-Hml ($ExpiresAtUtc -gt [DateTimeOffset]::UtcNow -and $ExpiresAtUtc -le [DateTimeOffset]::UtcNow.AddDays(7)) 'Validade maxima sete dias.'
$m = [ordered]@{approvedForSyntheticUse=$true; serverEndpoint=$ServerEndpoint; serverName=$ServerName; database='SalaGest_Etapa6_Testes'; applicationSid=$ApplicationSid; maintenanceSid=$MaintenanceSid; installerSid=$InstallerSid; blockedEndpoints=$BlockedEndpoints; approvedBy=$ApprovedBy; expiresAtUtc=$ExpiresAtUtc.ToUniversalTime().ToString('o')}
$m.reservationId = [guid]::NewGuid().ToString()
Assert-HmlAuthorization ([pscustomobject]$m)
# Reservation is an attestation, not a lock or a server configuration change.
# CreateNew prevents accidental overwrite. Parent directory ACL must already be restricted.
$stream = [IO.File]::Open($OutputPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
try {
    $bytes = [Text.Encoding]::UTF8.GetBytes(($m | ConvertTo-Json))
    $stream.Write($bytes, 0, $bytes.Length)
} finally { $stream.Dispose() }
Read-HmlAuthorization $OutputPath | Out-Null
Write-Output 'Manifesto externo criado; valide ACL e reserva antes de qualquer escrita SQL.'
