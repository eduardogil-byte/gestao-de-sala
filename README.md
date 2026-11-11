# SalaGest

O SalaGest apoia a coordenação e os professores na organização de ambientes pedagógicos, turmas, aulas e reservas por dia e turno. A instituição define a programação acadêmica; o sistema ajuda a cadastrar recursos, avaliar compatibilidade, planejar ocupações, confirmar reservas e acompanhar o uso dos ambientes. Ele não gera automaticamente a grade escolar completa.

## Estado do projeto

O código contém fluxos de Admin e Professor, catálogo Curso → Módulo → UC → Capacidade, docentes e habilitações, ambientes e inventário, reservas simples e recorrentes, empréstimos, agenda, cronograma, planejamento semestral, indicadores, importação e exportação XLSX. A interface usa o redesign azul-marinho das Etapas 1–10.

Esses fluxos têm testes automatizados, mas **não houve homologação integrada com SQL Server isolado** na Etapa 11. Funcionalidades parciais, decisões institucionais e requisitos planejados constam na [matriz de pendências](docs/deployment/pendencias-etapa12.md). Não use o resultado das suítes como autorização para operar com dados reais.

## Arquitetura e leitura inicial

`Frontend/` contém React 18, TypeScript, Vite e Tailwind CSS; `Backend/` contém ASP.NET Core 8 Minimal APIs, Identity, serviços, EF Core e migrations para SQL Server. O frontend chama caminhos relativos `/api`; a API valida autenticação, autorização e regras antes de persistir. Leia [arquitetura](docs/ARQUITETURA.md), [fluxo do sistema](docs/FLUXO_DO_SISTEMA.md), [regras de negócio](docs/REGRAS_NEGOCIO.md) e [decisões em aberto](docs/DECISOES.md).

## Validar sem acessar o banco

Pré-requisitos: .NET SDK 8, Node.js 20+ e npm. Com dependências já instaladas/restauradas, na raiz:

```powershell
dotnet build Backend/SalaGest.Api.csproj --no-restore
dotnet test Backend/SalaGest.Backend.Tests/SalaGest.Backend.Tests.csproj --no-restore
cd Frontend
npx tsc -b
npm run build
npm test
```

Se as dependências não estiverem disponíveis, restaure `Backend/SalaGest.Api.csproj` **e** `Backend/SalaGest.Backend.Tests/SalaGest.Backend.Tests.csproj` com `dotnet restore`, e use `npm ci` em `Frontend/` antes dos comandos acima. Os testes atuais usam SQLite em memória e fixtures HTTP sintéticas; não comprovam comunicação com o SQL Server.

## Execução local

**Não inicie a API com a configuração padrão sem verificar o destino:** `Backend/appsettings.json` pode apontar para `SalaGestDb`. O nome de um banco alternativo, por si só, não comprova isolamento. Para usar dados sintéticos, siga primeiro o [procedimento de homologação protegida](docs/tasks/SG-etapa6B.md); ele exige instância reservada, identidade restrita, TLS confiável, manifesto externo e autorizações distintas para criação, migrations e provisionamento. Não use `dotnet ef database update` como atalho nesse ambiente.

Depois de um backend autorizado estar em execução, abra outro terminal em `Frontend/`:

```powershell
npm ci
$env:VITE_API_TARGET = 'http://127.0.0.1:5118' # ajuste à URL aprovada da API local
npm run dev -- --host 127.0.0.1
```

Abra a URL exibida pelo Vite. `VITE_API_TARGET` configura somente o proxy de desenvolvimento; não é conexão SQL e não deve conter segredos. Para o modo `Homologation`, use exclusivamente `tools/homologacao/Start-Homologation.ps1` após os checks e autorizações descritos na documentação da Etapa 6. O guia do [Backend](Backend/README.md) e o do [Frontend](Frontend/README.md) detalham comandos e limitações.

## Implantação futura

A [Etapa 13](docs/deployment/etapa13.md) reúne infraestrutura, sequência de implantação, testes ponta a ponta e retorno de versão. Nenhuma instalação, migration, seed ou teste com escrita foi executado nesta documentação. Backup e restauração exigem procedimento e aprovação próprios: [guia operacional](docs/operations/sqlserver-backup-restore.md).
