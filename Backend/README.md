# Backend do SalaGest

ASP.NET Core 8 Minimal APIs, ASP.NET Core Identity com Bearer Token, EF Core 8 e SQL Server. O projeto é `SalaGest.Api.csproj`; os testes estão em `SalaGest.Backend.Tests/`.

## Organização

- `Models/`: entidades do domínio; `Contracts/`: requisições e respostas HTTP.
- `Endpoints/`: rotas, autenticação, cadastros e operações.
- `Services/`: regras de reserva, compatibilidade, indicadores, exportação e proteção da sessão.
- `Data/AppDbContext.cs`: mapeamentos EF Core; `Migrations/`: histórico versionado. Não recrie `InitialCreate` nem edite o snapshot manualmente.

As rotas exigem Identity Bearer conforme o endpoint. `POST /api/auth/register` é restrito a Admin e cria Professor; não há autocadastro público. A API revalida conta, bloqueio, security stamp e papéis antes das operações protegidas. O SSO OIDC é opcional e depende de provedor institucional configurado. O primeiro Admin não deve ser criado por uma rota pública.

## Build e testes sem SQL Server

Na raiz do repositório:

```powershell
dotnet restore Backend/SalaGest.Api.csproj
dotnet restore Backend/SalaGest.Backend.Tests/SalaGest.Backend.Tests.csproj
dotnet build Backend/SalaGest.Api.csproj --no-restore
dotnet test Backend/SalaGest.Backend.Tests/SalaGest.Backend.Tests.csproj --no-restore
```

Os testes usam TestServer/SQLite em memória e inspeção de metadados; não substituem o ensaio em SQL Server. Na Etapa 11, 200/200 testes passaram, com dois avisos nullable nos arquivos de testes. Não interprete esse resultado como homologação integrada.

## Configuração e execução

O ASP.NET Core carrega `appsettings.json`, `appsettings.{Environment}.json`, variáveis de ambiente e, em Development, User Secrets. Use `ConnectionStrings__DefaultConnection` apenas após conferir servidor, banco e identidade. Não copie credenciais para arquivos versionados ou comandos compartilhados. `Bootstrap__EnableDevelopmentSeed=false` impede o seed opt-in; fora de Development a aplicação rejeita seed habilitado. O launch profile define Development e a porta 5108, mas não prova que seu banco é isolado.

**A configuração base pode apontar para `SalaGestDb`. Não use `dotnet run` sem confirmar o destino efetivo.** Para testes com escrita, siga [SG-etapa6B](../docs/tasks/SG-etapa6B.md): a execução em `Homologation` requer manifesto externo, conexão explícita, TLS confiável, SSO e seed desabilitados, identidade restrita e validação antes da API. Os wrappers de `tools/homologacao/` separam manutenção, provisionamento e aplicação. Não execute `dotnet ef database update` diretamente nesse fluxo.

Uma execução de desenvolvimento só deve ocorrer depois de o operador confirmar conexão isolada, credenciais próprias e ausência de dados reais. Use `dotnet run --project Backend/SalaGest.Api.csproj --no-launch-profile` com ambiente e variáveis aprovados na sessão. Não há migration automática na inicialização. Para a configuração futura de serviço, consulte o [guia de implantação](../docs/deployment/etapa13.md).

## Comportamentos importantes

Reservas cotidianas válidas são confirmadas pelo Professor, sem aprovação rotineira de Admin; recorrência parcial exige confirmação explícita. Aprovação de proposta semestral não ocupa sala: publicação revalida e cria ocupações. A API verifica conflitos, compatibilidade e permissões novamente na gravação. Empréstimo exige oferta do titular, aceite do destinatário e definição do destino da turma titular. Alterar um dia para EAD não libera automaticamente a sala.

`GET /health/live` indica processo; `GET /health/ready` tenta conectar ao banco e retorna 503 quando indisponível. Swagger é exposto em Development. Consulte [fluxo](../docs/FLUXO_DO_SISTEMA.md), [regras](../docs/REGRAS_NEGOCIO.md) e [pendências](../docs/deployment/pendencias-etapa12.md).

## Diagnóstico seguro

- Falha de conexão ou `503` em readiness: confira destino, TLS e permissões pela identidade autorizada; não troque para `SalaGestDb` ou desative a validação do certificado para contornar o erro.
- Falha de manifesto ou identidade em `Homologation`: interrompa a execução e siga os checks de [SG-etapa6B](../docs/tasks/SG-etapa6B.md); não edite o manifesto aprovado silenciosamente.
- `401`/`403`: confirme autenticação, papel e titularidade pelo fluxo normal. Não atribua Admin diretamente no banco como atalho.
