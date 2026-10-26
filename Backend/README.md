# SalaGest — Backend de desenvolvimento (v0.2, regras de alocação por turno)

**Stack preservada:** C# / ASP.NET Core 8 Minimal API, Entity Framework Core 8, SQL Server Express,
ASP.NET Core Identity Bearer Token. O React já enviado anteriormente é um projeto separado e
**ainda deve ser atualizado** para este novo fluxo.

**Estado de validação:** esta versão foi preparada a partir do backend ZIP original, com revisão estática
local; **não foi compilada nem executada** aqui porque o SDK do .NET e o SQL Server não estão
instalados no ambiente de preparação. Execute `dotnet build`, `dotnet test`, crie/aplique as migrations
e teste os fluxos no seu computador antes de colocar usuários reais. Não há promessa de homologação.

## Começar no Windows

Instale .NET 8 SDK, SQL Server Express e (opcional) Visual Studio. Abra um terminal
na pasta `Backend/` e execute:

```powershell
dotnet --version
dotnet restore
dotnet build
dotnet tool install --global dotnet-ef --version 8.0.0
# se já estiver instalado: dotnet tool update --global dotnet-ef --version 8.0.0

dotnet user-secrets set "Seed:AdminEmail" "admin@instituicao.local"
dotnet user-secrets set "Seed:AdminPassword" "TroquePorUmaSenhaForte123!"

dotnet ef migrations add InitialCreate
dotnet ef database update
dotnet run
```

O endereço padrão em `Properties/launchSettings.json` é `http://localhost:5108`;
abra `http://localhost:5108/swagger` no perfil Development.

`appsettings.json` usa `Server=localhost\\SQLEXPRESS;Database=SalaGestDb;Trusted_Connection=True;...`.
Use **um banco exclusivo**, preferencialmente novo. Se você já criou migrations para a
versão anterior, **não rode `InitialCreate` outra vez:** gere uma nova migration ou
faça backup e decida como migrar os dados existentes. Não apague tabelas de produção.
O seed cria três turnos apenas quando não existe nenhum: manhã **08:00–12:00**,
tarde **13:30–17:30**, noite **18:30–22:30**. Se o banco já tinha turnos
cadastrados, confira-os; o seed não altera horários existentes automaticamente.

Para executar os testes puros (em outro terminal, a partir da pasta que contém `SalaGest.Backend.Tests`):

```powershell
dotnet test .\SalaGest.Backend.Tests\SalaGest.Backend.Tests.csproj
```

## Regra principal

A unidade física de alocação é **sala + dia concreto + turno completo**.
Uma turma pode usar salas diferentes em dias e turnos diferentes.
Não existe exigência de aprovação administrativa: ganha a primeira confirmação válida,
em transação SQL serializável, sempre com nova verificação de conflitos.

### Reserva pontual ou recorrente

1. Professor autenticado chama `POST /api/bookings` para criar **rascunho de solicitação**.
2. Chama `GET /api/bookings/{id}/suggestions` e vê salas **compatíveis e incompatíveis,
   ocupadas e livres**, com recursos, capacidade, especificações e ocupantes (IDs).
3. Opcional: `GET /api/bookings/{id}/availability?roomId=1` devolve **datas concretas**,
   ocupantes e turmas das indisponíveis.
4. Confirma pessoalmente em `POST /api/bookings/{id}/confirm` com `{"roomId":1}`.
   Se parte das datas estiver indisponível, a API retorna **409 Conflict** com dias
   livres e indisponíveis e não grava nada. Para confirmar apenas os livres,
   repita com `{"roomId":1,"confirmPartial":true}`.
5. Se a mesma turma e mesmo professor já ocupam aquele turno em outra sala,
   informe `"replaceOwnClassBooking":true` na confirmação **após confirmação humana**.
   A reserva anterior é liberada na mesma transação. Reserva de outro professor
   nunca é substituída automaticamente.

**Recorrência semanal:** `weekdaysMask` utiliza os bits de `DayOfWeek` C#:
bit 0 domingo, bit 1 segunda, bit 2 terça, bit 3 quarta, bit 4 quinta,
bit 5 sexta, bit 6 sábado. Exemplos: seg/ter/qua = `2+4+8=14`;
qui/sex = `16+32=48`. Use `recurrence: "Semanal"` e `repeatUntil` (até 365 dias).
O primeiro dia informado em `startsAt` também deve estar entre os selecionados.
`recurringEadWeekday` é opcional (`5` = sexta). Os turnos são verificados pelo banco:
use horários iguais aos do cadastro em `/api/shifts`.

**Capacidade:** `Students` é a quantidade de alunos e `Room.Seats` o limite de
ocupantes. `StudentsPerComputer` (1, 2 ou mais) permite trabalhos em grupos,
sem confundir quantidade de computadores com quantidade de vagas.

### Editar aulas concretas

- `GET /api/agenda?from=2026-10-12&to=2026-10-19` traz ocorrências ativas, titular e ocupante efetivo.
- `PUT /api/occupations/{id}/day-status` `{"status":"Ead"}` ou `"Letivo"` ou `"NaoLetivo"`.
- `POST /api/occupations/{id}/release` `{"confirm":true}` libera **uma** ocorrência.
- `POST /api/occupations/release-many` `{"occupationIds":[1,2],"confirm":true}` libera várias.
- `GET /api/occupations/{id}/room-options` indica salas para realocação,
  inclusive se ocupadas/incompatíveis.
- `PUT /api/occupations/{id}/room` `{"roomId":3,"notifyTeachers":true}`
  troca a sala daquela ocorrência sem depender da coordenação.
- `GET /api/occupations/{id}/history` mostra alterações e cancelamentos.

**Decisão pendente de negócio:** marcar EAD ou não letivo altera a situação da turma,
**não libera automaticamente a sala**. A liberação precisa ser explícita. Isso
protege reservas enquanto a instituição não confirma outra política.

### Empréstimos sem aprovação de coordenação

1. O **titular** identifica no `/api/agenda` os IDs das ocorrências das quais é dono,
   no período original da reserva; `POST /api/loans/offer` envia uma ou várias
   ocorrências para outro professor:
   `{"roomOccupationIds":[11,12],"borrowerId":"ID_PROF_B","reason":"Aula de robótica"}`.
2. O **destinatário** chama `POST /api/loans/{id}/accept`, informando turma, alunos,
   recursos e softwares da aula; cada ocorrência de uma oferta múltipla é aceita individualmente.
3. O **titular** chama `POST /api/loans/{id}/finalize` com um dos destinos:
   `{"disposition":"Ead"}`, `{"disposition":"NaoLetivo"}` ou
   `{"disposition":"OutraSala","replacementRoomId":3}`.
4. O histórico original é mantido. A agenda indica `originalTeacherId`,
   `actualTeacherId`, `isBorrowed`, `loanId` e `loanDisposition`.

O sistema valida novamente as datas, sala e o turno, impede empréstimo duplicado,
verifica compatibilidade da aula do destinatário e, para realocação da turma titular,
confere a nova sala e conflitos antes de concluir. Não há aprovação administrativa.
Empréstimos vigentes bloqueiam operações incompatíveis de transferência/liberação.

### Painel e notificações

- `GET /api/dashboard/usage?from=2026-10-01&to=2026-10-31` lista salas mais/menos
  ocupadas entre as que possuem ocorrências, horas e número distinto de salas por data.
  Filtros opcionais `shiftId` e `classGroupId`. Uma sala que não aparece em `Rooms`
  possui zero ocorrências no período; o frontend pode cruzar com `/api/rooms`.
- `GET /api/notifications` devolve até 100 notificações do usuário, com autoria (ID).
- `POST /api/notifications/{id}/read` marca como lida.

### Catálogo e permissões

- Cadastro de salas/equipamentos/softwares somente pela coordenação/Admin.
- Turnos, semestres e turmas têm endpoints administrativos.
- Professor pode solicitar/confirmar, alterar dia, liberar e transferir **sua própria** alocação.
- Admin pode transferir/liberar alocações da instituição e consultar o painel.
- Os endpoints legados `/api/schedules/generate` e `/publish` foram **preservados**
  para não descartar o código original, mas a geração automática da grade
  completa **não é o fluxo principal e não deve ser utilizada no MVP sem nova validação**.
- O endpoint legado `POST /api/bookings/{id}/approve` não efetiva mais reservas;
  usar `POST /confirm`.
- Os endpoints antigos de empréstimo com aprovação do admin foram substituídos
  por `/offer`, `/accept` e `/finalize`.

## Integração com o frontend antigo

O ZIP React original ainda espera `/bookings/{id}/approve`,
`/loans/{id}/owner-approve`, `/loans/{id}/admin-approve` e o fluxo de
"solicitação pendente". **Essas telas devem ser alteradas antes de um teste ponta a ponta.**
A documentação em `SalaGest.http` fornece exemplos das novas chamadas. A API usa
Bearer Token do ASP.NET Core Identity 8 e serializa enums com nomes (strings).
Datas e horários de aula são **locais da instituição sem sufixo `Z`**.

## Limitações e próximos testes

- Não há calendário institucional importado; o professor controla a situação de ocorrências.
- Não há reservas de frações de turno.
- Remarcação de **data** exige liberar a ocorrência antiga e criar outra;
  a transferência direta altera **sala**, não data.
- Uma turma sem cadastro de atribuições ainda pode ser selecionada por um professor;
  cadastros/permissões acadêmicas mais restritos deverão ser discutidos.
- Testar SQL Server real: concorrência de dois professores na mesma sala,
  recorrência parcialmente disponível, troca da mesma turma, múltiplos empréstimos
  e realocação da turma cedente.
- Verificar política de segurança para cadastro público de professores antes de publicar na rede da instituição.

**Não disponibilize o sistema para operação real sem compilar, migrar, testar e
revisar as políticas de acesso na infraestrutura da instituição.**
