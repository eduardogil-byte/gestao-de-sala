# Backup e recuperação do SQL Server

Procedimento técnico inicial, sujeito à aprovação da instituição. Não define a política oficial de backup, RPO/RTO, prazo de retenção, local de armazenamento nem responsável institucional. Os scripts não foram executados nesta SG.

## Pré-requisitos e segurança

- PowerShell em uma estação administrativa/servidor autorizado e módulo oficial `SqlServer` disponível (`Invoke-Sqlcmd`). A autenticação usa o contexto integrado do operador; os scripts não aceitam nem armazenam usuário/senha.
- Conectividade aprovada com a instância e permissões mínimas necessárias. Backup exige `BACKUP DATABASE` (por padrão, `sysadmin`, `db_owner` ou `db_backupoperator`) e o serviço do SQL Server precisa poder gravar no destino. Restore exige privilégios administrativos de restauração e acesso do serviço SQL às pastas de dados/log.
- Executar os scripts em um host administrativo autorizado e preferencialmente no próprio host SQL quando forem usados caminhos locais. O caminho é interpretado pelo serviço SQL Server. Proteja pastas com ACLs restritas, armazenamento fora do repositório e transmissão por canal aprovado. Não colocar `.bak`, `.trn`, `.mdf`, `.ndf` ou `.ldf` no Git.
- Não há criptografia de backup configurada pelo SalaGest. `.bak` não significa arquivo criptografado. Se for necessária criptografia nativa do SQL Server, a instituição deve provisionar certificado/chave, proteger e testar sua cópia e definir custódia/rotação antes de habilitá-la. Não perder o certificado/chave de backup.
- Não alterar recovery model nem configurar backup de log sem conhecer o modelo, cadeia de logs, armazenamento e objetivos de recuperação.

## Backup completo

1. Aprovar janela, banco, destino e operador. Usar nome de arquivo novo e timestamped, em pasta protegida acessível ao serviço SQL; confirmar espaço livre e ACL.
2. Executar no PowerShell autorizado (sem informar credenciais na linha de comando):

   ```powershell
   .\tools\backup\backup-sqlserver.ps1 `
     -ServerInstance 'INSTANCIA_APROVADA' `
     -DatabaseName 'BANCO_APROVADO' `
     -BackupFile 'D:\Backups\SalaGest_YYYYMMDD_HHMMSS.bak' -Confirm
   ```

3. O script pede confirmação, rejeita caminhos dentro do repositório, nomes inválidos, arquivo já existente e banco de sistema; executa `BACKUP DATABASE` com `COPY_ONLY`, `CHECKSUM` e `NOINIT`, seguido por `RESTORE VERIFYONLY WITH CHECKSUM`. Não usa `INIT` e não substitui arquivo existente.
4. Registrar operador, instante UTC, instância/banco, destino, tamanho e resultado em registro operacional aprovado; não registrar credenciais ou conteúdo do backup. Restringir leitura e cópias. Definir retenção e remoção somente após aprovação e verificação de cópia recuperável.

`COPY_ONLY` evita alterar a base diferencial de uma estratégia institucional existente. `RESTORE VERIFYONLY` faz verificações de legibilidade/completude do conjunto de backup, mas não prova que o banco restaurado inicia ou está funcional. Ver referências da Microsoft: [backup completo](https://learn.microsoft.com/en-us/sql/relational-databases/backup-restore/create-a-full-database-backup-sql-server?view=sql-server-ver17) e [argumentos de RESTORE/VERIFYONLY](https://learn.microsoft.com/en-us/sql/t-sql/statements/restore-statements-arguments-transact-sql).

## Restauração isolada

1. Identificar backup e banco de origem esperados; conferir data, tamanho, origem, integridade operacional e acesso. Nunca restaurar diretamente sobre o banco SalaGest em uso.
2. Preparar banco de homologação isolado e pastas de dados/log dedicadas, vazias, protegidas e com espaço. Usar destino com prefixo `SalaGestRestore_` e permissões sem acesso de usuários comuns.
3. Executar o script; ele exige arquivo, destino e duas pastas explícitos; valida que destino ainda não existe, lê `RESTORE HEADERONLY`, exige exatamente um backup completo, executa `RESTORE VERIFYONLY WITH CHECKSUM`, obtém logical names com `RESTORE FILELISTONLY`, escolhe nomes de arquivos novos e pede confirmação de alto impacto antes de restaurar. Se qualquer arquivo de destino já existir, interrompe. Não utiliza `WITH REPLACE`, não encerra conexões nem configura single-user.

   ```powershell
   .\tools\backup\restore-sqlserver-isolated.ps1 `
     -ServerInstance 'INSTANCIA_HOMOLOGACAO' `
     -BackupFile 'D:\Backups\SalaGest_YYYYMMDD_HHMMSS.bak' `
     -DestinationDatabaseName 'SalaGestRestore_Homologacao_YYYYMMDD' `
     -DataDirectory 'D:\SqlData\SalaGestRestore' `
     -LogDirectory 'E:\SqlLogs\SalaGestRestore' -Confirm
   ```

4. Validar a origem e versão do banco, integridade com `DBCC CHECKDB` em janela aprovada, dados essenciais sem expor dados pessoais, login/configuração da aplicação de teste, rotas críticas e compatibilidade das migrations. O seed da API está desativado por padrão e só pode rodar com opt-in no ambiente Development; confirme que `Bootstrap:EnableDevelopmentSeed` está ausente/falso antes de conectar uma instância para verificação somente de leitura.
5. Registrar o resultado. Uma restauração isolada testada é evidência de recuperação; arquivo criado e `VERIFYONLY` não são homologação de recuperação.

O script entende caminhos locais/drive letter sem aspas, exige módulo PowerShell `SqlServer`, um backup completo único e arquivos de dados/log usuais. Outros formatos/dispositivos, múltiplos backupsets ou ambientes remotos com filesystem diferente exigem procedimento DBA controlado. Consulte [restauração em nova localização e MOVE](https://learn.microsoft.com/en-us/sql/relational-databases/backup-restore/restore-a-database-to-a-new-location-sql-server?view=sql-server-2019) e [RESTORE FILELISTONLY/VERIFYONLY](https://learn.microsoft.com/en-us/sql/t-sql/statements/restore-statements-arguments-transact-sql).

## Política a aprovar

Definir frequência de backups completos/diferenciais/logs conforme recovery model, RPO, RTO, retenção e volume; responsáveis, monitoramento, cópia fora do host, criptografia e custódia de chaves, permissões, resposta a falhas e periodicidade de restauração de teste. Essas decisões não foram presumidas nesta implementação. Backups contêm cópia integral de dados pessoais, hashes de autenticação, auditoria e notificações; acesso e descarte exigem controle equivalente ao banco.
