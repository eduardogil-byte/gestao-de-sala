# SalaGest — Backend

ASP.NET Core 8 Minimal API, Entity Framework Core 8, SQL Server e ASP.NET Core Identity com Bearer Token. O frontend versionado nesta base já usa confirmação direta de reservas e empréstimos por oferta, aceite e finalização.

## Instalação e execução

Siga o [guia principal](../README.md) para pré-requisitos, conexão SQL, credenciais locais, restauração da ferramenta EF, aplicação de migrations e execução. Execute os comandos do backend na pasta `Backend/`.

- `SalaGest.Api.csproj`: alvo `net8.0`, pacotes EF Core 8.0.0.
- `dotnet-tools.json`: ferramenta local `dotnet-ef` 8.0.32; restaure com `dotnet tool restore --tool-manifest .\dotnet-tools.json` e confira `dotnet ef --version`.
- `appsettings.json`: instância padrão `localhost`, banco `SalaGestDb`, autenticação integrada. Uma instância nomeada deve ser configurada explicitamente.
- `Properties/launchSettings.json`: perfil `SalaGest.Api`, ambiente Development, API em `http://localhost:5108` e Swagger em `/swagger`.

A migration `20261014054221_InitialCreate` já existe. Não a recrie para instalar o projeto. Aplique as migrations existentes somente ao banco de desenvolvimento conferido; a API não as aplica automaticamente.

## Configuração e inicialização

A API usa a configuração padrão do ASP.NET Core. A factory de design time em `Data/AppDbContextFactory.cs` usa somente `appsettings.json` e variáveis de ambiente, sem User Secrets. Para manter migrations e execução no mesmo banco, defina `ConnectionStrings__DefaultConnection` no terminal que fará ambas as operações, como detalhado no guia raiz.

`Seed:AdminEmail` e `Seed:AdminPassword` podem ser definidos com User Secrets em Development. O seed cria `Admin` e `Professor`, os turnos abaixo somente quando não existe nenhum turno e o Admin configurado. Não fornece base demonstrativa completa, não altera turnos existentes nem promove automaticamente uma conta comum preexistente.

| Turno inicial | Horário |
| --- | --- |
| Manhã | 08:00–12:00 |
| Tarde | 13:30–17:30 |
| Noite | 18:30–22:30 |

## Organização e testes

`Models` define entidades, `Contracts` define entradas HTTP, `Data` configura persistência, `Endpoints` contém rotas e autorização e `Services` contém regras de recorrência, conflitos, compatibilidade e geração legada.

Na pasta `Backend/`:

```powershell
dotnet build SalaGest.Api.csproj
dotnet test .\SalaGest.Backend.Tests\SalaGest.Backend.Tests.csproj
```

Os cinco testes atuais estão em `BookingPeriodsTests.cs` e `RoomCompatibilityTests.cs`. Validam períodos e capacidade/quantidade de computadores sem SQL Server. Não comprovam login real, autorização HTTP, migrations, persistência ou concorrência. Para integração, consulte [TESTES_MANUAIS.md](../Frontend/TESTES_MANUAIS.md) e [SalaGest.http](SalaGest.http).

Esta contribuição revisou as instruções estaticamente; não executou instalação, build, testes ou banco. A execução e a homologação permanecem pendentes de evidências no ambiente de desenvolvimento.

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
  ocupadas, incluindo salas com zero ocorrências, horas e número distinto de salas por data.
  Filtros opcionais `shiftId` e `classGroupId`. O retorno inclui os IDs de todas as salas;
  o frontend cruza esses IDs com `/api/rooms` para apresentar os nomes.
- `GET /api/notifications` devolve até 100 notificações do usuário, com autoria (ID).
- `POST /api/notifications/{id}/read` marca como lida.

### Catálogo e permissões

- Cadastro de salas/equipamentos/softwares somente pela coordenação/Admin.
- Turnos, semestres e turmas têm endpoints administrativos.
- Professor pode solicitar/confirmar, alterar dia, liberar e transferir **sua própria** alocação.
- Admin pode transferir/liberar alocações da instituição e consultar o painel.
- Os endpoints legados `/api/schedules/generate/{semesterId}` e `/api/schedules/{id}/publish` foram **preservados**
  para não descartar o código original, mas a geração automática da grade
  completa **não é o fluxo principal e não deve ser utilizada no MVP sem nova validação**.
- O endpoint legado `POST /api/bookings/{id}/approve` não efetiva mais reservas;
  usar `POST /confirm`.
- Os endpoints antigos de empréstimo com aprovação do admin foram substituídos
  por `/offer`, `/accept` e `/finalize`.

## Autenticação e integração com o frontend

`POST /api/auth/login` retorna o token usado em `Authorization: Bearer <accessToken>`. `GET /api/me` retorna a identidade autenticada. `POST /api/auth/register` permite cadastro público de Professor nesta base; essa política ainda requer revisão antes da disponibilização institucional. `POST /api/auth/change-password` exige autenticação.

No Swagger, execute `POST /api/auth/login` e copie o `accessToken` retornado. Clique em **Authorize**, cole somente o valor do token, sem o prefixo `Bearer`, e confirme. A configuração HTTP Bearer do Swagger acrescenta esse prefixo ao cabeçalho `Authorization` nas chamadas autenticadas.

O cliente React atual chama `/confirm` nas reservas e `/offer`, `/accept` e `/finalize` nos empréstimos. O proxy Vite de desenvolvimento preserva `/api` e encaminha para a porta 5108 por padrão. Consulte o [README do frontend](../Frontend/README.md) para configurar outro destino.

A API serializa enums por nome (strings). Datas/horários de aulas são locais da instituição, sem sufixo `Z`; carimbos de auditoria com sufixo `Utc` têm finalidade distinta. `/api/agenda` limita a consulta a 32 dias. O painel `/api/dashboard/usage` exige autenticação e aceita o intervalo validado no endpoint; o filtro atual considera situação letiva e empréstimos, portanto não representa automaticamente toda a capacidade física reservada.

O Swagger está habilitado somente em Development. A política CORS padrão permite `http://localhost:5173` e `http://localhost:3000`. O fluxo local documentado utiliza o proxy Vite.

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
