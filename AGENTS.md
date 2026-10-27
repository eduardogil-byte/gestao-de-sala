# SalaGest — Instruções de desenvolvimento

## Objetivo
O SalaGest organiza ambientes pedagógicos, turmas, professores e suas reservas por dia e turno. O código deve continuar simples, profissional, robusto e fácil de manter por uma equipe pequena.

## Estrutura existente
- `Backend/`: ASP.NET Core 8, C#, EF Core, SQL Server e Identity. Preserve a organização atual (`Models`, `Contracts`, `Data`, `Endpoints`, `Services`).
- `Frontend/`: React, TypeScript, Vite e Tailwind CSS. Preserve os componentes, rotas e padrões existentes.
- `Backend/Migrations/`: migrations existentes do Entity Framework Core. Há uma `InitialCreate`; não a recrie.
- `docs/tasks/`: especificações e critérios de aceite de tarefas específicas.

## Princípios obrigatórios
1. **Altere o mínimo necessário para atender à tarefa.** Antes de editar, localize os arquivos e padrões já existentes. Prefira reutilizar código ao invés de duplicá-lo.
2. **Simplicidade com responsabilidade:** nomes claros, funções objetivas e validações nas fronteiras. Não crie abstrações, camadas, dependências ou padrões arquiteturais sem necessidade demonstrada.
3. **Compatibilidade:** não modifique comportamentos, contratos HTTP, permissões nem estrutura do banco sem exigir a tarefa e explicar o impacto. Preserve reservas, recorrências, empréstimos e histórico.
4. **Regras de negócio no backend:** não dependa somente de validações do React. Cheque autorização, propriedade dos dados, relacionamentos, conflitos e limites antes de salvar.
5. **Banco com segurança:** reutilize o `AppDbContext` e configurações existentes; mantenha integridade referencial. Nunca apague dados, altere uma migration aplicada ou edite manualmente `AppDbContextModelSnapshot.cs`. Use ferramentas oficiais do EF Core para gerar migrations, quando disponíveis.
6. **Organização:** siga os nomes e convenções reais dos arquivos próximos. Não reformate arquivos inteiros nem faça refatorações não relacionadas à tarefa.
7. **Qualidade:** inclua testes proporcionais à mudança, inclusive casos inválidos. Não introduza testes de fachada. Não afirme que compilou ou testou algo que não foi executado.
8. **Segurança:** nunca exponha senhas, tokens, CPFs ou strings de conexão com segredos. Não amplie permissões silenciosamente.
9. **Trabalho em equipe:** entregue mudanças pequenas e fáceis de revisar, com explicação dos arquivos alterados e impactos. Não execute commit, push, merge, rebase ou crie PR sem solicitação explícita.

## Ambiente e validação
- O desenvolvedor pode trabalhar em um computador **sem .NET SDK ou SQL Server**. Primeiro verifique as ferramentas disponíveis. Não instale ferramentas nem altere configurações do sistema sem pedir autorização.
- Backend, se disponível: `dotnet restore`, `dotnet build`, `dotnet test Backend/SalaGest.Backend.Tests/SalaGest.Backend.Tests.csproj`.
- Frontend, se alterado e com Node disponível: na pasta `Frontend/`, `npm ci` e `npm run build`.
- Se uma ferramenta não estiver disponível, explique objetivamente o bloqueio e forneça comandos para validar depois. Revisão estática não equivale a compilação.

## Fluxo por tarefa
1. Leia `docs/tasks/SG-XX.md` quando existir e identifique arquivos afetados.
2. Implemente somente o escopo combinado e evite reescrever código estável.
3. Revise possíveis regressões, permissões, entradas inválidas e vínculos no banco.
4. Apresente resumo do que foi feito, arquivos modificados, testes realmente executados e pendências de validação.

## Documentação obrigatória

Antes de implementar uma Issue SG-XX:

1. Leia docs/REGRAS_NEGOCIO.md.
2. Leia docs/DECISOES.md.
3. Consulte docs/ARQUITETURA.md.
4. Leia docs/tasks/SG-XX.md, se existir.

Não invente decisões de negócio.
Não implemente funcionalidades fora do escopo.
Se uma regra estiver indefinida, registre a pendência.
Priorize alterações pequenas e reutilize o código existente.