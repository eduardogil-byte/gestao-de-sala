# Como funciona o SalaGest

O SalaGest organiza o uso de ambientes por professores e pela administração. O sistema não cria automaticamente a grade escolar: a instituição define os dias e turnos das turmas, e o SalaGest ajuda a distribuir salas, registrar reservas e acompanhar alterações.

## Visão geral

1. **Acesso:** o usuário entra com sua conta. O cadastro de professores é feito por um Admin. Se o acesso institucional (SSO) estiver habilitado, também é possível entrar por esse provedor.
2. **Preparação dos dados:** a administração mantém ambientes e seus recursos, turnos, semestres, turmas e informações pedagógicas. Professores e atribuições vinculam docentes às aulas; habilitação docente é um dado separado e não cria uma aula.
3. **Escolha do trabalho:** depois de entrar, o usuário consulta agendas e pode fazer uma reserva direta, enviar uma proposta de planejamento semestral ou participar de um empréstimo de ambiente.
4. **Validação e registro:** a API verifica identidade, permissão, dados, compatibilidade e conflitos antes de gravar no SQL Server. As operações relevantes mantêm histórico de auditoria e podem gerar notificações.

## Fluxograma principal

```mermaid
flowchart TD
    A([Início]) --> B{Usuário tem conta?}
    B -- Não --> C[Admin cadastra o professor]
    C --> D[Usuário entra com senha ou SSO habilitado]
    B -- Sim --> D
    D --> E{API valida identidade e acesso}
    E -- Não --> F[Exibe erro ou solicita novo acesso]
    F --> D
    E -- Sim --> G[Abre painel conforme o perfil]
    G --> H{Ação desejada}

    H -->|Reserva do dia a dia| R1[Professor informa turma, data ou recorrência, turno e necessidades]
    R1 --> R2[Sistema apresenta ambientes e disponibilidade]
    R2 --> R3[Professor escolhe o ambiente]
    R3 --> R4[API revalida permissão, turno, compatibilidade e conflitos]
    R4 --> R5{Há datas indisponíveis?}
    R5 -- Não --> R8[Confirma as datas disponíveis]
    R5 -- Sim --> R6[Mostra conflitos e pede confirmação explícita da reserva parcial]
    R6 --> R7{Professor confirma somente as datas livres?}
    R7 -- Não --> R9[Não cria as ocupações]
    R7 -- Sim --> R8
    R8 --> R10[Grava ocupações, auditoria e notificação]

    H -->|Planejamento semestral| P1[Professor cria e envia propostas de alocação]
    P1 --> P2[Admin revisa e aprova ou rejeita cada proposta]
    P2 --> P3{Proposta aprovada?}
    P3 -- Não --> P4[Professor pode revisar e reenviar]
    P4 --> P1
    P3 -- Sim --> P5[Admin consulta a prévia de publicação]
    P5 --> P6[API revalida o planejamento e os conflitos]
    P6 --> P7{Publicação válida e confirmada?}
    P7 -- Não --> P8[Corrigir pendências ou atualizar a prévia]
    P8 --> P5
    P7 -- Sim --> P9[Publica e cria as ocupações ainda não existentes]
    P9 --> P10[Grava auditoria e notifica os professores]

    H -->|Empréstimo| L1[Titular oferece ocorrências futuras da própria alocação]
    L1 --> L2[Outro professor aceita e informa os dados da aula]
    L2 --> L3[API verifica compatibilidade e conflitos]
    L3 --> L4{Empréstimo pode prosseguir?}
    L4 -- Não --> L5[Informa o problema; não confirma o empréstimo]
    L4 -- Sim --> L6[Titular define o destino da própria turma]
    L6 --> L7{EAD, não letivo ou outra sala?}
    L7 --> L8[Confirma o empréstimo e registra o histórico]
    L7 --> L9[Valida a outra sala e cria a realocação da turma titular]
    L9 --> L8

    H -->|Consultar| Q[Consulta agendas, ambientes, notificações e relatórios conforme permissão]
    R10 --> Z([Fluxo concluído])
    R9 --> Z
    P4 --> Z
    P8 --> Z
    P10 --> Z
    L5 --> Z
    L8 --> Z
    Q --> Z
```

## Dois processos que não devem ser confundidos

- **Reserva cotidiana:** o professor escolhe uma sala e confirma diretamente. Não exige aprovação administrativa de rotina. Se uma recorrência tiver conflitos, o sistema informa as datas afetadas; reservar somente as datas livres exige confirmação explícita.
- **Planejamento semestral:** o professor envia propostas; o Admin decide e, depois, consulta a prévia e publica. Aprovar uma proposta não ocupa a sala por si só: as ocupações são criadas na publicação, após nova validação.

## Empréstimos

O titular oferece datas/turnos que já estão em sua alocação; o destinatário precisa aceitar e informar as necessidades da aula. Em seguida, o titular informa se sua própria turma ficará em EAD, não letivo ou será realocada para outra sala. O sistema registra a operação e verifica conflitos; EAD ou não letivo, por si só, não libera automaticamente uma sala.

## Onde acontece cada parte

- **Frontend (React):** telas, formulários, navegação e apresentação dos dados.
- **API (ASP.NET Core):** autenticação, autorização por perfil e validação das regras de negócio.
- **Banco (SQL Server):** usuários, turmas, ambientes, propostas, reservas/ocupações, empréstimos e histórico.

As verificações decisivas acontecem na API, mesmo quando a interface já mostra disponibilidade ou recomendações. Assim, conflitos ou alterações simultâneas são verificados novamente antes de confirmar e gravar.
