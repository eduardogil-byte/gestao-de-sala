# Etapa 5A — Planejamento por semestre e inventário técnico

## Escopo

Correção dos dois P0 na branch `feature/salagest-etapa5-admin`. Não inclui melhorias P1, novas regras institucionais ou mudanças no modelo EF.

## Planejamento

- O seletor mantém um componente de estado próprio para cada seleção de semestre. A troca desmonta o contexto anterior, inclusive em A → B → A.
- Plano e histórico são disponibilizados juntos, após conferir `plan.semesterId`. Carregamento ou falha não mostram dados anteriores nem oferecem criação indevida.
- Respostas antigas e conclusões de operações de um componente desmontado não atualizam a seleção atual. Uma operação já enviada mantém seu destino original; a troca não cancela ou redireciona uma gravação já recebida pelo servidor.
- Formulário, motivos de rejeição, filtros, capacidades, avisos e prévia são reiniciados na troca. Ações só ficam disponíveis com o contexto carregado.
- Aprovação, assinatura, revisão, publicação e auditoria do backend permanecem com as regras existentes.

## Inventário

- A edição consulta `GET /api/rooms/{id}/inventory` antes de abrir o formulário. A listagem de ambientes também passa a devolver os campos completos dos grupos.
- Computadores cadastrados e operacionais são distintos. Quantidade operacional desconhecida permanece nula.
- O formulário inclui hardware, rede, indicadores técnicos, equipamentos, instalações, versões, quantidades de licenças e validades.
- `RoomInput.Inventory` é uma extensão opcional dos contratos de criação/edição existentes. Reutiliza `ComputerGroupInventoryInput`, `RoomResourceInput`, `GroupSoftwareInventoryInput` e os validadores/mapeadores da API de inventário. Ambiente, inventário e auditoria são salvos na mesma transação.
- Grupos e recursos existentes usam seu ID. Coleções omitidas ou vazias preservam registros. Grupos e softwares só são removidos por `RemovedGroupIds` / `RemovedSoftwareIds`, após confirmação no formulário.
- No contrato básico legado, `ComputerGroupInput.Id` identifica edição. Uma descrição existente sem ID recebe erro explicativo; não se usa mais descrição para selecionar a entidade a atualizar. Clientes desse contrato devem devolver os IDs recebidos na leitura.
- O modelo atual não contém referências a grupos fora das instalações de software. A remoção explícita elimina o grupo e seus vínculos, preservando snapshots de auditoria e ocupações/reservas. Não foi criada política de inativação. Equipamentos persistidos podem ser editados; não foi acrescentada exclusão de recursos.
- Licenças desconhecidas não são preenchidas automaticamente; datas inválidas são rejeitadas na fronteira HTTP. Licenças vencidas podem ser registradas como fato de inventário, permanecendo sujeitas às regras existentes de compatibilidade na data da aula.
- Os serviços de compatibilidade e as regras de conflito, confirmação e recorrência não foram modificados.

## Verificações

- Testes backend com SQLite em memória: criação e recuperação técnica, IDs/renomeação, preservação por omissão, edição de recursos, remoções explícitas/auditoria, autorização, IDs de outro ambiente, duplicidades, quantidades inválidas, licenças e datas, compatibilidade após atualização e confirmação de reserva cotidiana.
- Testes no navegador instalado, com respostas HTTP sintéticas: A → B, A → B → A, falha em B, troca durante aprovação, semestre divergente e prévia antiga; edição de inventário e comandos explícitos de remoção.
- Os testes de navegador são executados por `npm.cmd test`, sem dependências adicionais. Detectam Chrome/Edge nos caminhos usuais do Windows; `SALAGEST_TEST_CHROME` pode indicar outro executável. Sem navegador disponível, esses testes são marcados como ignorados.
- Comandos: `dotnet build Backend/SalaGest.Api.csproj --no-restore`, `dotnet test Backend/SalaGest.Backend.Tests/SalaGest.Backend.Tests.csproj --no-restore`, `npm.cmd run build`, `npm.cmd test` e `git diff --check`.
- Resultado nesta execução: build da API aprovado, sem avisos; build do frontend aprovado; 166 testes backend e 57 testes frontend aprovados, sem falhas ou testes ignorados. A compilação dos testes mantém os dois avisos nullable preexistentes em `TeachingAssignmentTests.cs` e `OccupationMoveTests.cs`. O frontend emitiu avisos de porta WebSocket ocupada, sem falhas. `git diff --check` aprovado.

## Arquivos alterados ou adicionados

- Backend: `Contracts/Requests.cs`, `Contracts/EnvironmentInventory.cs`, `Endpoints/ApiEndpoints.cs`, `Endpoints/EnvironmentInventoryEndpoints.cs` e `Endpoints/RoomInventoryUpdates.cs`.
- Frontend: `src/pages/SemesterPlanning.tsx`, `src/pages/Rooms.tsx`, `src/components/RoomInventoryFields.tsx` e `src/types.ts`.
- Testes: `Backend/SalaGest.Backend.Tests/EnvironmentInventoryTests.cs`, `Frontend/tests/semesterPlanning.browser.test.ts`, `Frontend/tests/roomInventory.browser.test.ts`, `Frontend/tests/helpers/browser.ts` e `Frontend/tests/fixtures/adminCritical.tsx`.
- Documentação: este arquivo.

## Limites

Nenhuma migration é necessária: as entidades e os campos já existem. Não foram executados seed, migrations, operações no SQL Server real, backup ou restauração. A validação integrada contra SQL Server isolado continua pendente. `Backend/appsettings.json` e arquivos locais preexistentes foram preservados.
