# SG-30 — Rastreabilidade do escopo do coordenador

Fonte: `docs/_local/Escopo_Coordenador.pdf`, versão 1.0 de 23/10/2026, páginas 5–9, 18–19 e 21–25. O PDF é local e ignorado pelo Git. Esta matriz resume requisitos, sem reproduzir o documento. A coluna de situação descreve **evidência de código e testes automatizados**; nenhum fluxo completo no SQL Server isolado ou navegador foi homologado nesta rodada. Os estados abaixo não substituem aceite institucional.

**Legenda:** `Código, sem integração` = implementação localizada e testes automatizados relacionados aprovados; `Parcial` = diferença funcional ou de apresentação observada; `Decisão` = política institucional ainda aberta; `Pendente` = implementação não encontrada no escopo verificado.

## Regras RN-01 a RN-18

| Regra | Situação observada | Evidência e pendência |
| --- | --- | --- |
| RN-01 — limites do semestre | Código, sem integração | `Semester` armazena datas; calendário configurável em `AcademicCalendarEndpoints.cs`. Não usar datas fixas do protótipo sem calendário oficial. |
| RN-02 — turnos oferecidos | Código, sem integração | `SchoolShift` e `RoomOperatingShift` configuráveis; `OccupancyIndicatorEndpoints.cs`. Não se presume que toda sala ofereça três turnos. |
| RN-03 — capacidade de horas | Decisão | `OccupancyIndicators.cs` soma turnos oferecidos em dias elegíveis; diverge da fórmula fixa exemplificada no protótipo. D-01 e calendário institucional precisam de aceite. |
| RN-04 — encontros por CH/turno | Código, sem integração | `PedagogicalCatalogRules.EstimateMeetings`; duração cadastrada e arredondamento para cima. D-03 continua aberta para conciliação com horas físicas. |
| RN-05 — CH positiva e fechamento da UC | Parcial | Catálogo e resumo de CH existem; política de bloquear publicação por CH incompleta continua D-02. |
| RN-06 — taxa e limiares | Código, sem integração | `OccupancyIndicators.cs` usa capacidade comprovada e limiares configuráveis; banco local não tem turnos oferecidos para validar percentuais. |
| RN-07 — identidade do bloco | Parcial | SG-18 usa atribuição, propostas publicadas e ocorrências efetivas; não cobre ofertas sem essa composição comprovável. |
| RN-08 — sequência e recálculo | Parcial | Prévia/confirmar bloco recalculam datas preservando ordem; ação por formulário, sem arrastar e soltar ou mudança de turno. |
| RN-09 — conflito de ambiente | Código, sem integração | `ReservationRules.ConflictAsync` e revalidação no movimento; concorrência SQL Server ainda sem ensaio. |
| RN-10 — conflito de instrutor | Decisão | Motor atual bloqueia coincidências de professor, enquanto o protótipo avisa. D-02 exige confirmação institucional; não afrouxar regra por dedução. |
| RN-11 — alunos × lugares | Código, sem integração | Compatibilidade da SG-14 considera `Room.Seats`; política de alerta versus bloqueio deve ser confirmada nos fluxos. |
| RN-12 — fim do semestre | Código, sem integração | Prévia de bloco impede sequência que ultrapasse `Semester.EndDate`; validar com massa sintética. |
| RN-13 — limite de carga docente | Parcial | Agenda soma horas físicas, mas não há limite institucional de 800 h configurado nem aviso de excesso; D-04 aberta. |
| RN-14 — CPF | Parcial | Validação, unicidade e máscara existem; `AppUser.Cpf` permanece texto no Identity, sem criptografia de campo ou auditoria de toda consulta. D-06/DPO. |
| RN-15 — UC fora do perfil | Código, sem integração | Habilitações estruturadas e avisos da SG-10/11; validar no fluxo de atribuição. |
| RN-16 — oportunidade de curso | Parcial | SG-25 analisa capacidade pedagógica, compatibilidade e períodos potenciais; não comprova viabilidade de curso inteiro. |
| RN-17 — dias não letivos | Código, sem integração | `AcademicCalendar` e cálculo de blocos ignoram dias inelegíveis; ocupações já efetivas não desaparecem. |
| RN-18 — compatibilidade | Código, sem integração | Inventário e requisitos estruturados da SG-13/14, classificações e justificativas; validar com hardware/licenças sintéticos. |

## Requisitos funcionais Must (páginas 7–9)

| ID | Escopo resumido | Situação | Código/evidência e lacuna |
| --- | --- | --- | --- |
| RF-A01 | Cadastro e inativação de ambientes | Código, sem integração | `Room.Active`, código, localização, tipo e capacidade; `ApiEndpoints.cs`, `Rooms.tsx`. |
| RF-A02 | Disponibilidade e capacidade | Parcial | `RoomOperatingShift` e SG-23 usam calendário real, não os parâmetros fixos de semanas do protótipo; D-01. |
| RF-A03 | Recursos por ambiente | Código, sem integração | `RoomResource` inclui quantidade, condição, detalhes, voltagem e validade; `EnvironmentInventoryEndpoints.cs`. |
| RF-A04 | Ficha técnica de informática | Parcial | `ComputerGroup` e `GroupSoftware` cobrem RAM, CPU, armazenamento, SO, versões/licenças e vários atributos; campos como monitores e velocidade medida de rede não foram localizados. |
| RF-D01 | Cadastro de docentes | Parcial | `AppUser` tem nome, CPF, formação e e-mail; vínculo contratual e carga contratual não foram localizados. |
| RF-D02 | Importação de docentes | Código, sem integração | SG-26: CSV/XLSX, prévia, confirmação, atualização por CPF; testes automatizados. |
| RF-D03 | Habilitação por cursos e UCs | Código, sem integração | `TeacherCourseQualification` e `TeacherUnitQualification`; endpoints SG-10. |
| RF-D04 | Habilidades e competências | Parcial | Há textos de habilidades e vínculo estruturado a capacidades; equivalência formal de competência institucional precisa de validação. |
| RF-D05 | CPF restrito, mascarado e auditado | Parcial | Respostas comuns e relatórios evitam CPF completo; proteção em repouso e auditoria de consultas não estão comprovadas. D-06. |
| RF-C01 | Cursos, módulos, UCs e CH | Código, sem integração | `PedagogicalCatalog.cs`, endpoints e página de catálogo. |
| RF-C02 | Capacidades com CH/conteúdos/requisitos | Código, sem integração | `CurricularCapability` e `CapabilityEnvironmentRequirement`; SG-08/14. |
| RF-C03 | Soma da CH da UC | Código, sem integração | Resumo de carga curricular e testes `CurricularWorkloadTests`. |
| RF-C04 | Requisitos técnicos estruturados | Código, sem integração | Recursos, computadores, software/licenças em requisitos SG-14. |
| RF-P01 | Oferta/turma com docente e turno | Código, sem integração | `ClassGroup`, `TeachingAssignment`, propostas do `SemesterPlan`; validar composição com múltiplos dias. |
| RF-P02 | Período e fim pela CH | Parcial | Prévia de encontros e propostas existem; conferir comportamento completo no navegador e calendário oficial. |
| RF-P03 | Calendário letivo | Código, sem integração | Feriados, recessos, EAD e exceções SG-12; testes automatizados. |
| RF-P04 | Alunos, tipo e perfil docente | Código, sem integração | SG-14/15 e avisos de habilitação; confirmar política de alerta/bloqueio institucional. |
| RF-L01 | Alocação por colunas, bloco arrastável e bandeja | Parcial | `RoomTimeline.tsx` arrasta ocorrências individuais; bloco completo usa formulário e não há bandeja de blocos sem ambiente. |
| RF-L02 | Cronograma semana/mês/semestre e resumo | Parcial | Três visões e ocupações presentes; equivalência exata ao resumo e faixas do protótipo ainda sem teste visual. |
| RF-L03 | Arrastar bloco no tempo/turno/ambiente | Parcial | Bloco recalculado por formulário, com turno da atribuição preservado; arraste atual move apenas ocorrência. |
| RF-L04 | Bloquear ambiente e avisar docente | Decisão | Ambiente bloqueado; professor também é bloqueado pelo motor atual. D-02. |
| RF-L05 | Impedir extrapolar semestre | Código, sem integração | Prévia de bloco valida fim do semestre. |
| RF-L06 | Desfazer/refazer movimentos | Parcial | SG-21 cobre eventos individuais elegíveis; movimento de bloco não possui reversão atômica. |
| RF-L08 | Matriz de compatibilidade | Código, sem integração | `EnvironmentCompatibilityEndpoints.cs` e SG-14; validar resultados por capacidade. |
| RF-I01 | Agenda nas três visões | Código, sem integração | `InstructorAgenda.tsx`, API de período, testes frontend/backend. |
| RF-I02 | Carga e limite docente | Parcial | Horas exibidas; ausência explícita de limite institucional no frontend. D-04. |
| RF-I03 | Conflitos e docentes sem aulas | Parcial | Conflitos destacados e ausência de atividade identificada; ausência de aula não comprova disponibilidade contratual. |
| RF-I04 | Professor vê/edita apenas próprios dados | Código, sem integração | Checagens de propriedade em endpoints de agenda/planejamento; testar IDs cruzados com contas reais sintéticas. |
| RF-R01 | KPIs e capacidades sem ambiente | Parcial | `ManagerDashboard.tsx` usa SG-23 para KPIs; cartão de capacidades sem ambiente do protótipo não foi localizado. |
| RF-R02 | Barras por ambiente empilhadas por turno | Parcial | Barra única por ambiente e distribuição de turnos separada; não empilhada como no PDF. |
| RF-R03 | Oportunidades por horas/turnos/requisitos | Parcial | SG-25 analisa capacidades e períodos potenciais; não afirma curso inteiro viável. |
| RF-R04 | Comparação entre semestres | Código, sem integração | SG-23/24 usa capacidade própria de cada semestre; falta base sintética de dois semestres. |
| RF-R08 | Exportar Excel | Código, sem integração | SG-27 gera XLSX; PDF é Could e permanece fora do escopo implementado. |
| RF-X01 | Perfis e SSO | Parcial | Admin/Professor e OIDC configurável; provedor real e matriz Coordenador/Gestor não definidos. D-08. |
| RF-X02 | Parâmetros institucionais | Parcial | Limiares SG-23 e duração de turnos configuráveis; carga docente e tabela geral de parâmetros não encontradas. D-01/D-04. |
| RF-X03 | Auditoria institucional | Parcial | `AuditTrail` e `AuditEntry` usados em operações críticas; cobertura integral de cadastros/consultas sensíveis ainda não comprovada. |

## Requisitos não funcionais e critérios de aceite prioritários

| Referência | Situação e verificação necessária |
| --- | --- |
| RNF-01 — cronograma em até 2 s; movimento em até 1 s com 60 ambientes/1.000 blocos | Não medido. Exige base isolada representativa, navegador e condições de medição registradas. Meta consta no PDF; não foi declarada alcançada. |
| RNF-03/04 — SSO, TLS, CPF protegido, LGPD | Parcial: SSO preparado e desligado; TLS depende da implantação; CPF em campo textual ainda precisa de decisão D-06 e proteção institucional. |
| RNF-06 — acessibilidade | Componentes e testes unitários existem; auditoria real com teclado, leitores e contraste não executada. |
| RNF-07/08 — integridade e concorrência | Código usa transações e revalidação; testes simultâneos em SQL Server e reação da interface a alterações concorrentes pendentes. |
| RNF-09 — trilha de auditoria | Infraestrutura SG-20 existe; verificar eventos de todos os fluxos na base sintética. |
| RNF-10 — navegadores/Excel | Builds e testes sem navegador; Chrome/Edge/Firefox e XLSX real ainda pendentes. |
| RNF-11 — parâmetros, regras, API | Testes automatizados e Swagger em Development existem; tabela institucional de parâmetros não localizada. |
| RNF-12 — backup diário e retenção | Scripts e guia preparados; operação, retenção e RPO/RTO não aprovados nem testados. |
| Critérios das páginas 11–18 | Percentuais, dias e exportação precisam concordar em base conhecida; sequência, bloqueios, CH, máscara de CPF e inventário exigem ensaio integrado. |

## Divergências de metodologia e decisões posteriores

- A página 19 do PDF usa CH pedagógica como exemplo de horas alocadas e reconhece divergência com turnos arredondados. A SG-23 adotou **ocupação física efetiva** e capacidade letiva comprovada; não se deve misturar as métricas. D-03 exige aceite institucional antes de declarar aderência plena ao cálculo original.
- O PDF sugere conflito de professor como aviso e deslocamento de bloco também entre turnos. As regras implementadas bloqueiam conflito de professor e preservam turno da atribuição, para não alterar programação pedagógica silenciosamente. D-02 e D-09/horários precisam de confirmação.
- O PDF propõe perfis Gestor, Coordenador, Instrutor e Consulta; o produto atual usa Admin/Professor. A separação de papéis depende de D-08.
- O PDF trata criptografia do CPF em repouso e auditoria de acesso como requisitos; o código atual mascara/restringe respostas, mas o campo de armazenamento não foi transformado. Isso demanda decisão D-06, desenho de migração e gestão de chaves; não aplicar transformação ao banco atual nesta rodada.
- O PDF foi escrito antes das decisões de implementação SG-07–32. Quando protótipo e decisões posteriores divergem, esta matriz registra a diferença sem substituir a decisão institucional.
