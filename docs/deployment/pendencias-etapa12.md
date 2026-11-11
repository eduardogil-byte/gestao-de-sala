# Pendências consolidadas após a auditoria da Etapa 11

Estado em 10/11/2026. A fonte funcional é o [escopo SENAI](../referencias-design/escopo-senai.docx); [DECISOES.md](../DECISOES.md) diferencia decisões aprovadas de dúvidas. A [rastreabilidade SG-30](../tasks/SG-30-rastreabilidade.md) traz IDs e evidências detalhadas. A Etapa 11 verificou o código e aprovou 83 testes frontend e 200 backend; não executou o fluxo completo com SQL Server isolado. `Atendido no código` não significa aceito pela instituição.

| Prioridade | Pendência / IDs | Impacto | Dependência e próximo passo |
| --- | --- | --- | --- |
| Bloqueadora para homologação | Isolamento SQL e execução integrada; RNF-07/08/12 | Sem evidência de integridade, concorrência e recuperação em SQL Server, não se pode liberar dados reais. | Reservar instância, TLS e identidades restritas, validar manifesto, migrar/provisionar banco sintético com aprovações separadas; seguir [SG-etapa6B](../tasks/SG-etapa6B.md) e [Etapa 13](etapa13.md). |
| Alta | D-01, D-03; RN-03/04/06, RF-A02, RF-R01/02 | Denominador de ocupação e interpretação de CH podem divergir da política oficial. | Coordenação aprovar capacidade por turno/ambiente, calendário e diferença entre horas pedagógicas e físicas; validar indicadores com base conhecida. |
| Alta | D-02; RN-05/10, RF-L04 | O motor atual bloqueia conflito docente; política de aviso e fechamento da UC não está homologada. | Decisão institucional antes de mudar regra ou publicar planejamento com CH inconsistente. |
| Alta | D-04; RN-13, RF-I02, RF-X02 | Carga docente aparece sem limite institucional de 800 h parametrizado. | Confirmar limite geral ou por vínculo; definir parâmetros e critérios de alerta. |
| Alta | D-06; RN-14, RF-D05, RNF-03/04 | CPF tem máscara/restrição em fluxos, mas armazenamento textual e auditoria de todas as consultas não foram resolvidos. | Avaliação do DPO, necessidade do dado, permissões, proteção em repouso, gestão de chaves e migração específica. |
| Alta | RF-A01 | O cadastro aceita código de ambiente vazio; índice único só cobre códigos não nulos. | Confirmar obrigatoriedade, inventariar registros sem código e planejar correção/migração sem alterar dados existentes silenciosamente. |
| Média | RF-L01/03/06/07/11; RN-07/08 | Blocos completos são movidos por formulário; arraste integral, bandeja sem ambiente e reversão atômica não estão completos. | Definir escopo/identidade de blocos e testar concorrência antes de implementar. Movimentação individual, prévia e histórico existentes devem ser preservados. |
| Média | RF-D01/04/06/07 | Vínculo contratual/carga contratual, equivalência de competências, férias/ausências e sugestão completa não estão demonstrados. | Validar fonte institucional e contratos antes de novos campos ou regras. |
| Média | RF-A04/05/06/07 | Ficha não cobre monitores e velocidade de rede medida; alertas de obsolescência/garantia, segurança normativa e anexos não estão completos. | Definir origem/manutenção dos dados, retenção e prioridade dos itens Should/Could. |
| Média | RF-R01/02/03/05/06/07, RN-16 | Capacidades sem ambiente, barras empilhadas, oportunidade de curso inteiro, heatmap, vencimentos e previsão não estão completos. | Definir indicadores e dados autorizados; não inferir viabilidade de curso nem criar percentuais sem denominador. |
| Média | RF-X01/02/03/04; D-07/08 | Papéis atuais são Admin/Professor; SSO institucional, parâmetros gerais, auditoria integral e multiunidade estão pendentes. | Instituição decidir perfis, abrangência, provedor OIDC e escopo da auditoria. |
| Média | RF-P02/04/06, RF-I03, RF-L09/10; D-05/09/11 | Períodos, disponibilidade de docentes, replicação de ofertas, conflitos e notificações precisam de validação ou implementação parcial. | Homologar calendário real e regras de turma/bloco/EAD; não interpretar ausência de aulas como disponibilidade. |
| Média | RNF-01/02/05/06/10 | Desempenho, disponibilidade, acessibilidade assistiva e compatibilidade Chrome/Edge/Firefox/Excel não foram demonstrados em ambiente representativo. | Medir com 60 ambientes/1.000 blocos e fazer roteiro de teclado, leitor de tela, responsividade e arquivos reais sintéticos. |
| Baixa | Avisos nullable dos testes backend | Não impediram 200 testes aprovados, mas prejudicam sinalização do build. | Revisar `TeachingAssignmentTests.cs:161` e `OccupationMoveTests.cs:416` em mudança separada. |

## O que já existe

As rotas e telas atuais incluem login e papéis Admin/Professor, catálogo, docentes, ambientes/inventário, calendário, compatibilidade, reservas e recorrências, empréstimos, agendas, cronograma, planejamento com aprovação/publicação distintas, indicadores, importação e XLSX. Há validação e testes de unidades/HTTP simulado; isso não equivale a aceitação institucional nem a SQL Server real.

## Critério para encerrar as pendências

Cada item precisa de decisão registrada quando for institucional, implementação/testes quando faltar comportamento e evidência de homologação ponta a ponta no destino sintético aprovado. As pendências `Should`/`Could` do escopo não devem ser anunciadas como concluídas nem introduzidas sem nova autorização. Nenhuma mudança de regra ou schema é autorizada por este documento.
