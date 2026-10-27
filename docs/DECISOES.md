# SalaGest — Registro de decisões e dúvidas

Este documento separa **regras confirmadas**, **propostas do coordenador** e **decisões ainda em aberto**. O Codex não deve transformar uma proposta em regra definitiva sem confirmação.

## Confirmadas nas conversas de desenvolvimento
| ID | Decisão | Consequência técnica |
| --- | --- | --- |
| DC-01 | A instituição já estabelece dias e turnos das turmas. | Não gerar grade escolar do zero. |
| DC-02 | Reservas cotidianas válidas são feitas diretamente pelo professor. | Não adicionar aprovação obrigatória em cada reserva. |
| DC-03 | O professor escolhe a sala entre opções ordenadas por adequação, inclusive ocupadas, com aviso. | Separar recomendação de autorização efetiva para reservar. |
| DC-04 | Recorrência aceita confirmação parcial somente para datas livres. | Validar cada ocorrência; solicitar confirmação. |
| DC-05 | Empréstimo de sala: destinatário aceita e titular define o destino da própria turma; sem aprovação rotineira da coordenação. | Preservar reserva original, histórico e limites temporais. |
| DC-06 | Coordenação resolve impasses e pode remanejar, com segurança e rastreabilidade. | Não mudar reservas silenciosamente. |
| DC-07 | Uma turma pode ter mais de um docente, e uma sala pode variar conforme aula/professor. | Não fixar turma→sala ou turma→professor em relação 1:1. |
| DC-08 | Para a fase inicial, a reserva é por turno inteiro. | Não implementar granularidade por hora sem nova decisão. |
| DC-09 | Preferir C#/ASP.NET Core, EF Core/SQL Server, React/TypeScript/Tailwind; mudanças pequenas. | Reutilizar backend/frontend atuais; evitar arquitetura nova. |

## Implementações técnicas relatadas, não decisões institucionais
- SG-07: catálogo Curso→Módulo→UC, administrador escreve, autenticados leem.
- SG-08: CH planejada opcional da UC (`decimal(9,2)`), capacidade e resumo de CH.
- SG-09: interface do catálogo no React; build completo ainda não confirmado.
- SG-10: perfil do professor reutilizando `AppUser`; migration estava pendente no último relatório.
- SG-11: tarefa em andamento. **Não registrar como pronta sem relatório de execução.**

## Decisões institucionais em aberto (escopo SENAI, seção 18.3)
| ID | Tema | O que falta decidir |
| --- | --- | --- |
| D-01 | Capacidade semestral do ambiente | 400h por turno ou 400h por ambiente? |
| D-02 | Conflito docente e CH inconsistente | Bloquear ou avisar? Bloquear publicação com UC incompleta? |
| D-03 | Horas para indicadores | CH exata da capacidade ou turnos/dias arredondados? |
| D-04 | Carga docente | 800h é limite geral ou varia por vínculo? |
| D-05 | Calendário | Datas oficiais e calendários particulares por turma? |
| D-06 | CPF e LGPD | É indispensável? Quem consulta/exporta? Exige avaliação do DPO. |
| D-07 | Abrangência | Uma ou várias unidades? Integração institucional futura? |
| D-08 | Planejamento semestral | Quem propõe, quem aprova e quem publica; como notificar? |
| D-09 | Blocos | Uma oferta pode usar vários ambientes em períodos distintos? |
| D-10 | Horários | Necessidade futura de início/fim dentro do turno? |
| D-11 | EAD e reservas existentes | Marcar aula como EAD libera a sala? Até decisão institucional, SG-12 não cancela, altera nem libera reservas automaticamente. |

## Recomendações de arquitetura de produto (não aprovadas)
- Separar **reserva cotidiana direta** de eventual **aprovação/publicação de planejamento semestral**. Reconciliar com coordenação antes de implantar um segundo fluxo.
- Preservar o histórico de alterações, evitando exclusão física de registros relacionados.
- Adotar a comparação estruturada de requisitos técnicos para recomendações, com justificativas legíveis.

## Como registrar novas decisões
Acrescentar: data, ID, situação (`Confirmada`, `Proposta`, `Em aberto`), responsável pela decisão, regra, motivo e Issues afetadas. **Não mudar o status para Confirmada por dedução.**
