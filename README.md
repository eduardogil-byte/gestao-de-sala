# SalaGest

Sistema de gestão de ambientes pedagógicos, reservas e empréstimos de salas por dia e turno. Professores consultam ambientes e confirmam reservas; administradores mantêm cadastros e gerenciam alocações.

Este guia descreve a base `main` desta contribuição. As instruções foram conferidas com o código; não constituem evidência de build ou homologação. Os comandos abaixo são para execução futura pelo desenvolvedor em ambiente local.

## Tecnologias e estrutura

- Backend: C#, ASP.NET Core 8 Minimal API, Entity Framework Core 8, SQL Server e Identity com Bearer Token.
- Frontend: React 18, TypeScript, Vite 5 e Tailwind CSS.
- Testes do backend: xUnit.

```text
Backend/
  Contracts/                 Contratos HTTP
  Data/                      Contexto EF, factory de design time e seed
  Endpoints/                 Rotas, autorização e operações
  Models/                    Entidades
  Services/                  Recorrência, conflitos e compatibilidade
  Migrations/                Migrations versionadas
  SalaGest.Backend.Tests/    Testes automatizados
Frontend/
  src/pages/                 Telas
  src/components/            Formulários e componentes compartilhados
  src/lib/                   Cliente HTTP, dados e utilitários
  TESTES_MANUAIS.md           Roteiro de validação integrada
```

## Pré-requisitos

- Git e PowerShell para os exemplos.
- SDK .NET 8 e runtime ASP.NET Core 8 compatível com `net8.0`.
- Node.js e npm compatíveis com o lockfile. Node.js 22 é uma referência de ambiente, não uma versão fixada pelo repositório.
- SQL Server acessível, por exemplo SQL Server Express de desenvolvimento, e permissões para criar/atualizar o banco escolhido.
- Acesso aos registries NuGet e npm para restauração inicial.

Visual Studio e SQL Server Management Studio são opcionais. Execute cada bloco na pasta indicada; não há solução `.sln` na raiz.

## 1. Preparar o backend

Com o repositório clonado e a branch de trabalho aprovada selecionada, execute a partir da raiz:

```powershell
Set-Location Backend
dotnet --list-sdks
dotnet restore SalaGest.Api.csproj
dotnet build SalaGest.Api.csproj
dotnet tool restore --tool-manifest .\dotnet-tools.json
dotnet ef --version
```

O manifesto `Backend/dotnet-tools.json` fixa `dotnet-ef` em **8.0.32**. Confira a versão resolvida antes de usar migrations; não é necessário instalar a ferramenta globalmente. Os pacotes EF Core do projeto estão em **8.0.0**; restaurar a ferramenta não altera essas referências.

## 2. Configurar SQL Server e Admin

`Backend/appsettings.json` usa `Server=localhost`, banco `SalaGestDb` e autenticação integrada do Windows. `localhost` representa a instância padrão; uma instância nomeada pode usar `localhost\SQLEXPRESS`. Use o nome real aprovado pela equipe.

Escolha um banco exclusivo de desenvolvimento. No mesmo terminal de `Backend/` que executará migrations e API, sobrescreva a conexão sem editar arquivos versionados:

```powershell
$env:ConnectionStrings__DefaultConnection = "Server=localhost;Database=SalaGestDev;Trusted_Connection=True;MultipleActiveResultSets=true;TrustServerCertificate=True"
```

`SalaGestDev` é um exemplo. A autenticação integrada usa a conta Windows do processo, que precisa de acesso à instância e permissões para as migrations. `TrustServerCertificate=True` é apresentado para uso local, não como orientação de produção.

**API e migrations devem usar a mesma conexão.** A API usa a configuração padrão ASP.NET Core, incluindo User Secrets em Development. Já `Data/AppDbContextFactory.cs` lê somente `appsettings.json` e variáveis de ambiente a partir do diretório atual. Ela não lê uma conexão definida apenas em User Secrets. Execute EF dentro de `Backend/`.

Configure o Admin com User Secrets, ainda em `Backend/`:

```powershell
dotnet user-secrets set "Seed:AdminEmail" "admin@salagest.local"
dotnet user-secrets set "Seed:AdminPassword" "<substitua-por-uma-senha-local>"
```

Substitua os exemplos antes de executar. A senha exige pelo menos oito caracteres e um dígito. Não versione credenciais nem copie saídas com segredos para evidências. User Secrets é uma facilidade de desenvolvimento, não um cofre de produção.

## 3. Aplicar migrations existentes e iniciar a API

`dotnet ef migrations list` consulta as migrations disponíveis; `dotnet ef database update` aplica alterações no esquema do banco. A inicialização da API pode realizar gravações por meio do seed. Use somente o banco de desenvolvimento conferido, nunca produção.

Na pasta `Backend/`, com a conexão anterior:

```powershell
dotnet ef migrations list --context AppDbContext
dotnet ef database update --context AppDbContext
dotnet run --launch-profile SalaGest.Api
```

Nesta base existe `20261014054221_InitialCreate`. Ela já está versionada: **não a recrie nem gere outra migration para instalar o projeto**. `database update` aplica as migrations pendentes; não exige apagar ou recriar o banco.

A API não aplica migrations automaticamente. Após as tabelas existirem, o seed cria papéis `Admin`/`Professor`, três turnos se não houver nenhum e o Admin configurado. Não cria salas, professores, turmas ou reservas demonstrativas e não promove automaticamente uma conta comum preexistente.

O perfil `SalaGest.Api` define Development e `http://localhost:5108`:

- Swagger: <http://localhost:5108/swagger>
- Health: <http://localhost:5108/api/health>

Mantenha a API aberta. A variável de conexão vale para esse terminal e seus processos filhos; um novo terminal precisa recebê-la novamente.

## 4. Preparar e iniciar o frontend

Abra outro terminal na raiz:

```powershell
Set-Location Frontend
node --version
npm --version
npm ci
npm run build
npm run dev
```

Acesse <http://localhost:5173>. `npm ci` instala usando `package-lock.json`. Caso o PowerShell bloqueie `npm.ps1`, use os mesmos comandos com `npm.cmd`, sem alterar a política do computador.

O navegador chama caminhos relativos `/api`; o proxy de desenvolvimento Vite encaminha para `http://localhost:5108`. Para outra porta, configure **o terminal que inicia o Vite**:

```powershell
$env:VITE_API_TARGET = "http://localhost:5109"
npm run dev
```

Reinicie o Vite após mudar o destino. `vite.config.ts` lê `process.env.VITE_API_TARGET` sem carregar explicitamente arquivos `.env` para essa leitura. Copiar `.env.example` para `.env.local` sozinho não configura esse proxy.

O cliente HTTP guarda o token em `sessionStorage` e envia o cabeçalho `Authorization`. Conexão SQL e credenciais do banco pertencem ao backend.

## 5. Build, testes e verificações iniciais

Em `Backend/`:

```powershell
dotnet build SalaGest.Api.csproj
dotnet test .\SalaGest.Backend.Tests\SalaGest.Backend.Tests.csproj
```

Em `Frontend/`:

```powershell
npm run build
```

Os testes atuais do backend cobrem períodos de reserva e compatibilidade de salas, sem SQL Server. Não comprovam permissões HTTP, persistência ou concorrência real. Nesta base **não há script frontend `npm test`**. O build usa `tsc -b` e `vite build`, sem testes de interface.

Com API e banco em execução:

1. Consulte o health; sucesso não comprova os demais fluxos.
2. Abra o Swagger em Development.
3. Faça login com o Admin e consulte `/api/me` com o token retornado.
4. Entre pelo frontend e confira os cadastros. Listas vazias podem ser esperadas pelo seed mínimo.
5. Prepare dados fictícios e siga [o roteiro manual](Frontend/TESTES_MANUAIS.md) com Admin e dois professores.
6. Registre commit, ambiente, comandos, resultados e bloqueios. Build não substitui homologação integrada.

## Problemas frequentes

| Sintoma | Conferência |
| --- | --- |
| Falha de conexão/login SQL | Serviço e instância, conectividade e permissões da conta Windows |
| Tabelas ausentes | Migrations aplicadas no mesmo banco usado pela API |
| EF não encontra configuração | Terminal em `Backend/` com a variável de conexão definida |
| Ferramenta EF indisponível | Restaurar manifesto local e conferir versão resolvida |
| Admin não criado | Ambos os valores de seed, senha válida e e-mail não usado por conta comum |
| Swagger indisponível | Perfil `SalaGest.Api`, Development e porta correta |
| Porta 5173 ocupada | Liberar a porta; `strictPort` impede troca automática |
| Frontend não alcança API | API ativa e destino do proxy definido antes de iniciar Vite |
| HTTP 401/403 | Token, papel e propriedade do registro; botões ocultos não substituem autorização |
| Outra origem acessando API | Conferir CORS; o fluxo local deste guia usa proxy Vite |

`npm run preview` serve para inspecionar o build, não é o roteiro integrado aqui descrito. Hospedagem dos arquivos estáticos e roteamento de `/api` fora do servidor de desenvolvimento precisam de configuração própria.

## Diferenças entre branches

Referência da auditoria de 27/10/2026; o conteúdo das branches pode evoluir:

| Base examinada | Conteúdo |
| --- | --- |
| `main`, `7c59db9` | Base deste guia: reservas, empréstimos, agenda semanal, cadastros básicos e painel |
| `feature/sg-07-catalogo-pedagogico`, `e6266c5` | Código de SG-07–SG-12: catálogo, capacidades/CH, tela do catálogo, perfil docente, atribuições pedagógicas e calendário |

A feature tem migrations e testes adicionais, incluindo script frontend `npm test`, ausentes desta base. Implementação não equivale a homologação. Consulte os arquivos da branch aprovada; não copie migrations entre versões nem troque de branch para contornar falhas de instalação.

## Referências e escopo

- [Backend: rotas e regras](Backend/README.md)
- [Frontend: componentes e integração](Frontend/README.md)
- [Roteiro manual](Frontend/TESTES_MANUAIS.md)
- [Exemplos HTTP](Backend/SalaGest.http)

Este recorte da SG-06 organiza documentação. CI nos Pull Requests, execução completa dos comandos e homologação SQL Server permanecem entregas/validações separadas.
