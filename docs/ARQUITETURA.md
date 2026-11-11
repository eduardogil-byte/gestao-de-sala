# Arquitetura atual do SalaGest

```text
React/TypeScript (Vite) → /api → ASP.NET Core Minimal APIs → serviços/regras → EF Core → SQL Server
```

O frontend está em `Frontend/src/`: `App.tsx` seleciona páginas e navegação por perfil; `pages/` implementa telas; `components/` contém elementos visuais compartilhados; `lib/api.ts` envia HTTP e trata sessão; `types.ts` descreve contratos usados pelo cliente. O Vite usa proxy `/api` apenas em desenvolvimento. Em implantação, um host/proxy deve encaminhar `/api` e fornecer fallback para rotas da SPA. O build não incorpora uma URL privada do banco.

O backend é `Backend/SalaGest.Api.csproj` (.NET 8). `Program.cs` monta autenticação, CORS, serviços e endpoints. `Endpoints/` valida entradas, papéis e titularidade e coordena ações; `Contracts/` define DTOs; `Services/` concentra regras de reservas, compatibilidade, indicadores, importação/exportação e segurança; `Models/` define entidades; `Data/AppDbContext.cs` mapeia relações e índices; `Migrations/` contém alterações versionadas do esquema. Os endpoints usam `AppDbContext`, Identity e transações onde necessário. `Backend/SalaGest.Backend.Tests/` cobre comportamento de serviços e HTTP em ambiente de teste.

## Autenticação, autorização e dados

Login local usa ASP.NET Core Identity e Bearer Token. O frontend guarda o token em `sessionStorage`; a API revalida conta, bloqueio, security stamp e papéis nas requisições protegidas. `Admin` cadastra professores e administra cadastros/indicadores; `Professor` acessa somente operações e dados autorizados, incluindo suas reservas e propostas. A autorização é feita no backend, não pelo menu. OIDC institucional é opcional, exige configuração real e não está homologado com provedor. A separação futura de Gestor/Coordenador depende da D-08.

O EF Core usa SQL Server no produto. A configuração vem de `appsettings`, variáveis de ambiente e User Secrets em Development. Não há migration automática no startup; DbSeed só pode ser opt-in em Development. Em `Homologation`, `Program.cs` exige manifesto externo válido, conexão explícita e verificações do destino antes de iniciar. Os scripts de `tools/homologacao/` separam instalador, manutenção e aplicação. O nome do banco isolado não é prova suficiente de segurança; consulte [Etapa 6B](tasks/SG-etapa6B.md).

## Tratamento de falhas e integrações

A API retorna respostas HTTP de validação/conflito e Problem Details genérico para exceções inesperadas fora de Development. `GET /health/live` indica processo e `GET /health/ready` verifica conectividade com o banco. O frontend apresenta estados de carregamento, vazio e erro conforme a tela; a resposta da API é a fonte para permissão, compatibilidade e conflitos. Operações relevantes registram auditoria e podem gerar notificações internas, mas a cobertura integral de auditoria ainda exige verificação.

Integrações encontradas: arquivos CSV/XLSX para importação institucional, XLSX para exportação gerencial, OIDC opcional, SQL Server e scripts operacionais de backup/restore. Não há prova de integração automática com sistema acadêmico externo nem de SSO institucional ativo. A interface não deve tratar números do protótipo como dados reais.

## Estado de validação

Na Etapa 11 passaram 83 testes frontend e 200 backend, além de TypeScript/build. Testes usam fixtures sintéticas ou SQLite em memória; **o caminho completo frontend → API → SQL Server → frontend ainda não foi ensaiado**. A [matriz de pendências](deployment/pendencias-etapa12.md) distingue lacunas funcionais, decisões institucionais e validações pendentes. O [guia da Etapa 13](deployment/etapa13.md) organiza a implantação futura.
