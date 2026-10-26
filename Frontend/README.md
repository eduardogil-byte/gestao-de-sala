# SalaGest — Frontend v0.2 (início do desenvolvimento)

React 18 + TypeScript + Vite + Tailwind CSS. Esta versão foi alinhada aos endpoints do arquivo **SalaGest_Backend_v02_Inicio_Desenvolvimento.zip**. Não é compatível com todas as rotas de empréstimos da versão antiga `SalaGest_Backend_MVP.zip`.

## Requisitos

- Node.js 20+ (recomendado 22) e npm;
- .NET 8 + backend **v0.2** configurado e em execução;
- SQL Server operacional e migrações aplicadas ao backend.

## Executar no Windows

Na pasta `Frontend`, onde está o `package.json`:

```powershell
npm install
npm run build
npm run dev
```

Abra **http://localhost:5173**. O proxy do Vite redireciona `/api` para **http://localhost:5108**. Se o backend estiver em outra porta, copie `.env.example` para `.env.local` e altere `VITE_API_TARGET`; reinicie o frontend.

As credenciais e connection string do SQL Server devem permanecer **somente no backend**. O frontend usa token da API via `sessionStorage`.

## Funcionalidades implementadas na interface

- Login e registro de professores; navegação por perfil.
- Cadastros de ambientes, grupos de computadores, softwares, finalidade da sala, semestres e turmas (admin).
- Reservas por turno completo, em data única ou dias selecionados de uma semana, com extensão até uma data final e dia semanal de EAD opcional.
- Quantidade de alunos e alunos por computador (uso em duplas/grupos).
- Seleção ordenada de salas, incluindo as ocupadas/incompatíveis; especificações técnicas, ocupantes e conflitos por data.
- Confirmação direta pelo professor, inclusive apenas datas disponíveis quando há conflitos; opção de substituir alocação própria da turma após confirmação.
- Empréstimos: oferta de datas/turnos próprios para outro professor (até 150 por oferta), aceite do destinatário com requisitos da aula e finalização do titular (EAD, não letivo ou outra sala).
- Agenda semanal; alterar status letivo, trocar sala, liberar uma data ou liberar em lote; bloqueio administrativo.
- Notificações internas e painel de uso por dia, turno e turma, com salas mais/menos utilizadas.

**Regra ainda em aberto:** marcar um dia como EAD ou não letivo **não libera automaticamente a sala**. A liberação continua uma ação separada, como definido provisoriamente no backend v0.2.

## Atenção à implementação

- A reserva é criada primeiro com status `Pendente`, mas **não depende de aprovação**. O próprio professor seleciona uma sala e usa `/api/bookings/{id}/confirm`.
- Em uma recorrência parcial, o sistema mostra conflitos e permite confirmar somente as datas viáveis. A API revalida tudo no salvamento.
- A coordenação pode visualizar reservas e agir sobre ocorrências pelo calendário. Transferências são sempre validadas pela API.
- Em empréstimos com várias datas, a API gera uma oferta por ocorrência; os aceites e finalizações são por ocorrência, não por série inteira.
- A área antiga de geração global de grade foi removida do menu principal, sem apagar seus arquivos de origem. Não é prioridade do novo MVP.

## Validação antes de usar na instituição

Este pacote passou por verificação estática de sintaxe TypeScript/TSX, mas **não teve build completo nem execução integrada comprovados aqui**, pois a instalação das dependências npm não foi concluída neste ambiente. No seu computador, executar `npm install`, `npm run build`, `npm run dev` e testar com a API v0.2 e um SQL Server real.

Consulte `TESTES_MANUAIS.md` para testar os fluxos com dois professores e um administrador.
