# SalaGest — Mapa técnico curto para desenvolvimento

Documento de navegação, **não** substitui leitura do código. A árvore abaixo se baseia no ZIP inicial e nos relatórios do Codex; confirme o estado atual antes de alterar arquivos.

## Stack
- Backend: C#, ASP.NET Core 8 (Minimal APIs), Identity/JWT, EF Core 8, SQL Server.
- Frontend: React, TypeScript, Vite e Tailwind CSS.
- Persistência oficial: SQL Server. Banco pode estar indisponível no PC da escola; **não afirmar testes integrados sem executá-los**.

## Pontos de entrada e convenções existentes
- `Backend/Models/`: entidades e enums do domínio.
- `Backend/Contracts/`: DTOs de requisição/resposta.
- `Backend/Data/AppDbContext.cs`: mapeamento EF Core, relacionamentos e índices.
- `Backend/Endpoints/ApiEndpoints.cs`: registro de rotas/endpoints existentes; há endpoints divididos em arquivos próprios nas novas SGs.
- `Backend/Services/`: regras e serviços de aplicação já existentes.
- `Backend/Migrations/`: migrations geradas oficialmente pelo EF Core.
- `Backend/SalaGest.Backend.Tests/`: testes do backend.
- `Frontend/src/pages/`, `src/lib/`, `src/types.ts`, `src/App.tsx`: telas, funções utilitárias, contratos e navegação.
- `Frontend/tests/`: testes do frontend.

## Domínio existente no ZIP inicial
`AppUser`, `Room`, `ComputerGroup`, `Software`, `Semester`, `SchoolShift`, `ClassGroup`, `TeachingAssignment`, `Schedule`, `WeeklyClass`, `BookingRequest`, `RoomOccupation`, `RoomLoan`, `UserNotification` e `OccupationChange`.

## Mudanças recentes relatadas pelo Codex (revisar no repositório atual)
- SG-07: `Course`, `Module`, `CurricularUnit` e endpoints do catálogo.
- SG-08: `Capability`, `plannedHours` da UC, endpoints de capacidades e resumo.
- SG-09: página `PedagogicalCatalog.tsx` e navegação do frontend.
- SG-10: professor continua `AppUser` (papel Professor), com formação/habilidades e tabelas de habilitação para curso/UC/capacidade. Migration SG-10 pendente no último relatório.
- SG-11: implementar **atribuição da aula** a professor+turma+UC+semestre, **reutilizando `TeachingAssignment` ou estrutura atual equivalente**. Não duplicar o cadastro de professor nem confundir habilitação com atribuição.

## Fluxo lógico esperado, sem antecipar funcionalidades
1. Cadastro institucional: cursos, módulos, UCs, capacidades; turmas e docentes; ambientes e recursos.
2. Habilitação professor↔curso/UC/capacidade (SG-10) é uma informação sobre aptidão, não uma aula agendada.
3. Atribuição professor↔turma↔UC↔semestre (SG-11) informa quem ministrará a aula, sem criar reservas automaticamente.
4. Calendário e inventário detalhado (SG-12/13), compatibilidade (SG-14), ligação pedagógica às reservas (SG-15).
5. Planejamento visual, métricas, relatórios e publicação seguem em etapas futuras.

## Antes de tocar o banco
1. Verificar `git status` e quais migrations já existem; nunca recriar `InitialCreate`.
2. Mudança de modelo: gerar migration incremental **apenas pela CLI oficial** quando possível e revisar SQL/relacionamentos; não editar snapshot manualmente.
3. Sem SQL Server: testar compilação e regras isoladas, registrar integração pendente.
4. Não alterar reservas, empréstimos, autenticação ou horários além do escopo da Issue.

## Testes por ambiente
- Backend (pasta `Backend`): `dotnet restore`, `dotnet build`, `dotnet test`.
- EF: `dotnet tool restore` apenas com autorização de restauração de ferramentas, `dotnet ef migrations has-pending-model-changes --context AppDbContext`.
- Frontend (pasta `Frontend`): `npm ci`, `npm run build`, `npm test` conforme scripts presentes.
- Revisão: `git diff --check`, `git status --short` e leitura cuidadosa de cada mudança.
- Integração HTTP e SQL Server **dependem do ambiente**: registrar explicitamente pendência quando indisponível.

## Regra de ouro
Sempre leia `REGRAS_NEGOCIO.md`, `DECISOES.md` e a Issue específica antes de mudar regras ou relacionamentos. Em caso de divergência, **não invente uma decisão institucional**: descreva o conflito e implemente somente o trecho que não depende dele.
