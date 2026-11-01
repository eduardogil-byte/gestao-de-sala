[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)][string]$ServerInstance,
    [Parameter(Mandatory)][string]$DatabaseName,
    [Parameter(Mandatory)][string]$BackupFile
)

$ErrorActionPreference = 'Stop'

if ($DatabaseName -notmatch '^[A-Za-z0-9_-]{1,128}$') {
    throw 'DatabaseName deve conter somente letras, números, hífen ou sublinhado.'
}
if ([IO.Path]::GetExtension($BackupFile) -ine '.bak' -or
    -not [IO.Path]::IsPathRooted($BackupFile) -or
    $BackupFile -notmatch '^[A-Za-z0-9 _.-]+:[\\A-Za-z0-9 _.-]+$') {
    throw 'BackupFile deve ser um caminho absoluto .bak, sem aspas ou caracteres de comando.'
}

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$fullBackupFile = [IO.Path]::GetFullPath($BackupFile)
if ($fullBackupFile.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar,
        [StringComparison]::OrdinalIgnoreCase) -or $fullBackupFile.StartsWith($repoRoot + [IO.Path]::AltDirectorySeparatorChar,
        [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Armazene o backup fora do repositório.'
}
if (-not (Test-Path -LiteralPath (Split-Path -Parent $fullBackupFile) -PathType Container)) {
    throw 'A pasta de destino deve existir e estar acessível ao operador e ao serviço SQL Server.'
}
if (Test-Path -LiteralPath $fullBackupFile) {
    throw 'O arquivo já existe. Escolha um novo nome para evitar sobrescrever ou anexar outro backupset.'
}
if (-not $PSCmdlet.ShouldProcess("$ServerInstance/$DatabaseName", "Criar backup em $fullBackupFile")) { return }

Import-Module SqlServer -ErrorAction Stop
$sqlPath = $fullBackupFile.Replace("'", "''")
$query = @"
IF DB_ID(N'$DatabaseName') IS NULL THROW 51000, 'Banco de origem não encontrado.', 1;
IF DB_ID(N'$DatabaseName') <= 4 THROW 51001, 'Backup de banco de sistema não permitido.', 1;
BACKUP DATABASE [$DatabaseName]
  TO DISK = N'$sqlPath'
  WITH COPY_ONLY, CHECKSUM, NOINIT, STATS = 10;
RESTORE VERIFYONLY FROM DISK = N'$sqlPath' WITH CHECKSUM;
"@

Invoke-Sqlcmd -ServerInstance $ServerInstance -Database master -Query $query `
    -QueryTimeout 0 -AbortOnError -ErrorAction Stop | Out-Null
Write-Output 'Backup concluído e RESTORE VERIFYONLY finalizado. Isso não substitui um teste real de restauração.'
