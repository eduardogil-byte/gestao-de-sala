# Etapa 6A — Preparação segura da homologação

Continuação operacional: [SG-etapa6B.md](SG-etapa6B.md). A Etapa 6B acrescenta manifesto com instalador/reserva/inventário, scripts de instalação e executor de migrations. O Start-Homologation passa a exigir também validação das outras instâncias. Os resultados registrados abaixo são históricos da 6A, não execução real da instalação SQL.

## Situação e limite da autorização

A preparação desta etapa não autoriza criar bancos, identidades Windows/SQL, aplicar migrations, executar DbSeed, provisionar usuários ou iniciar testes com escrita. Nenhuma dessas ações foi executada. Os resultados anteriores da Etapa 5 são 168 testes backend e 65 frontend; não equivalem a aceite integrado SQL Server.

A inspeção local somente de metadados encontrou a instância padrão sem bancos de usuário e a identidade atual como sysadmin. Isso identifica uma candidata, não comprova reserva exclusiva. A reserva exige aprovação do responsável e compromisso de não hospedar outros dados nessa instância durante a campanha. As outras instâncias locais não estão autorizadas.

## Proteções implementadas

- Ambiente exclusivo `Homologation`; Development/Staging/Production mantêm o fluxo existente. O executor sempre define ASPNETCORE_ENVIRONMENT e DOTNET_ENVIRONMENT com o mesmo valor e não usa launchSettings.
- `ConnectionStrings__DefaultConnection` obrigatória no ambiente; não usa fallback para appsettings ou User Secrets. O destino é exclusivamente `SalaGest_Etapa6_Testes`.
- `Bootstrap__EnableDevelopmentSeed=false` e `Authentication__InstitutionalSso__Enabled=false` explícitos. A API também verifica os valores efetivos, impedindo override por argumentos/configuração.
- Manifesto externo aprovado e com vencimento em até sete dias: endpoint, nome real do servidor, banco, SID da aplicação, SID distinto da manutenção e responsável. O exemplo versionado é inválido por padrão e não contém dados da máquina.
- Validação somente leitura antes de iniciar a API e antes do provisionamento: servidor/banco reais, SID atual e original, ausência de sysadmin/db_owner, inventário visível de bancos, permissões, TLS exigido pelo cliente e histórico exato de migrations.
- A identidade precisa enxergar os nomes de bancos para comprovar exclusividade, mas não pode acessar outro banco de usuário. Somente o destino e o nome reservado `SalaGestRestore_Etapa6_Testes` podem existir. Mesmo o banco restaurado deve negar acesso à identidade da aplicação antes de voltar a iniciar o ambiente.
- Recusa permissões administrativas, DDL, ALTER/CONTROL em tabelas, escrita em `__EFMigrationsHistory` e ausência de DML necessário. Metadados desconhecidos/falhas bloqueiam; nenhuma falha é interpretada como aprovação.
- Não exige VIEW SERVER STATE nem permissões administrativas de diagnóstico: TLS é obrigatório na conexão e o sucesso da abertura pelo SqlClient com validação de certificado comprova a negociação exigida.
- Nenhum comando desta ferramenta cria banco ou aplica migrations. Não existe endpoint novo de autenticação ou bootstrap.

Essas verificações protegem o caminho de homologação, não comandos arbitrários executados pelo administrador do computador. Nunca utilizar F5, o perfil padrão ou a identidade administrativa para os testes. ACL do manifesto, reserva da instância e permissões SQL continuam sendo controles indispensáveis. A aprovação do manifesto é uma atestação operacional, não uma assinatura digital.

## Preparação pelo responsável — ainda pendente

1. Aprovar a reserva exclusiva da instância e definir o endpoint/nome real exatos.
2. Criar uma identidade Windows não administrativa para aplicação e outra para manutenção. As instâncias atuais usam autenticação somente Windows; não alterar autenticação para modo misto por conveniência.
3. Criar o banco vazio exclusivamente após autorização de escrita. A manutenção aplica as 16 migrations existentes, de InitialCreate a Etapa2ClassCode; não há migration nova nesta etapa.
4. Manutenção com permissões de schema somente no destino, sem usar sua identidade no processo da API. O executor de aplicação não aceita db_owner. Comandos EF diretos não são um caminho de manutenção protegido por estes scripts; sua autorização e conferência são separadas.
5. Aplicação: CONNECT e DML nas tabelas aplicativas; SELECT no histórico de migrations, sem INSERT/UPDATE/DELETE nesse histórico. Evitar db_owner, db_ddladmin, db_securityadmin e privilégios de servidor. Conservar visibilidade dos nomes de bancos sem acesso aos seus dados.
6. Testar com a identidade restrita que as outras instâncias/bancos não aceitam acesso. SalaGestDb ausente não conta como prova de negação de acesso. Não criar esse banco apenas para fazer o teste.
7. Disponibilizar certificado SQL confiável e adequado ao endpoint. Não usar TrustServerCertificate=true ou Encrypt=false para liberar a validação.
8. Preencher uma cópia do manifesto fora do repositório, restringir sua ACL e registrar SIDs, responsável, aprovação e validade. Não preencher o arquivo de exemplo versionado com dados locais.

## Comandos de preparação

Na raiz do repositório, builds/restauração de dependências não acessam o banco:

```powershell
dotnet restore Backend/SalaGest.Backend.Tests/SalaGest.Backend.Tests.csproj --ignore-failed-sources
dotnet build tools/homologacao/SalaGest.Homologacao.csproj --no-restore
dotnet build Backend/SalaGest.Api.csproj --no-restore
dotnet test Backend/SalaGest.Backend.Tests/SalaGest.Backend.Tests.csproj --no-restore
dotnet tools/homologacao/bin/Debug/net8.0/SalaGest.Homologacao.dll help
```

Inspeção fixa de metadados, sem aprovar ou alterar o ambiente:

```powershell
& ./tools/homologacao/Inspect-LocalSql.ps1
```

Somente depois da aprovação do ambiente, sob a identidade restrita:

```powershell
# Sem StartApi: apenas validação de leitura. O script restaura as variáveis ao terminar.
& ./tools/homologacao/Start-Homologation.ps1 -ManifestPath '<arquivo-absoluto-fora-do-repositorio>'

# Exige a mesma validação e a repete no startup; API somente em loopback :5118.
& ./tools/homologacao/Start-Homologation.ps1 -ManifestPath '<arquivo-absoluto-fora-do-repositorio>' -StartApi
```

Em outro terminal para o frontend, depois de confirmar a API correta:

```powershell
$env:VITE_API_TARGET = 'http://127.0.0.1:5118'
npm.cmd --prefix Frontend run dev -- --host 127.0.0.1 --port 5183
```

## Provisionamento sintético — preparado, não executado

O executável separado `SalaGest.Homologacao` referencia o projeto da API e usa AppDbContext, UserManager, RoleManager e SessionUserManager. Não executa DbSeed, não emite tokens, não altera a autenticação e não adiciona endpoints. Usa a política atual de senha/lockout do Identity. Mudanças futuras nessa política precisam ser refletidas no provisionador.

O modo padrão de validação é `check`. A escrita futura exige simultaneamente o comando `provision --confirm-synthetic`, `SALAGEST_HML_ALLOW_PROVISION=YES`, terminal interativo, manifesto válido, identidade não administrativa e todas as migrations aplicadas. Não há senha padrão: cada senha é digitada sem eco, não é aceita por argumento/arquivo e não é registrada. Não habilitar essa variável antes da autorização específica.

A ferramenta recebe as mesmas variáveis de conexão/ambiente da validação. Elas devem ser configuradas na sessão restrita aprovada; Start-Homologation não deixa variáveis persistentes após terminar. Não reutilizar sessão administrativa ou habilitar provisionamento no processo da API.

Após autorização específica, o wrapper oferece um modo exclusivo de provisionamento, incompatível com StartApi, que exige os dois switches. Ele realiza check antes e a ferramenta repete as verificações antes de abrir a transação. Este comando não foi executado:

```powershell
& ./tools/homologacao/Start-Homologation.ps1 -ManifestPath '<arquivo-absoluto-fora-do-repositorio>' -ProvisionSynthetic -ConfirmSyntheticProvision
```

Antes de escrever, inicia uma transação Serializable e verifica todas as tabelas mapeadas. Qualquer dado existente faz recusar o provisionamento. Não há limpeza, overwrite ou recuperação automática de massa parcial; erro reverte a transação. Uma segunda execução sobre a massa criada é recusada.

Massa:
- 1 Admin e 2 Professores com e-mails example.invalid, sem CPF e com IDs novos.
- 2 semestres 2027.1/2027.2, 3 turmas, curso/módulo/UC e capacidades de 8 h e 10 h (18 h curriculares).
- Turnos de 4 h, atribuições/habilitações, feriado de 08/03/2027 e oferta de segunda-feira do laboratório válido.
- 3 laboratórios com 25 computadores: operacionais/licenças válidos, licença vencida em 2020, e dados operacionais/licenças desconhecidos. Licença válida com data 2099 para não depender do relógio da execução.
- Equipamentos fictícios e software SG6-CAD. Não cria reservas, ocupações, empréstimos nem propostas: esses fluxos devem ser exercitados pelas APIs reais.

A carga inicial usa entidades EF diretamente, com valores fixos sintéticos. Isso não prova validação dos endpoints de cadastro: a matriz exige criar/editar outros registros pelas APIs, incluindo entradas inválidas. A sequência de IDs gerados não deve ser presumida; consultar os registros SG6 após login.

## Matriz integrada e evidências — todos pendentes de execução

Cada execução deve registrar versão/commit, aprovação e identificação do destino (sem segredos), horário UTC, usuário fictício, cenário, HTTP sem Authorization/corpo de login, IDs, resultado esperado/observado e consulta final em nova conexão. Capturas e arquivos só com dados sintéticos, fora do repositório. Não registrar senhas, tokens ou connection strings.

| Grupo | Critério de aprovação | Evidência |
| --- | --- | --- |
| Login/papéis/permissões | Login Identity, 401/403, revogação e acesso cruzado negado | HTTP redigido e ações por perfil |
| Cadastro/inventário/compatibilidade | IDs e metadados preservados; quantidades/licenças inválidas rejeitadas; desconhecido não comprova adequação | Antes/depois pela API e nova conexão |
| Reservas simples/recorrentes | Datas, turno e calendário corretos; confirmação parcial explícita | Lista persistida de ocorrências |
| Conflitos | Nenhuma dupla ocupação de sala; turma/professor seguem regras atuais, com D-02 registrada | Rejeições e contagens SQL |
| Empréstimos | Destinatário aceita; limites e situação do titular respeitados; original preservada | Estados e auditoria |
| Agenda/movimentações | Prévia coerente; ocorrência e bloco por formulário íntegros; reversões elegíveis | Origem/destino, CH e auditoria |
| Planejamento | Aprovação não ocupa; publicação revalida revisão, assinatura, requisitos e conflitos | Estados e ocupações criadas |
| Troca de semestre | A→B→A, falha e resposta atrasada não permitem ações cruzadas | Chrome com rede controlada |
| Indicadores/turnos | Denominador real, desconhecido explícito, atualizar preserva filtros/rascunhos | API, cálculo manual e captura |
| Importação/exportação | Prévia sem gravação; confirmação segura; XLSX coerente e sem dados privados | Arquivos sintéticos e contagens |
| Concorrência/rollback | Dois clientes simultâneos não duplicam ocupações; falha intermediária não deixa gravação parcial | HTTP simultâneo e nova conexão |
| Chrome Admin/Professor | Teclado, foco, navegação e mobile sem perda de ações | Roteiro desktop/390px e capturas |
| Backup/restauração | Restaurar somente para SalaGestRestore_Etapa6_Testes sem REPLACE; integridade e fluxos funcionais | Backup sintético, restore real e conferência |

Não provocar falhas diretamente no banco real. Ensaios de rollback precisam de injeção de falha controlada em ambiente isolado ou cenário inválido que comprove atomicidade, sem afirmar cobertura apenas por resposta HTTP.

## Backup e limites restantes

Os scripts existentes em tools/backup não foram executados. Exigem módulo PowerShell SqlServer (não localizado nesta máquina), autorização própria, arquivos novos fora do repositório e permissões separadas de manutenção. VERIFYONLY não comprova recuperação funcional. A identidade da aplicação não recebe BACKUP/RESTORE.

O navegador disponível é Chrome/Edge; os testes existentes de UI usam respostas simuladas e não substituem o roteiro com API/SQL reais. Conflito docente, metodologia de CH, calendário, carga docente, privacidade e perfis institucionais continuam sujeitos às decisões de docs/DECISOES.md.

## Arquivos

Backend/Program.cs (somente ramo Homologation), Services/HomologationSafety.cs, testes HomologationSafetyTests e referência do projeto de testes à ferramenta. Tools/homologacao contém executável, massa, manifesto inválido por padrão, inspeção e executor. Nenhuma configuração real, modelo EF ou migration foi alterado; o documento local de redesign permanece fora do escopo.

## Resultados desta preparação

- Restore dos projetos concluído sem dependências novas declaradas; build da ferramenta e da API aprovado, zero erros e zero avisos nesses projetos.
- Suíte backend completa: **179 aprovados, 0 falhas, 0 ignorados**, incluindo 11 testes de segurança/estrutura de massa que não abrem banco. A compilação dos testes mantém dois avisos nullable preexistentes. Os testes antigos usam bancos em memória ou inspeção de modelo, não o SQL Server real.
- Parser PowerShell: zero erros nos dois scripts; conjuntos de parâmetros Check (padrão), Start e Provision conferidos.
- CLI help retornou 0; check sem ambiente configurado retornou 2. Check com o manifesto de exemplo retornou 2 por reserva não aprovada, antes da abertura da conexão. Provisionamento e API não foram iniciados.
- `git diff --check` aprovado; hashes de Backend/appsettings.json e docs/tasks/SG-redesign-almoxarifado.md preservados. Nenhum staging, commit ou push.
- Frontend não alterado nem retestado nesta rodada; 65 aprovados é o registro anterior da Etapa 5B.
- A consulta de permissões sob identidade Windows restrita, TLS real, aplicação das migrations, provisionamento, cenários integrados e recuperação permanecem **não executados**. O código da verificação SQL está compilado, mas sua execução real depende do ambiente aprovado. Não declarar isolamento comprovado com base nos testes unitários.
