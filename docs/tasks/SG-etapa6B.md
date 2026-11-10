# Etapa 6B — instalação controlada da homologação

## Estado e limites

Scripts preparados e validados offline; **não executados contra SQL Server**. Não foram criadas contas, certificados, bancos ou logins, não houve alteração de permissões/serviços, migrations, provisionamento ou inicialização da API. Nenhuma migration nova.

`localhost` é apenas candidata. Reserva depende de responsável formal e proibição de outros usos durante a campanha. O manifesto atesta a reserva; não bloqueia administradores nem substitui isolamento do sistema operacional. Não utilizar as outras instâncias com dados. Não utilizar SalaGestDb.

## Pré-requisitos e responsáveis

- Administrador Windows: criar duas contas Windows individuais não administrativas, fora dos grupos que concedem administração Windows ou SQL. Não reutilizar a identidade atual, nem conceder acesso a outras instâncias. Criação de contas é manual, fora dos scripts.
- Administrador SQL instalador: identidade terceira, aprovada por SID, utilizada somente na configuração inicial. É exigido sysadmin nessa fase; não executar API, provisionador ou migrations com ela.
- Manutenção: login individual, CONNECT SQL e VIEW ANY DATABASE; no destino, CONNECT, DML, VIEW DEFINITION, CREATE TABLE e ALTER/REFERENCES no schema dbo. Sem sysadmin, db_owner ou db_ddladmin. Esses privilégios permitem alterar dados/schema do destino: não são apropriados à aplicação.
- Aplicação: CONNECT SQL e VIEW ANY DATABASE; CONNECT/VIEW DEFINITION no destino; DML por tabela aplicativa após migrations; somente SELECT no histórico de migrations, com DENY de escrita. Não recebe permissões de backup/restore.
- .NET 8 e dependências já restauradas. Nenhuma instalação automática de ferramentas. Os scripts usam Windows PowerShell e System.Data.SqlClient; o executor usa o Microsoft.Data.SqlClient existente no projeto.
- Diretório externo com ACL restrita: apenas aprovador/instalador alteram o manifesto; aplicação/manutenção somente leem. Verificar ACL também dos diretórios pais. Não usar diretório compartilhado gravável nem links/reparse points controlados pela aplicação. Não há assinatura digital ou configuração automática de ACL.
- Certificado confiável e resolução do endpoint, verificados com as identidades reais. Sem aceitar certificado inválido, sem autenticação SQL por senha.

## Certificado — procedimento administrativo separado

1. Solicitar à autoridade autorizada um certificado para SQL Server com Server Authentication, chave privada e SAN correspondente ao endpoint. Para manter `localhost` nos scripts, o certificado precisa atendê-lo. Um certificado apenas para o hostname da máquina não satisfaz automaticamente `localhost`.
2. Instalar certificado/cadeia nos armazenamentos apropriados, por procedimento institucional. Não criar confiança indiscriminada em certificado autogerado. Revisar validade, revogação, algoritmo e requisitos do SQL Server.
3. Inspeção opcional, sem alteração: `Get-HomologationTlsPlan.ps1 -CertificateThumbprint '<thumbprint>' -EndpointDnsName '<DNS-aprovado>'`. O script valida candidato no LocalMachine/My; não exporta chave nem altera ACL, certificado ou serviço.
4. Administrador concede leitura da chave privada exclusivamente à conta do serviço SQL, vincula o certificado pelo SQL Server Configuration Manager e planeja reinício autorizado. Revisar impacto antes de habilitar Force Encryption. Não editar registro por tentativa.
5. Testar `Test-HomologationTls.ps1` sob instalador, manutenção e aplicação. O sucesso exige Encrypt=True e TrustServerCertificate=False. O teste de candidato não comprova vinculação no servidor nem permissão do serviço à chave.

Os testes de rejeição nas demais instâncias também exigem conexão com TLS confiável: somente erro SQL 18456 é aceito como bloqueio. Falha de TLS, timeout ou serviço parado é inconclusiva. Não modificar TLS das outras instâncias sem aprovação dos seus responsáveis. Se isso impedir a comprovação, **interromper a liberação**, sem bypass.

## Ordem e comandos reais

Os valores abaixo são placeholders. Executar na raiz do repositório, em sessões distintas das identidades indicadas. Não copiar senhas para argumentos, ambiente, logs ou arquivos.

### Inspeção / preparação local — sem escrita SQL

```powershell
git branch --show-current
git status --short
dotnet build tools/homologacao/SalaGest.Homologacao.csproj --no-restore
& ./tools/homologacao/Test-PreparationOffline.ps1
& ./tools/homologacao/Inspect-LocalSql.ps1
```

Obter SIDs das contas Windows por tradução NTAccount/SecurityIdentifier. Para o instalador, registrar separadamente o SID efetivo, o nome original e o SID original da conexão. Isso é obrigatório para contas Windows vinculadas à Microsoft e mantém a recusa de impersonação:

```sql
SELECT CONVERT(varchar(256),SUSER_SID(),1) AS InstallerSid,
       CONVERT(nvarchar(256),ORIGINAL_LOGIN()) AS InstallerOriginalLogin,
       CONVERT(varchar(256),SUSER_SID(ORIGINAL_LOGIN()),1) AS InstallerOriginalSid;
```

Nunca autorizar por nome apenas. Levantar todas as instâncias locais registradas e eventuais destinos adicionais da organização; o inventário automático cobre instâncias locais registradas, não servidores remotos desconhecidos.

### Aprovação 1 — reserva e arquivo externo (escrita em arquivo, não SQL)

O responsável deve aprovar exclusividade, endpoint/nome real, três identidades funcionais distintas, a identidade original do instalador, demais endpoints a bloquear e prazo máximo de sete dias. O formato obrigatório é a versão 2; manifestos anteriores são recusados e devem ser regenerados em outro arquivo. Preparar previamente ACL do diretório. O gerador usa CreateNew e não sobrescreve arquivos.

```powershell
& ./tools/homologacao/New-HomologationAuthorization.ps1 `
  -OutputPath '<manifesto-absoluto-externo>' `
  -ServerEndpoint '<endpoint-local-aprovado>' -ServerName '<SERVERPROPERTY-ServerName>' `
  -ApplicationSid '<SID-hex>' -MaintenanceSid '<SID-hex>' -InstallerSid '<SID-efetivo-hex>' `
  -InstallerOriginalLogin '<ORIGINAL_LOGIN-aprovado>' -InstallerOriginalSid '<SID-original-hex>' `
  -BlockedEndpoints '<outra-instancia-1>','<outra-instancia-2>' `
  -ApprovedBy '<responsavel>' -ExpiresAtUtc '<UTC-ISO8601>' -ApproveExclusiveReservation

& ./tools/homologacao/Install-HomologationSql.ps1 -ManifestPath '<manifesto>'
& ./tools/homologacao/Test-HomologationTls.ps1 -ManifestPath '<manifesto>'
```

O Install padrão é Inspect: verifica TLS, servidor real, SID efetivo, nome e SID originais do instalador e ausência de bancos inesperados. SID efetivo divergente continua sendo tratado como impersonação. Nenhuma escrita. O exemplo JSON versionado permanece deliberadamente inválido.

### Aprovação 2 — banco novo e logins (escrita SQL administrativa)

Somente instalador autorizado. Revisar scripts antes de cada comando. A criação recusa banco existente; não oferece DROP/REPLACE/reutilização. Marca o banco com o UUID da reserva. Configuração posterior e migrations exigem essa marca.

```powershell
& ./tools/homologacao/Install-HomologationSql.ps1 -ManifestPath '<manifesto>' `
  -Operation CreateDatabase -AuthorizeWrite
& ./tools/homologacao/Install-HomologationSql.ps1 -ManifestPath '<manifesto>' `
  -Operation ConfigureLogins -ApplicationAccount '<DOMINIO\conta-aplicacao>' `
  -MaintenanceAccount '<DOMINIO\conta-manutencao>' -AuthorizeWrite
```

Logins existentes são recusados, não corrigidos automaticamente. SIDs Windows devem corresponder ao manifesto; grupos não são aceitos como logins individuais. A configuração verifica sysadmin/db_owner por impersonação dentro da transação e bloqueia herança administrativa detectada. Isso não substitui validar o token real em sessão Windows própria.

Sob **cada conta real**, sem elevação, antes de liberar a próxima escrita:

```powershell
& ./tools/homologacao/Test-HomologationIdentity.ps1 -ManifestPath '<manifesto>'
```

A verificação exige cobertura de todas as outras instâncias locais registradas, servidor/SID original, permissões efetivas de servidor via fn_my_permissions e rejeição de login nas outras instâncias. A aplicação ainda não terá DML completo antes de criar o schema; seu check completo vem depois. Privilégios de banco são verificados pelo respectivo executor.

### Aprovação 3 — migrations (escrita somente da manutenção)

```powershell
# Somente leitura: valida destino, identidade, permissões e histórico
& ./tools/homologacao/Invoke-HomologationMigrations.ps1 -ManifestPath '<manifesto>'

# Aprovação específica posterior, mesma identidade restrita
& ./tools/homologacao/Invoke-HomologationMigrations.ps1 -ManifestPath '<manifesto>' -AuthorizeMigrations
```

O wrapper restaura variáveis ao terminar. Não usa launch profile, appsettings ou EF design-time. O executável repete as validações, exige identidade de manutenção atual/original, banco marcado, TLS, instância exclusiva, lista de privilégios permitidos e inventário de instâncias. Exige exatamente 16 migrations no assembly e histórico vazio ou prefixo exato. Não aceita migration desconhecida, downgrade ou identidade da aplicação. A execução passa por AppDbContext.Database.MigrateAsync, sem DbSeed ou startup da API. Usa as transações e bloqueios oferecidos pelo EF/SQL; não promete rollback atômico das 16 migrations.

Não executar `dotnet ef database update` como atalho: a factory existente não aplica estas proteções. Não há recuperação automática se permissões forem insuficientes; interromper e revisar, sem conceder db_owner para contornar falhas.

### Aprovação 4 — permissões finais da aplicação (instalador)

```powershell
& ./tools/homologacao/Install-HomologationSql.ps1 -ManifestPath '<manifesto>' `
  -Operation GrantApplication -ApplicationAccount '<DOMINIO\conta-aplicacao>' -AuthorizeWrite
```

Depois, conta da aplicação, sem elevação:

```powershell
& ./tools/homologacao/Start-Homologation.ps1 -ManifestPath '<manifesto>'
```

O check exige todas as migrations aplicadas, permissões reais de tabelas, ausência de DDL e escrita no histórico, identidade exata, exclusividade e bloqueios externos. A extensão 6B antepõe teste do token Windows e das outras instâncias ao executor 6A.

### Aprovação 5 — dados fictícios e testes integrados

Após todos os checks, autorização separada para cada ação:

```powershell
& ./tools/homologacao/Start-Homologation.ps1 -ManifestPath '<manifesto>' -ProvisionSynthetic -ConfirmSyntheticProvision
& ./tools/homologacao/Start-Homologation.ps1 -ManifestPath '<manifesto>' -StartApi
```

Provisionamento aceita banco vazio e senhas interativas sem eco, com Identity existente e transação. Consultar matriz e evidências em SG-etapa6A.md. Execução da API é em loopback; não usar conta de manutenção/instalador. Backup e restauração continuam exigindo aprovação e permissões separadas; nenhum comando desta etapa os executa.

## Interrupção segura e evidências

Qualquer divergência encerra a etapa; não continuar manualmente após falha. Ctrl+C interrompe o cliente, mas não prova rollback. A criação de banco e sua marca são operações distintas: uma falha pode deixar banco vazio sem marca; não reutilizar ou excluir automaticamente. Operações de configuração usam transação; após interrupção verificar estado por consultas sob o responsável. Migrations podem ter aplicado um prefixo: registrar histórico e analisar antes de nova autorização. Scripts não limpam bancos, contas ou logins.

Expirar/revogar operacionalmente o manifesto e parar a API suspende este caminho; não retira permissões SQL já concedidas nem impede administradores. Revogação SQL exige procedimento próprio autorizado. Não renovar manifesto mudando o UUID de banco já criado; renovação revisada deve preservar a reserva correspondente.

Registrar aprovador, versão revisada, horário, operação, retorno, servidor/banco e evidências dos checks. Sem tokens, senhas, strings de conexão ou dados reais. As provas ficam em diretório externo protegido. Testes offline não comprovam TLS, permissões SQL, sintaxe T-SQL executável nem isolamento real.

## Preservação no Git

Commit 6A sugerido, sem executar: `feat(homologacao): adicionar protecoes e provisionamento sintetico da etapa 6A`.

Incluir somente Backend/Program.cs; Backend/Services/HomologationSafety.cs; Backend/SalaGest.Backend.Tests/SalaGest.Backend.Tests.csproj; Backend/SalaGest.Backend.Tests/HomologationSafetyTests.cs; docs/tasks/SG-etapa6A.md; tools/homologacao/.gitignore, Inspect-LocalSql.ps1, Program.cs, SalaGest.Homologacao.csproj, Start-Homologation.ps1, SyntheticFixture.cs e manifest.example.json. Os três últimos arquivos de integração alterados nesta rodada precisam ter hunks 6B separados se desejados dois commits.

Commit 6B sugerido: `feat(homologacao): preparar instalacao SQL e migrations com autorizacao explicita`. Incluir novos scripts 6B, MaintenanceRunner.cs, HomologationMaintenanceTests.cs, SG-etapa6B.md e hunks de integração no Program.cs/Start-Homologation.ps1/manifest.example.json.

Nunca incluir Backend/appsettings.json, User Secrets, manifestos preenchidos, credenciais, evidências, backups, bin/obj ou docs/tasks/SG-redesign-almoxarifado.md. Manifestos/evidências são externos; o ignore *.local.json é proteção adicional, não substitui revisão de staging explícito. Nenhum staging/commit/push foi autorizado ou executado.

## Validação executada nesta preparação

- Build da ferramenta e API dependente aprovado. A suíte backend recompilou o executor final: **193 aprovados, zero falhas**, incluindo 14 casos novos do validador de manutenção. Permanecem dois avisos nullable preexistentes nos testes.
- Test-PreparationOffline.ps1 aprovado: parser de todos os scripts, autorização sintética válida, 11 recusas de manifestos inseguros e escape de identificadores. Não abre conexões e não executa os entry points administrativos.
- Revisão/varredura dos fontes de homologação sem credenciais embutidas detectadas; valores reais são parâmetros externos. Nenhum arquivo privado incluído no staging.
- git diff --check aprovado; hashes de appsettings.json e do documento local de redesign preservados. Nenhum script administrativo, executor de migrations, API ou provisionador executado. Nenhuma consulta SQL necessária nesta rodada.
- Frontend inalterado e não retestado. T-SQL e permissões mínimas ainda precisam de validação real no ambiente autorizado; se insuficientes, interromper sem ampliar privilégios automaticamente.
