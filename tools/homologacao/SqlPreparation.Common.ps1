Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Hml($Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

function Read-HmlAuthorization([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    $repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
    Assert-Hml ([IO.Path]::IsPathRooted($Path) -and -not $full.StartsWith($repo + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) 'Manifesto deve estar fora do repositorio, em caminho absoluto.'
    $m = Get-Content -LiteralPath $full -Raw -Encoding UTF8 | ConvertFrom-Json
    Assert-HmlAuthorization $m
    return $m
}

function Assert-HmlAuthorization($m) {
    $reservation = [guid]::Empty
    Assert-Hml ([guid]::TryParse([string]$m.reservationId, [ref]$reservation) -and $reservation -ne [guid]::Empty) 'Identificador de reserva obrigatorio.'
    Assert-Hml ($m.approvedForSyntheticUse -is [bool] -and $m.approvedForSyntheticUse -eq $true -and $m.database -ceq 'SalaGest_Etapa6_Testes') 'Reserva ou banco nao autorizado.'
    $expiry = [DateTimeOffset]::Parse($m.expiresAtUtc)
    Assert-Hml ($expiry -gt [DateTimeOffset]::UtcNow -and $expiry -le [DateTimeOffset]::UtcNow.AddDays(7)) 'Autorizacao expirada ou superior a sete dias.'
    Assert-Hml (-not [string]::IsNullOrWhiteSpace($m.approvedBy) -and -not [string]::IsNullOrWhiteSpace($m.serverName) -and -not [string]::IsNullOrWhiteSpace($m.serverEndpoint)) 'Reserva incompleta.'
    $sids = @($m.applicationSid, $m.maintenanceSid, $m.installerSid)
    foreach ($sid in $sids) { Assert-Hml ($sid -cmatch '^0x[0-9A-Fa-f]{16,}$') 'SID hexadecimal obrigatorio.' }
    Assert-Hml (@($sids | ForEach-Object { $_.ToUpperInvariant() } | Select-Object -Unique).Count -eq 3) 'Instalador, manutencao e aplicacao devem ser distintos.'
    Assert-Hml (@($m.blockedEndpoints).Count -gt 0) 'Declare as demais instancias a verificar.'
}

function Open-HmlConnection($Manifest, [string]$Database = 'master') {
    Assert-Hml ($Database -cin @('master','SalaGest_Etapa6_Testes')) 'Banco proibido.'
    $b = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
    $b.DataSource = $Manifest.serverEndpoint
    $b.InitialCatalog = $Database
    $b.IntegratedSecurity = $true
    $b.Encrypt = $true
    $b.TrustServerCertificate = $false
    $b.ConnectTimeout = 5
    $b.ApplicationName = 'SalaGest.Homologacao.Preparation'
    $c = New-Object System.Data.SqlClient.SqlConnection $b.ConnectionString
    try { $c.Open() } catch { $c.Dispose(); throw 'Conexao/TLS recusados. Nenhum bypass e permitido.' }
    return $c
}

function Invoke-HmlQuery($Connection, [string]$Sql) {
    $cmd = $Connection.CreateCommand()
    $cmd.CommandTimeout = 60
    $cmd.CommandText = $Sql
    try {
        $table = New-Object System.Data.DataTable
        $reader = $cmd.ExecuteReader()
        try { if ($reader.FieldCount -gt 0) { $table.Load($reader) } } finally { $reader.Dispose() }
        return ,$table
    } finally { $cmd.Dispose() }
}

function Assert-HmlServer($Connection, $Manifest, [string]$Sid) {
    $t = Invoke-HmlQuery $Connection "SELECT CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) ServerName, CONVERT(varchar(256),SUSER_SID(),1) Sid, CONVERT(varchar(256),SUSER_SID(ORIGINAL_LOGIN()),1) OriginalSid, HAS_PERMS_BY_NAME(NULL,NULL,'VIEW ANY DATABASE') CanSee"
    Assert-Hml ($t.Rows.Count -eq 1 -and $t.Rows[0].ServerName -ieq $Manifest.serverName -and $t.Rows[0].Sid -ieq $Sid -and $t.Rows[0].OriginalSid -ieq $Sid -and $t.Rows[0].CanSee -eq 1) 'Servidor, identidade ou visibilidade divergente.'
    $dbs = Invoke-HmlQuery $Connection 'SELECT name FROM sys.databases WHERE database_id>4'
    foreach ($row in $dbs.Rows) { Assert-Hml ($row.name -ceq 'SalaGest_Etapa6_Testes') 'Instancia nao exclusiva; banco inesperado. Interrompa.' }
}

function Quote-HmlIdentifier([string]$Name) {
    Assert-Hml (-not [string]::IsNullOrWhiteSpace($Name) -and $Name.Length -le 128) 'Identificador invalido.'
    return '[' + $Name.Replace(']', ']]') + ']'
}

function Assert-HmlNonAdministrator {
    $p = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
    Assert-Hml (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) 'Nao use sessao Windows elevada para aplicacao/manutencao.'
}
