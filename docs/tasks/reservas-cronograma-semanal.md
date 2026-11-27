# Reservas e cronograma semanal

## Datas específicas sem recorrência

O contrato preserva os campos existentes. `Recurrence=Nenhuma`, sem máscara nem
data final, continua representando uma data. Para várias datas explícitas na mesma
semana, `StartsAt` representa a primeira, `RepeatUntil` a última e `WeekdaysMask`
identifica exclusivamente os dias escolhidos. O servidor exige a mesma semana
(domingo a sábado), os dois extremos selecionados e nenhuma máscara fora desse
intervalo. Não há repetição nas semanas seguintes. Edição, disponibilidade,
calendário, atribuições e confirmação usam `BookingPeriods.Expand`.

A exceção de turno continua restrita à representação de uma única data. A seleção
de uma data em outra semana substitui a seleção anterior, com explicação no formulário.
Nenhuma migration é necessária.

## Exceção técnica

O endpoint de confirmação retorna `409` com `technicalReasons` quando há apenas
impedimentos dispensáveis. Após confirmação explícita no modal, o cliente reenvia
esses motivos em `AcceptedTechnicalReasons`. O servidor recalcula a avaliação
na transação serializável e exige igualdade com os motivos atuais. A auditoria
`Booking/Confirmada` registra os motivos aceitos, autor, instante, reserva e sala.
Cancelar o modal não confirma a reserva. A classificação de compatibilidade não muda.

Na reserva comum, podem ser dispensadas exigências de projetor, computador do
instrutor, categoria de hardware, RAM e GPU. A avaliação com essas exigências
relaxadas ainda precisa comprovar capacidade, quantidade operacional e softwares
com licenciamento válido. Na pedagógica, apenas projetor e especificação de RAM
podem ser dispensados: quantidade operacional suficiente, ausência de exigências de
software nessa exceção e atendimento dos demais requisitos são obrigatórios.

Permanecem bloqueantes sala inativa, lugares insuficientes, quantidade operacional
insuficiente ou desconhecida, licenciamento, requisitos desconhecidos, tipo de
ambiente e recursos pedagógicos sem classificação segura para dispensa. Políticas
de dispensa desses recursos exigem decisão institucional. Permissões, vínculos,
conflitos, calendário e limites de recorrência continuam nas validações existentes.
A confirmação parcial continua independente da aceitação técnica.

## Cronograma

`WeeklyOccupations` recebe os dados já filtrados pelo Cronograma, usando o índice
da agenda. Cada ambiente tem cabeçalho próprio, sete dias de domingo a sábado e
linhas dos turnos cadastrados. Ocupações simultâneas e sem turno são preservadas.
Detalhes e ações administrativas continuam nos fluxos do Cronograma. Em celular,
a grade tem rolagem horizontal e mantém a identificação do turno fixa.

A consulta de agenda não comprova oferta nem disponibilidade de turnos vazios.
Por isso eles são apresentados como sem registro, com disponibilidade desconhecida;
não se infere “Livre” ou “Não ofertado”. Distinguir esses dois estados exige prova
adicional da API, a ser definida institucionalmente sem alterar os indicadores SG-23.

A grade detalhada foi retirada da Visão Geral. Os indicadores gerenciais, próximos
encontros, solicitações, empréstimos, avisos e atalhos permanecem.

## Indicadores e seleção de período no cronograma

- Há somente três cards gerais, imediatamente abaixo dos filtros: ocupação total,
  horas ocupadas de horas totais e dias de aula ocupados de dias ofertados. Não há
  indicadores repetidos nos cabeçalhos dos ambientes, inclusive na lista móvel.
- A consulta administrativa existente aceita opcionalmente `from` e `to` inclusivos,
  juntos e dentro do semestre (até 371 dias), e `shiftId`. Sem esses parâmetros,
  indicadores, comparação e exportações semestrais mantêm o comportamento anterior.
  Não há migration nem ampliação de permissões: os indicadores continuam restritos a Admin.
- O cálculo reutiliza oferta por ambiente/semestre, duração dos turnos, união de
  intervalos e calendário existentes. Nas consultas com período/turno, dias ocupados
  elegíveis contam apenas datas com sobreposição efetiva com a oferta, uma vez por
  data. Horas fora da oferta ficam separadas e não aumentam o percentual.
- Os cards somam os ambientes exibidos (inclusive o filtro de tipo), período e turno.
  O percentual usa a soma das horas ocupadas dentro da oferta dividida pela capacidade
  somada, sem fazer média dos percentuais por ambiente. Filtros de instrutor, turma
  e tipo de ocupação afetam os registros da agenda; quando usados, a tela explica
  que os indicadores representam a ocupação total dos ambientes exibidos.
- Conforme o Escopo do Coordenador, seções 3.3, RN03 e 9.3, um dia de aula é um
  turno de um ambiente. Os campos aditivos `eligibleSlots` e `occupiedEligibleSlots`
  contam esses dias dentro da oferta; campos anteriores de datas distintas continuam
  disponíveis. Sobreposições não duplicam horas nem dias de aula. Feriados e dias
  não presenciais não compõem a capacidade. Valores desconhecidos não viram zero.
  A referência de três turnos de 4 h por cinco dias resulta em 60 h/15 dias de aula
  semanais e 1.200 h/300 dias de aula em vinte semanas. São parâmetros cadastrados,
  não constantes: mês e semestre usam suas datas e calendário reais. A divergência
  institucional entre CH pedagógica e horas físicas (D03 do PDF) não foi redefinida.
- Capacidade não configurada permanece desconhecida; não vira zero ou disponibilidade
  presumida. Sem semestre selecionado, somente um semestre que cubra todo o período
  permite inferir a configuração. Se houver ambiguidade ou cobertura incompleta,
  a tela solicita a seleção do semestre e não agrega ofertas distintas por suposição.
- O período abre um calendário com o padrão visual das reservas, seleção de semana,
  mês ou semestre, acesso por teclado e retorno do foco. Não há botão Hoje nem campo
  de data duplicado. Turno e Mais filtros permanecem lado a lado no celular.
- Na grade semanal, registros ordinários do mesmo professor e turma em datas
  adjacentes, mesmo turno e horário formam uma faixa `Professor - Turma`. Cada data
  preserva seu botão de detalhes e arraste individual. Conflitos, empréstimos,
  bloqueios, dias especiais, lacunas e identidades ausentes interrompem a faixa.
  A lista móvel mantém os registros por dia. Detalhes e histórico permanecem.
- Ajuste visual posterior: faixas contínuas não repetem datas e horários sob o nome;
  botões por dia continuam acessíveis por teclado e arraste. Cards individuais não
  repetem turno nem horário. O modal de detalhes informa explicitamente o horário.
  O texto explicativo com período sob os três indicadores foi removido. Na visão
  semestral, o seletor principal usa o mesmo campo dos filtros, e o marcador de
  semestre selecionado tem a mesma altura dos demais filtros ativos.
- Na atualização mensal solicitada posteriormente, o mês reutiliza a grade por
  ambiente e turno da semana, incluindo faixas contínuas, detalhes e remanejamento
  individual. Os cabeçalhos mostram somente o número do dia; sábados e domingos
  têm fundo distinto nos dois temas e identificação acessível. A rolagem horizontal
  fica dentro da grade. O celular abre na grade mensal e oferece lista por dia.
  Cards ordinários mostram apenas `Docente · Turma`; UCs, turno e horário ficam
  nos detalhes. Alertas e bloqueios continuam identificados. O modal semanal do
  pedido anterior não foi implementado; selecionar um dia mantém seus detalhes na página.

## Validação

Na atualização da grade mensal e dos rótulos `Docente · Turma`: build frontend e
18 testes frontend focados aprovados. O teste mensal cobre números dos dias,
distinção dos fins de semana nos dois temas, rolagem contida em desktop e celular,
abertura de detalhes e destino correto do arraste. Capturas usam dados sintéticos;
nenhuma regra de negócio, permissão ou estrutura do banco foi alterada nesta etapa.

Na alteração dos três cards gerais e faixas contínuas: build frontend aprovado e
16 testes frontend focados e 25 testes backend de indicadores aprovados (Release,
sem reiniciar a API local). `git diff --check` aprovado.
Os testes focados verificam período, turnos, totais ponderados por capacidade,
filtro de tipo de ambiente, dados desconhecidos e respostas atrasadas; também
validam teclado, detalhes e arraste por dia em células com várias datas.
Temas claro e escuro foram conferidos em desktop e celular com dados sintéticos.
Na suíte administrativa ampliada, o cenário de atribuição de UC falhou por esperar
o texto `EAD (sem horário fixo)` enquanto a tela de turmas exibe `EAD sem horário fixo`;
esse fluxo não foi modificado nesta tarefa. Os dois avisos nullable backend e o
aviso de tamanho do bundle frontend permanecem. Não houve migration nem acesso ao
SQL Server real.

Na atualização dos indicadores e seletor de período: build frontend aprovado;
restore/build backend aprovados em pasta temporária de artefatos, pois a API aberta
bloqueava o executável no diretório habitual. Passaram 13 testes focados do cronograma
e 24 testes backend de indicadores. A suíte backend completa teve 258 aprovados e
duas falhas em criação de reservas (`EnvironmentInventoryTests` e
`AuthenticationPermissionTests`). O teste de navegação de `weeklyOccupations.test.ts`
continua falhando na comparação de `scrollbarColor`, já observada antes desta atualização.
Capturas e testes usam dados sintéticos/SQLite em memória; temas claro e escuro foram
conferidos em desktop e celular. A API em execução não foi reiniciada e não houve
acesso ao SQL Server real para validação.

Testes usam fixtures sintéticas e SQLite em memória; não acessam o banco local
restaurado ou o banco real. Os testes de interface usam o navegador instalado via
CDP, sem MCP ou dependências novas. A validação de temas e dimensões não equivale
a homologação com dados e políticas institucionais reais.

Resultado desta execução: build frontend e backend aprovados; 97 testes frontend
e 217 testes backend aprovados; `git diff --check` sem erros. A suíte frontend foi
executada com `--test-concurrency=1` para evitar concorrência entre as fixtures de
navegador neste computador. Permanecem dois avisos nullable preexistentes nos testes backend.

## Arquivos envolvidos

- Backend: `Contracts/Requests.cs`, `Endpoints/BookingEndpoints.cs`,
  `Services/BookingPeriods.cs` e `Services/BookingTechnicalException.cs`.
- Interface: `components/BookingForm.tsx`, `BookingCalendars.tsx`,
  `WeeklyOccupations.tsx`, `UI.tsx`; `pages/Bookings.tsx`, `Dashboard.tsx`,
  `RoomTimeline.tsx`; `lib/api.ts` e `lib/roomTimeline.ts`.
- Testes backend: `BookingPeriodsTests.cs`, `BookingTechnicalExceptionTests.cs`,
  `PedagogicalBookingTests.cs` e ajuste da data fixa em `AuthenticationPermissionTests.cs`.
- Testes frontend: `bookingForm.test.ts`, `bookingUx.browser.test.ts`,
  `bookingConfirmation.browser.test.ts`, `fixtures/bookingConfirmation.tsx`,
  `roomTimeline.test.ts`, `weeklyOccupations.test.ts` e `adminIntegrations.browser.test.ts`.
