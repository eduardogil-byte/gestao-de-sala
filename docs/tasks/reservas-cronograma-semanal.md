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

## Validação

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
