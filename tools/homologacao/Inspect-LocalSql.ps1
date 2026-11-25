[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
# Fixed SELECT-only metadata query. No application table, DDL, seed or migration.
$query = @'
SET NOCOUNT ON;
SELECT CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) AS ServerName,
       CONVERT(int,SERVERPROPERTY('IsIntegratedSecurityOnly')) AS WindowsOnly,
       IS_SRVROLEMEMBER('sysadmin') AS CurrentIsSysadmin;
SELECT COUNT(*) AS UserDatabaseCount FROM sys.databases WHERE database_id>4;
'@
& sqlcmd -S localhost -d master -E -l 5 -t 5 -b -W -Q $query
if ($LASTEXITCODE -ne 0) { throw 'Inspeção SQL indisponível. Não é permitido inferir isolamento.' }
Write-Output 'A ausência de bancos não aprova a reserva da instância. Identidade administrativa é aceita somente nesta inspeção de metadados.'
