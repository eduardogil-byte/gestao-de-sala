# UX de reservas e catálogo de softwares

## Contratos preservados

- Reservas comuns aceitam `needsProjector`, `needsTeacherComputer`, requisitos de computadores e `softwareIds` do catálogo global. O servidor valida os IDs dos softwares. Recursos físicos do catálogo pedagógico possuem IDs próprios e não podem ser enviados em `softwareIds`; a seleção de recursos físicos na reserva comum depende de um contrato retrocompatível e de uma regra de compatibilidade equivalente.
- A RAM inicial de 8 GB pertence apenas ao formulário de nova reserva comum. Sem computadores para alunos e sem softwares selecionados, o formulário envia `minRamGb: 0`, preservando reservas comuns sem exigência de computadores. Reservas pedagógicas continuam usando requisitos da capacidade.
- Potência `Intermediario` aceita grupos `Intermediario` e `Alto` que também atendam RAM, computadores operacionais, softwares e licenças. Potência desconhecida não comprova atendimento. Entre salas compatíveis e com disponibilidade equivalente, a pontuação agora favorece discretamente potência superior comprovada.

## Decisões institucionais pendentes

- Definir se a reserva comum vinculada a uma turma pode usar turno diferente daquele identificado nas atribuições. O formulário solicita confirmação, mas o servidor mantém suas regras atuais de conflitos e não recebe uma autorização nova.
- Definir se recursos físicos do inventário poderão ser requisitos de reservas comuns e, se sim, como validar disponibilidade e compatibilidade antes da confirmação. Até lá, o formulário oferece somente softwares com IDs reconhecidos pelo contrato atual; os requisitos existentes de projetor e computador do instrutor permanecem controles próprios.
