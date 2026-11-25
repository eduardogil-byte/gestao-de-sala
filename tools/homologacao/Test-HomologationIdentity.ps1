[CmdletBinding()]
param([Parameter(Mandatory)][string]$ManifestPath)
. "$PSScriptRoot/SqlPreparation.Common.ps1"
Assert-HmlNonAdministrator
$m = Read-HmlAuthorization $ManifestPath
# Demand coverage of every other locally registered SQL instance, not a hand-picked subset.
$instances = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL'
$registeredNames = @($instances.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object Name)
$localEndpoints = @($registeredNames | ForEach-Object { if ($_ -ieq 'MSSQLSERVER') { 'localhost' } else { 'localhost\' + $_ } })
$c = Open-HmlConnection $m
try {
    $identity = Invoke-HmlQuery $c 'SELECT CONVERT(varchar(256),SUSER_SID(),1) Sid'
    $sid = [string]$identity.Rows[0].Sid
    Assert-Hml ($sid -iin @($m.applicationSid,$m.maintenanceSid)) 'Use a conta real de aplicacao ou manutencao.'
    Assert-HmlServer $c $m $sid
    # Only after SQL proved the approved real server do we map its registered default instance
    # to the two allowed local names: localhost or this computer's exact machine name.
    $targetEndpoint = Assert-HmlLocalDefaultEndpoint $m ([Environment]::MachineName) $registeredNames
    foreach ($endpoint in $localEndpoints) {
        if ($endpoint -ine $targetEndpoint) { Assert-Hml ($endpoint -iin @($m.blockedEndpoints)) 'Manifesto omite outra instancia local.' }
    }
    $permissions = Invoke-HmlQuery $c "SELECT permission_name FROM fn_my_permissions(NULL,'SERVER')"
    foreach ($p in $permissions.Rows) { Assert-Hml ($p.permission_name -iin @('CONNECT SQL','VIEW ANY DATABASE','VIEW ANY COLUMN ENCRYPTION KEY DEFINITION','VIEW ANY COLUMN MASTER KEY DEFINITION')) 'Privilegio de servidor excessivo, inclusive herdado.' }
    $access = Invoke-HmlQuery $c "SELECT name FROM sys.databases WHERE database_id>4 AND name<>'SalaGest_Etapa6_Testes' AND HAS_DBACCESS(name)=1"
    Assert-Hml ($access.Rows.Count -eq 0) 'Acesso a outro banco.'
} finally { $c.Dispose() }
foreach ($endpoint in $m.blockedEndpoints) {
    Assert-Hml ($endpoint -ine $m.serverEndpoint -and $endpoint -ine $targetEndpoint) 'Lista de bloqueio inclui o destino.'
    $other = [pscustomobject]@{serverEndpoint=$endpoint}
    # Authentication denial alone is proof. Timeout/TLS/network errors are inconclusive and block.
    $b = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
    $b['Data Source']=$other.serverEndpoint; $b['Initial Catalog']='master'; $b['Integrated Security']=$true
    $b['Encrypt']=$true; $b['TrustServerCertificate']=$false; $b['Connect Timeout']=5
    $test = New-Object System.Data.SqlClient.SqlConnection $b.ConnectionString
    try { $test.Open(); throw 'A identidade consegue entrar em outra instancia. Bloqueio nao comprovado.' }
    catch [System.Data.SqlClient.SqlException] { Assert-Hml ($_.Exception.Number -eq 18456) 'Falha inconclusiva: exigir rejeicao de login 18456, sem ignorar TLS/rede.' }
    finally { $test.Dispose() }
}
Write-Output 'Identidade sem privilegios de servidor excessivos e logins externos recusados. Execute tambem check/migrate-check para permissoes do banco.'
