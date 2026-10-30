[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)][string]$ServerInstance,
    [Parameter(Mandatory)][string]$BackupFile,
    [Parameter(Mandatory)][string]$DestinationDatabaseName,
    [Parameter(Mandatory)][string]$DataDirectory,
    [Parameter(Mandatory)][string]$LogDirectory
)

$ErrorActionPreference = 'Stop'

if ($DestinationDatabaseName -notmatch '^SalaGestRestore_[A-Za-z0-9_-]{1,100}$') {
    throw 'Use um banco de destino isolado com o prefixo SalaGestRestore_.'
}
foreach ($path in @($BackupFile, $DataDirectory, $LogDirectory)) {
    if (-not [IO.Path]::IsPathRooted($path) -or
        $path -notmatch '^[A-Za-z0-9 _.-]+:[\\A-Za-z0-9 _.-]+$') {
        throw 'Informe caminhos absolutos sem aspas ou caracteres de comando.'
    }
}

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
function Assert-OutsideRepository([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if ($full.Equals($repoRoot, [StringComparison]::OrdinalIgnoreCase) -or
        $full.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar,
            [StringComparison]::OrdinalIgnoreCase) -or $full.StartsWith($repoRoot + [IO.Path]::AltDirectorySeparatorChar,
            [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Backups e arquivos restaurados devem permanecer fora do repositório.'
    }
    return $full
}

$backup = Assert-OutsideRepository $BackupFile
$dataRoot = Assert-OutsideRepository $DataDirectory
$logRoot = Assert-OutsideRepository $LogDirectory
if (-not (Test-Path -LiteralPath $backup -PathType Leaf)) { throw 'Arquivo de backup não encontrado.' }
if (-not (Test-Path -LiteralPath $dataRoot -PathType Container) -or
    -not (Test-Path -LiteralPath $logRoot -PathType Container)) {
    throw 'As pastas de dados e log devem existir e estar acessíveis ao serviço SQL Server.'
}

Import-Module SqlServer -ErrorAction Stop
$sqlBackup = $backup.Replace("'", "''")
$header = Invoke-Sqlcmd -ServerInstance $ServerInstance -Database master `
    -Query "RESTORE HEADERONLY FROM DISK = N'$sqlBackup';" -AbortOnError -ErrorAction Stop
$fullBackups = @($header | Where-Object { $_.BackupType -eq 1 })
if ($fullBackups.Count -ne 1) {
    throw 'O arquivo deve conter exatamente um backup completo. Selecione um backupset separado.'
}
$sourceDatabaseName = [string]$fullBackups[0].DatabaseName
if ($sourceDatabaseName -eq $DestinationDatabaseName) {
    throw 'O destino não pode ter o mesmo nome do banco de origem.'
}

Invoke-Sqlcmd -ServerInstance $ServerInstance -Database master `
    -Query "RESTORE VERIFYONLY FROM DISK = N'$sqlBackup' WITH CHECKSUM;" `
    -AbortOnError -ErrorAction Stop | Out-Null
$files = @(Invoke-Sqlcmd -ServerInstance $ServerInstance -Database master `
    -Query "RESTORE FILELISTONLY FROM DISK = N'$sqlBackup';" -AbortOnError -ErrorAction Stop)
if ($files.Count -eq 0 -or @($files | Where-Object { $_.Type -notin @('D', 'L') }).Count -gt 0) {
    throw 'A lista de arquivos do backup está vazia ou contém tipos não suportados pelo procedimento.'
}

$moves = foreach ($file in $files) {
    $safeLogicalName = ([string]$file.LogicalName -replace '[^A-Za-z0-9_-]', '_')
    $extension = if ($file.Type -eq 'L') { '.ldf' } elseif ($file.FileId -eq 1) { '.mdf' } else { '.ndf' }
    $root = if ($file.Type -eq 'L') { $logRoot } else { $dataRoot }
    $target = Join-Path $root "${DestinationDatabaseName}-$safeLogicalName-$($file.FileId)$extension"
    if (Test-Path -LiteralPath $target) { throw "O arquivo de destino já existe: $target" }
    $sqlTarget = $target.Replace("'", "''")
    $logical = ([string]$file.LogicalName).Replace("'", "''")
    "MOVE N'$logical' TO N'$sqlTarget'"
}

$exists = Invoke-Sqlcmd -ServerInstance $ServerInstance -Database master `
    -Query "SELECT DB_ID(N'$DestinationDatabaseName') AS ExistingDatabaseId;" -ErrorAction Stop
if ($null -ne $exists.ExistingDatabaseId -and $exists.ExistingDatabaseId -isnot [DBNull]) {
    throw 'O banco de destino já existe; nenhum banco será sobrescrito.'
}

$confirmation = "Restaurar $sourceDatabaseName como $DestinationDatabaseName em pastas isoladas"
if (-not $PSCmdlet.ShouldProcess($ServerInstance, $confirmation)) { return }
$moveClause = $moves -join ",`n  "
$restoreQuery = @"
RESTORE DATABASE [$DestinationDatabaseName]
  FROM DISK = N'$sqlBackup'
  WITH $moveClause, CHECKSUM, RECOVERY, STATS = 10;
"@
Invoke-Sqlcmd -ServerInstance $ServerInstance -Database master -Query $restoreQuery `
    -QueryTimeout 0 -AbortOnError -ErrorAction Stop | Out-Null
Write-Output "Restauração isolada concluída em $DestinationDatabaseName. Execute a verificação funcional e de migrations antes de considerar a recuperação validada."
