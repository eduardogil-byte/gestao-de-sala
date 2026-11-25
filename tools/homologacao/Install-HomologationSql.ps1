[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ManifestPath,
    [ValidateSet('Inspect','CreateDatabase','ConfigureLogins','GrantApplication')][string]$Operation = 'Inspect',
    [string]$ApplicationAccount,
    [string]$MaintenanceAccount,
    [switch]$AuthorizeWrite
)
. "$PSScriptRoot/SqlPreparation.Common.ps1"
$m = Read-HmlAuthorization $ManifestPath
if ($Operation -ne 'Inspect') { Assert-Hml $AuthorizeWrite.IsPresent 'Escrita exige -AuthorizeWrite e aprovacao separada.' }
$c = Open-HmlConnection $m
try {
    Assert-HmlServer $c $m $m.installerSid
    $admin = Invoke-HmlQuery $c "SELECT IS_SRVROLEMEMBER('sysadmin') IsAdmin"
    Assert-Hml ($admin.Rows[0].IsAdmin -eq 1) 'Instalador SQL administrativo autorizado obrigatorio.'
    if ($Operation -eq 'Inspect') { Write-Output 'Destino/TLS/instalador/reserva conferidos; nenhuma escrita.'; return }
    if ($Operation -eq 'CreateDatabase') {
        $existing = Invoke-HmlQuery $c "SELECT name FROM sys.databases WHERE name=N'SalaGest_Etapa6_Testes'"
        Assert-Hml ($existing.Rows.Count -eq 0) 'Banco ja existe; criacao recusada, sem reutilizacao automatica.'
        Invoke-HmlQuery $c 'CREATE DATABASE [SalaGest_Etapa6_Testes]' | Out-Null
        $reservation = ([guid]$m.reservationId).ToString()
        Invoke-HmlQuery $c "USE [SalaGest_Etapa6_Testes]; EXEC sys.sp_addextendedproperty @name=N'SalaGestHomologationReservation', @value=N'$reservation';" | Out-Null
        return
    }
    $marker = Invoke-HmlQuery $c "USE [SalaGest_Etapa6_Testes]; SELECT CONVERT(nvarchar(36),value) ReservationId FROM sys.extended_properties WHERE class=0 AND name=N'SalaGestHomologationReservation'"
    Assert-Hml ($marker.Rows.Count -eq 1 -and $marker.Rows[0].ReservationId -ieq ([guid]$m.reservationId).ToString()) 'Banco sem marca da reserva: proibido reutilizar banco existente.'
    if ($Operation -eq 'ConfigureLogins') {
        foreach ($name in @($ApplicationAccount,$MaintenanceAccount)) { Assert-Hml ($name -match '^[A-Za-z0-9_.-]+\\[A-Za-z0-9_.-]+$') 'Use conta Windows individual no formato DOMINIO\conta, sem caracteres especiais.' }
        $app = Quote-HmlIdentifier $ApplicationAccount
        $maint = Quote-HmlIdentifier $MaintenanceAccount
        # Resolve Windows SIDs before creating any login; never grant to a group.
        foreach ($pair in @(@($ApplicationAccount,$m.applicationSid),@($MaintenanceAccount,$m.maintenanceSid))) {
            $account = New-Object Security.Principal.NTAccount $pair[0]
            $sid = $account.Translate([Security.Principal.SecurityIdentifier])
            $bytes = New-Object byte[] $sid.BinaryLength
            $sid.GetBinaryForm($bytes,0)
            $hex = '0x' + [BitConverter]::ToString($bytes).Replace('-','')
            Assert-Hml ($hex -ieq $pair[1]) 'Conta Windows e SID aprovado divergem.'
        }
        $sql = @"
USE [SalaGest_Etapa6_Testes];
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF SUSER_ID(N'$($ApplicationAccount.Replace("'","''"))') IS NOT NULL OR SUSER_ID(N'$($MaintenanceAccount.Replace("'","''"))') IS NOT NULL
 THROW 51000, 'Logins existentes: revisar manualmente, sem alterar permissoes automaticamente.', 1;
CREATE LOGIN $app FROM WINDOWS;
CREATE LOGIN $maint FROM WINDOWS;
IF EXISTS(SELECT 1 FROM sys.server_principals WHERE name IN (N'$($ApplicationAccount.Replace("'","''"))',N'$($MaintenanceAccount.Replace("'","''"))') AND type <> 'U')
 THROW 51000, 'Somente contas Windows individuais.', 1;
USE [master];
GRANT CONNECT SQL TO $app;
GRANT CONNECT SQL TO $maint;
GRANT VIEW ANY DATABASE TO $app;
GRANT VIEW ANY DATABASE TO $maint;
USE [SalaGest_Etapa6_Testes];
CREATE USER $app FOR LOGIN $app;
CREATE USER $maint FOR LOGIN $maint;
EXECUTE AS LOGIN = N'$($ApplicationAccount.Replace("'","''"))';
IF COALESCE(IS_SRVROLEMEMBER('sysadmin'),1)<>0 OR COALESCE(IS_MEMBER('db_owner'),1)<>0
 THROW 51000, 'Aplicacao herda privilegios administrativos. Interrompa e revise os grupos.', 1;
REVERT;
EXECUTE AS LOGIN = N'$($MaintenanceAccount.Replace("'","''"))';
IF COALESCE(IS_SRVROLEMEMBER('sysadmin'),1)<>0 OR COALESCE(IS_MEMBER('db_owner'),1)<>0
 THROW 51000, 'Manutencao herda privilegios administrativos. Interrompa e revise os grupos.', 1;
REVERT;
GRANT CREATE TABLE TO $maint;
GRANT ALTER, REFERENCES ON SCHEMA::dbo TO $maint;
GRANT CONNECT, SELECT, INSERT, UPDATE, DELETE, VIEW DEFINITION TO $maint;
GRANT CONNECT, VIEW DEFINITION TO $app;
COMMIT;
"@
        Invoke-HmlQuery $c $sql | Out-Null
        Write-Output 'Logins criados. Ainda NAO liberados: validar tokens reais/heranca e negar acesso nas demais instancias.'
        return
    }
    # Only after migrations. Object grants exclude the migration history; no broad datawriter role.
    Assert-Hml ($ApplicationAccount -match '^[A-Za-z0-9_.-]+\\[A-Za-z0-9_.-]+$') 'Conta Windows invalida.'
    $app = Quote-HmlIdentifier $ApplicationAccount
    $sql = @"
USE [SalaGest_Etapa6_Testes];
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COALESCE(CONVERT(varchar(256),SUSER_SID(N'$($ApplicationAccount.Replace("'","''"))'),1),'') <> '$($m.applicationSid)' OR USER_ID(N'$($ApplicationAccount.Replace("'","''"))') IS NULL
 THROW 51000, 'Identidade da aplicacao divergente.', 1;
IF OBJECT_ID('dbo.__EFMigrationsHistory') IS NULL THROW 51000, 'Execute migrations protegidas primeiro.', 1;
DECLARE @sql nvarchar(max) = N'';
SELECT @sql = @sql + N'GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::' + QUOTENAME(s.name) + N'.' + QUOTENAME(t.name) + N' TO $app;'
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE t.name <> '__EFMigrationsHistory';
EXEC sp_executesql @sql;
GRANT SELECT ON OBJECT::dbo.__EFMigrationsHistory TO $app;
DENY INSERT, UPDATE, DELETE ON OBJECT::dbo.__EFMigrationsHistory TO $app;
COMMIT;
"@
    Invoke-HmlQuery $c $sql | Out-Null
} finally { $c.Dispose() }
