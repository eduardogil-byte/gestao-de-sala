# Etapa 5B — Integrações administrativas

## Entrega

- **Turnos oferecidos:** Admin consulta e configura dias/turnos por ambiente e semestre no Dashboard, usando GET/PUT de `OccupancyIndicatorEndpoints`. A confirmação explica que a lista substitui a oferta; retirar todos os dias retira o turno da configuração, preservando reservas. Nenhum turno é presumido a partir de computadores ou de ausência de ocupações.
- **Indicadores:** o término do recarregamento global sinaliza uma nova consulta dos indicadores e da comparação, inclusive se outro cadastro falhar. Filtros e formulários não são remontados. Salvar turnos também invalida o relatório, mesmo se o diálogo for fechado antes da resposta.
- **Pendências gerenciais:** exibe ambientes com denominador desconhecido, conflitos, ocupações sem turno e avisos reais da API. Quantidades operacionais de computadores desconhecidas são informadas separadamente a partir do inventário. Não foi criado indicador de capacidades sem ambiente sem fonte de dados apropriada.
- **Requisitos técnicos:** o Catálogo abre consulta/edição no caminho Curso → Módulo → UC → Capacidade. Professor consulta; Admin cadastra/edita tipo, projetor, computadores, RAM, recursos, softwares, licenças necessárias e criticidade. Usa os contratos GET/POST/PUT existentes em `EnvironmentCompatibilityEndpoints`.
- **Remoção de requisitos:** retirar itens de recursos/softwares e salvar envia as listas atualizadas ao PUT existente. Campos opcionais podem ser limpos. A API não autoriza DELETE do cadastro completo; não foi criado esse comando nem alterada a semântica de ausência de requisitos.
- **Cronograma:** filtros agrupados semanticamente, navegação de período que acomoda telas estreitas e cartões diários na visão semanal móvel. Ocupações e detalhes continuam acessíveis por botão. Não implementa arraste completo de blocos ou reversão atômica.
- **Agenda dos Instrutores:** reaproveita seletor pesquisável para listas extensas; distingue carga física da semana selecionada e do semestre, usando a mesma função existente de cálculo, sem criar limite docente.
- **Oportunidades:** seleção de capacidade anuncia nome/contexto, estado pressionado e texto “Selecionada”; os botões nativos permitem teclado.
- **Importação/Exportação:** troca a classe inexistente `input` por `field`, aplica espaçamento de Card e corrige o rótulo de semestre obrigatório na exportação de indicadores/planejamento.
- **Navegação:** subtítulos diferenciam operação diária na Agenda, análise por ambiente/período no Cronograma e carga/atividades por docente na Agenda dos Instrutores.

## Arquivos desta etapa

- `Frontend/src/components/OperatingShiftEditor.tsx`, `CapabilityRequirements.tsx`, `ManagerDashboard.tsx`.
- `Frontend/src/lib/data.tsx`.
- `Frontend/src/pages/Dashboard.tsx`, `PedagogicalCatalog.tsx`, `RoomTimeline.tsx`, `InstructorAgenda.tsx`, `RoomOpportunities.tsx`, `Agenda.tsx`, `InstitutionalImport.tsx`, `ExportData.tsx`.
- `Backend/SalaGest.Backend.Tests/OccupancyIndicatorTests.cs`, `EnvironmentCompatibilityEndpointTests.cs`.
- `Frontend/tests/adminIntegrations.browser.test.ts`, `fixtures/adminIntegrations.tsx`, `helpers/browser.ts`.
- Este documento. As alterações preexistentes da Etapa 5A foram preservadas; o helper de navegador recebeu somente suporte à nova fixture e isolamento de cache temporário.

## Verificação e limites

- Build da API aprovado, sem avisos; build do frontend aprovado. Suítes completas: **168 testes backend e 65 frontend aprovados**, sem falhas ou testes ignorados; `git diff --check` aprovado. A compilação dos testes backend mantém dois avisos nullable preexistentes. Permanecem avisos de porta WebSocket ocupada nos testes SSR antigos, sem falhas.
- Testes backend adicionais usam SQLite em memória: permissão, escopo por semestre/ambiente, retirada da oferta sem apagar ocupações, edição/remoção de critérios refletida na compatibilidade e preservação da capacidade pedagógica.
- Testes de navegador usam componentes reais, respostas HTTP sintéticas e o mesmo `DataProvider.reload` acionado pelo botão global: atualização, comparação, preservação de rascunhos, falha de cadastro independente, fechamento durante gravação, edição de requisitos, hierarquia, Professor somente leitura, Cronograma móvel, Enter em Oportunidades, busca/carga docente e campos de importação/exportação.
- Playwright não está instalado. A validação utiliza Chrome headless via DevTools, já disponível, sem instalar dependências. Capturas sintéticas desktop e 390 × 844 ficam fora do repositório, em diretório temporário indicado pelos testes. Foram inspecionadas capturas do Dashboard, turnos, requisitos, Cronograma e Importação/Exportação.
- Não há mudanças de schema ou migrations necessárias. Não foram alterados serviços de compatibilidade, regras pedagógicas, conflitos, recorrências ou permissões do backend.
- Não foram executados migrations, DbSeed, operações no banco real, instalação de pacotes, commit, push ou merge. `Backend/appsettings.json` mantém o hash inicial; o arquivo local de redesign foi preservado.

## Pendências para a Etapa 6

Homologar em SQL Server isolado com dados sintéticos e navegador conectado à API: persistência, auditoria, concorrência e concordância entre indicadores/relatórios. Conferir critérios técnicos e oferta de turnos com a instituição. Decisões D-01 a D-11 permanecem com seu estado atual; limites docentes e demais políticas não foram deduzidos nesta etapa.
