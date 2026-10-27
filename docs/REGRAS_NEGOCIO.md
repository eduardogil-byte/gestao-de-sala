# SalaGest — Regras de negócio

**Objetivo:** ser a referência para o comportamento esperado do sistema, independentemente de como o código foi organizado.
**Estado:** regras confirmadas nas conversas e requisitos do escopo SENAI 1.0. Se houver conflito, consulte `DECISOES.md` e não resolva uma decisão institucional por conta própria.

## Conceitos
- **Curso → Módulo → Unidade Curricular (UC) → Capacidade:** hierarquia pedagógica. Capacidade tem descrição, conteúdos e carga horária; requisitos de ambiente serão vinculados em tarefas posteriores.
- **Habilitação docente:** o professor pode ministrar um curso/UC/capacidade (SG-10). **Atribuição:** o professor foi designado para uma UC de determinada turma e período (SG-11). Não são sinônimos.
- **Reserva/alocação:** ocupação de um ambiente em datas e turnos, sempre conferindo conflitos antes de confirmar.
- **Turno:** unidade de ocupação cotidiana acordada para o MVP, com duração configurável; não codificar quatro horas como constante universal.

## Regras de reservas e turmas — decisões confirmadas pelo projeto
1. Turmas já possuem dias/turnos de aula definidos pela instituição. O SalaGest distribui os **ambientes**, não gera toda a grade escolar do zero.
2. Uma turma pode ter vários professores e utilizar salas distintas ao longo do semestre. Não vincular uma turma permanentemente a uma sala nem a um único professor.
3. O professor escolhe datas, dias da semana, período e sala; o sistema mostra as opções **ordenadas por adequação**, incluindo opções ocupadas ou inadequadas com explicação explícita. Mostrar alternativas não é autorização para confirmar um conflito.
4. Antes de confirmar, verificar disponibilidade efetiva, número de alunos, recursos e compatibilidade técnica. **Jamais aceitar duas ocupações confirmadas para mesmo ambiente/data/turno.** Proteger também contra operações simultâneas no backend/banco.
5. Na recorrência, indicar datas indisponíveis, responsável e turma; solicitar confirmação explícita para reservar somente as datas livres. Mostrar as ocorrências propostas e a última data efetiva.
6. Reservas cotidianas válidas podem ser feitas diretamente pelo professor; coordenação atua na resolução de conflitos. A política de **publicação do plano semestral** ainda precisa ser acordada à parte.
7. O titular de uma reserva válida mantém prioridade. A coordenação poderá remanejar quando necessário, com histórico e sem alteração silenciosa de outras aulas.
8. Ocorrências podem receber situação Letivo, EAD ou Não letivo/recesso. Não presumir automaticamente que EAD libera um ambiente já alocado; isso depende das regras de reserva e da decisão institucional.

## Empréstimos de ambiente — decisões confirmadas
1. Empréstimo é temporário e nunca ultrapassa as datas/turnos cobertos pela alocação original do titular.
2. O destinatário deve aceitar; depois, o titular informa como sua turma ficará nas ocorrências emprestadas: EAD, não letivo ou realocação em outro ambiente.
3. Não exigir aprovação rotineira da coordenação para empréstimo entre professores; se houver impasse, a coordenação decide.
4. Não apagar a ocupação original, não gerar dupla ocupação e registrar os envolvidos e alterações.

## Regras pedagógicas — escopo SENAI
1. Uma UC possui CH prevista; capacidades possuem CH necessárias positivas. Mostrar `Balanced`, `MissingHours`, `ExcessHours` ou `Undefined` conforme o contrato existente. A regra de bloquear **publicação** com horas inconsistentes ainda depende da política institucional.
2. Dias/encontros estimados = teto(CH da capacidade ÷ horas por turno), utilizando a duração configurada. Distinguir CH pedagógica de horas físicas ocupadas por turnos arredondados; metodologia de indicadores ainda está em aberto.
3. Checar se o professor está habilitado para a UC da atribuição e **alertar** quando não estiver cadastrada no perfil. Ausência de habilitação não é prova de incapacidade; não atribuir habilitação automaticamente.
4. O ambiente deve ser classificado como compatível, parcial ou incompatível a partir dos requisitos efetivos da atividade × recursos disponíveis, incluindo quantidade, softwares e especificações críticas. A política de aceitar incompatibilidade para reserva ainda requer definição.
5. Feriados, recessos e dias não letivos oficiais devem ser desconsiderados do calendário de encontros presenciais conforme o calendário válido da turma.
6. Conflito de **ambiente** é bloqueante. Conflito de **professor** requer decisão institucional específica (bloqueio ou alerta).

## Gestão do semestre — escopo SENAI 1.0
- Visualizações por semana/mês/semestre de ambientes e professores.
- Movimentar blocos de alocação com validação transacional, mantendo CH e histórico; permitir desfazer/refazer com auditoria.
- Calcular ocupação com parâmetros institucionais (dias/turnos/horas/semanas); exibir ociosidade, gargalos e oportunidades. Limiares sugeridos pelo documento: >=85% e <40%, configuráveis.
- Importação Excel/CSV com validação; exportação de relatórios Excel com dados pessoais protegidos.
- Sem gerar automaticamente uma grade otimizada (solver) na versão 1.0; sem integração SGE automática na versão 1.0.

## Não antecipar regras
Se um requisito estiver marcado como **pendente** em `DECISOES.md`, não inventar política no backend/frontend. Concluir somente o comportamento aprovado pela Issue atual e registrar a dúvida quando bloquear a implementação.
