# Preparação de implantação do SalaGest

Este guia prepara uma instalação futura; não comprova homologação nem define a infraestrutura do SENAI. Não há servidor, domínio, certificado, instância SQL Server ou estratégia de hospedagem institucional confirmados neste repositório.

## Arquitetura e pré-requisitos

- Backend: ASP.NET Core 8, projeto `Backend/SalaGest.Api.csproj`, EF Core 8 e SQL Server.
- Frontend: React, TypeScript e Vite; Node.js 20 ou superior e npm (Node 22 é recomendado no README do frontend).
- A API usa Identity Bearer. O OpenID Connect institucional continua opcional e desativado por padrão.
- O frontend envia requisições para caminhos relativos `/api`. Em produção, publique-o na mesma origem da API ou configure um proxy reverso que encaminhe `/api` ao backend e use fallback de SPA para as rotas do React. O endereço `VITE_API_TARGET` configura somente o proxy do servidor de desenvolvimento Vite; não injeta URL de API no build.
- O SQL Server deve ser acessível pelo backend. O SQL Server de desenvolvimento configurado no arquivo local não é referência de produção.

O host de produção (Windows/IIS, serviço atrás de proxy ou outra opção institucional) permanece pendente. Escolha-o após confirmar sistema operacional, operação de TLS, domínio, processo de serviço, permissões e suporte institucional. Não exponha o backend diretamente à internet sem a revisão de rede e HTTPS.

## Configuração por ambiente

O ASP.NET Core carrega `appsettings.json`, `appsettings.{Environment}.json`, variáveis de ambiente e User Secrets em desenvolvimento. Segredos devem vir do cofre aprovado pela instituição ou do mecanismo seguro do host. Nunca versionar connection strings com senha, segredo OIDC, certificados privados ou credenciais de seed.

Defina `ASPNETCORE_ENVIRONMENT` como `Development`, `Staging` ou `Production`. Exemplos apenas com placeholders:

```text
ASPNETCORE_ENVIRONMENT=Staging
ConnectionStrings__DefaultConnection=<connection-string-do-banco-de-homologacao>
Cors__FrontendOrigins__0=https://<origem-aprovada-do-frontend>
Authentication__InstitutionalSso__Enabled=false
```

Em produção, configure os mesmos parâmetros com valores aprovados para aquele ambiente. `ConnectionStrings__DefaultConnection` substitui a seção correspondente do JSON. O CORS atual aceita as origens listadas em `Cors:FrontendOrigins`; configure apenas origens exatas e aprovadas. Para frontend e API na mesma origem, não é necessário liberar origens externas. A política existente não habilita credenciais CORS.

O perfil `SalaGest.Api` em `Backend/Properties/launchSettings.json` define Development, a porta local 5108 e opt-in de seed de desenvolvimento. `launchSettings.json` serve ao desenvolvimento local e não configura a publicação. Sem ele, configure as URLs de escuta pelo host, por exemplo `ASPNETCORE_URLS` com o endereço interno aprovado. Não fixe `localhost`, uma instância Express ou uma porta de produção no código.

Em desenvolvimento, User Secrets podem guardar valores privados:

```powershell
cd Backend
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "<connection-string-local>"
dotnet user-secrets set "Seed:AdminEmail" "<email-local-de-desenvolvimento>"
dotnet user-secrets set "Seed:AdminPassword" "<senha-local-forte>"
```

Não use esses comandos em produção sem política institucional de segredos. O seed só roda quando `Bootstrap:EnableDevelopmentSeed=true` **e** o ambiente é Development. O perfil de desenvolvimento já faz opt-in; staging e produção nunca devem definir essa chave. Caso esteja habilitada fora de Development, a aplicação falha ao iniciar.

## SQL Server e permissões

Use uma identidade de serviço própria para a aplicação, com apenas permissões necessárias às operações normais da API. Não use credenciais de DBA na connection string do processo web. Uma identidade administrativa separada deve revisar e aplicar scripts de migration durante uma janela autorizada. O SQL Server deve ter TLS/certificado configurado conforme a infraestrutura; não desative validação de certificado para contornar erros.

A API não aplica migrations na inicialização. A configuração de SQL Server com `TrustServerCertificate=true` é rejeitada fora de Development; forneça certificado confiável. A API também não executa seed por padrão. A verificação de readiness abre conexão ao banco por `CanConnectAsync` e não grava dados.

## Migrations: revisão e aplicação controlada

Execute os comandos a partir de `Backend`, com ambiente e conexão direcionados ao banco correto. Confirme o destino fora da saída compartilhada e não publique credenciais.

```powershell
cd Backend
dotnet ef migrations list --context AppDbContext --project SalaGest.Api.csproj --startup-project SalaGest.Api.csproj
dotnet ef migrations script --idempotent --context AppDbContext --project SalaGest.Api.csproj --startup-project SalaGest.Api.csproj --output <caminho-seguro-para-revisao.sql>
```

`migrations list` consulta o estado registrado no banco e é somente leitura, mas requer conectividade; confira a connection string antes de executá-lo. A geração do script SQL não o aplica. Revise o SQL, migrations de origem/destino, impacto, permissões e plano de backup/recuperação com o responsável pelo banco. Só então um operador autorizado poderá aplicar o script aprovado. Não use `dotnet ef database update` como rotina da inicialização ou publicação. Registre o resultado e volte a consultar o estado aplicado.

Antes de qualquer alteração, gere e verifique backup segundo [`sqlserver-backup-restore.md`](../operations/sqlserver-backup-restore.md). Um backup verificado não substitui uma restauração de ensaio isolada. Não reverta migrations automaticamente; mudanças com dados exigem plano próprio.

## Build e publicação

### Backend

Na raiz do repositório:

```powershell
dotnet restore Backend/SalaGest.Api.csproj
dotnet build Backend/SalaGest.Api.csproj -c Release --no-restore
dotnet publish Backend/SalaGest.Api.csproj -c Release -o <diretorio-de-publicacao-novo>
```

Use diretório novo e aprovado para os artefatos. Revise os arquivos publicados e configure ambiente, connection string, CORS e SSO no host. Não copie appsettings privado, User Secrets, logs ou backups ao pacote. A publicação framework-dependent requer runtime ASP.NET Core 8 no host; a escolha por pacote self-contained depende do sistema operacional e arquitetura institucionais.

### Frontend

Na pasta `Frontend`:

```powershell
npm ci
npm run build
```

O Vite grava a saída em `Frontend/dist`. Publique esses arquivos no host estático aprovado. Configure fallback para `index.html` em rotas internas e mantenha `/api` encaminhado para a API na mesma origem. `VITE_API_TARGET` é apenas para `npm run dev`; valores `VITE_*` são públicos se usados em build e nunca devem conter segredos.

O cache pode ser longo para assets com hash do Vite, mas não para `index.html`, que aponta para a versão corrente dos assets. Defina isso no host selecionado, após a decisão de infraestrutura.

## HTTPS, rede e SSO

TLS deve ser terminado em host ou proxy confiável definido pela instituição. Restrinja exposição do backend e libere CORS apenas para origens aprovadas. A aplicação não confia automaticamente em headers de proxy e não configura proxies conhecidos; antes de habilitar forwarded headers, defina endereços/proxies confiáveis e a topologia real. Não aceite `X-Forwarded-*` de qualquer origem.

Para SSO, a instituição precisa fornecer provedor OIDC autorizado, Authority/Issuer, Client ID, segredo/certificado, redirect/callback e post-logout URLs registrados, origem HTTPS e política de sessão. Configure por variáveis/segredos no host. Não habilite com valores fictícios. Tickets OIDC temporários ficam em memória; múltiplas instâncias exigirão afinidade ou armazenamento compartilhado/Data Protection distribuído, a decidir e homologar. O SalaGest não provisiona usuários livremente nem mapeia grupos externos para Admin.

Os nomes de configuração correspondem ao modelo existente: `Authentication__InstitutionalSso__Enabled`, `Authentication__InstitutionalSso__Authority`, `Authentication__InstitutionalSso__ClientId`, `Authentication__InstitutionalSso__ClientSecret`, `Authentication__InstitutionalSso__CallbackPath` e `Authentication__InstitutionalSso__FrontendCallbackUrl`. O segredo OIDC só pode ficar no armazenamento seguro do host.

## Saúde, erros e logs

- `GET /health/live`: liveness do processo, sem dependências.
- `GET /health/ready`: tenta conectar ao banco; `200` quando acessível, `503` em falha. Não retorna detalhes da conexão e não altera dados.
- `GET /api/health`: endpoint legado preservado; indica processo, não prontidão do banco.

Em produção, exceções inesperadas retornam Problem Details genérico; detalhes técnicos continuam no logging do servidor. Os health checks não são monitoramento e não substituem leitura de logs. Proteja arquivos e destinos de log no host; não ative logging de dados sensíveis nem registre tokens, senhas, CPF, connection strings ou corpos de autenticação. Defina retenção/acesso conforme política institucional.

## Backup, atualização e rollback

Use os scripts já existentes em `tools/backup/` e siga [`sqlserver-backup-restore.md`](../operations/sqlserver-backup-restore.md). Esta Issue não executa backup ou restore e não define destino, retenção, frequência, criptografia, RPO/RTO ou responsáveis institucionais.

Atualização recomendada: identificar versão e destino; revisar mudanças e migrations; aprovar janela e backup; gerar/revisar SQL; preparar artefatos backend/frontend em diretório de versão; aplicar mudanças de banco separadamente com autorização; apontar o host à versão aprovada; conferir health checks e fluxos críticos; registrar resultado. O procedimento deve permitir voltar os artefatos da aplicação quando compatíveis com o banco.

Rollback da aplicação e recuperação do banco são operações diferentes. Não assumir que um downgrade de migration é seguro. Se a versão nova alterou dados ou schema, interrompa, avalie plano aprovado e restaure somente em procedimento controlado; o script existente exige destino isolado. Não use `WITH REPLACE` nem derrube conexões como padrão.

## Decisões institucionais pendentes

Antes de produção, definir host/domínio/TLS/proxy, banco e identidade SQL, CORS, provisão do primeiro Admin, provedor SSO, calendário e turnos, configuração por ambiente, operação de backup, RPO/RTO, retenção, criptografia/chaves, logs e responsável de suporte. Confirmar decisões D-01, D-03, D-04, D-06 e D-08 em `docs/DECISOES.md`. RN-07/RN-08: movimentação individual existe; movimentação de blocos pedagógicos completos permanece pendente e não está coberta por esta entrega.

## Preparação da SG-30

Usar `checklist.md` como roteiro de instalação e homologação. A SG-30 deverá confirmar conectividade e estado das migrations em banco isolado, ausência de gravações na inicialização normal, saúde, autenticação/perfis, fluxos institucionais, exportações, backup/restore isolado, comportamento de atualização e desempenho. Esta preparação não equivale à homologação nem autoriza produção.
