# Proteção de dados no SalaGest

Documento técnico de apoio à avaliação institucional. Não é política de privacidade, parecer jurídico, definição de base legal ou declaração de conformidade integral com a LGPD. Responsáveis, bases legais e prazos dependem de decisão institucional e avaliação jurídica/DPO.

## Inventário técnico observado

| Dados/categoria | Local e finalidade técnica | Acesso e apresentação | Exportação, logs e controles |
| --- | --- | --- | --- |
| Nome e identificador interno | `AspNetUsers` (`AppUser`); identificar autor, professor e relações históricas | O próprio usuário vê seu nome; professores autenticados consultam nomes para operações pedagógicas; Admin administra cadastros. APIs de reserva e agenda aplicam as regras de titularidade existentes | Exportação de docentes é restrita a Admin e inclui ID interno/nome. Sem logging de corpo de requisição configurado no app. |
| E-mail e nome de usuário | `AspNetUsers`; login local e contato/identificação da conta | `/api/me` devolve ao próprio usuário. `/api/teachers` fornece e-mail somente a Admin; professores recebem ID e nome para listas funcionais | Exportação genérica de docentes exclui e-mail. Não registrar credenciais ou corpos de autenticação. |
| CPF | `AspNetUsers.Cpf`, normalizado para dígitos e com índice único filtrado para valores não nulos; vinculação e deduplicação na importação SG-26 | Não é devolvido por endpoints comuns. A prévia de importação Admin mascara os dígitos e mensagens de validação não repetem o valor | Excluído da exportação SG-27. Não é usado como identidade de sessão/SSO. Hoje é armazenado sem criptografia de campo; ver decisão D-06 e proposta abaixo. |
| Formação, habilidades, conhecimentos e habilitações | Campos de perfil em `AppUser` e tabelas de vínculos docentes; cadastro e distribuição pedagógica | O perfil pedagógico individual é consultável pelo próprio professor ou Admin; alterações e vínculos são Admin. Habilitações também são usadas em telas/rotinas autorizadas | Exportação de docentes inclui esses dados e é exclusiva Admin. Auditoria de habilitações registra IDs e ação, não CPF. Texto livre deve ser limitado aos fins pedagógicos. |
| Senhas, hashes, stamps e logins externos | Tabelas ASP.NET Core Identity; autenticação, lockout e vínculo OIDC | Serviços Identity e fluxos autenticados; nenhum endpoint de leitura os devolve | Login externo usa `AspNetUserLogins` com identificadores derivados; tokens do IdP não são persistidos pelo handler. Não exportar, logar ou copiar para auditoria. |
| Perfil local (`Admin`/`Professor`) | Identity roles/user roles; autorização de rotas | Backend aplica `RequireAuthorization` e policies; a UI apenas orienta a navegação | Claims/grupos externos do SSO não concedem papéis locais. Separação futura de perfis permanece D-08 pendente. |
| Reservas, ocupações, empréstimos, turmas, atribuições e planejamento | Tabelas de domínio; executar alocação, agenda, histórico e planejamento | Acesso autenticado conforme endpoint, com verificações de titularidade/participação e Admin nas operações administrativas | Ocupações e planejamento são exportados em relatórios distintos; exportações exigem Admin. Histórico pode conter nomes e vínculos necessários à rastreabilidade. |
| Auditoria e notificações | `AuditEntries`, `OccupationChanges`, `Notifications`; comprovar ações e avisar o usuário relacionado | Auditoria de reserva/empréstimo fica limitada aos envolvidos; demais registros administrativos seguem regras SG-20. Notificações são restritas ao destinatário | Snapshots são objetos selecionados por endpoint, não entidades EF completas. Importações registram tipo, IDs e nomes dos campos alterados; sem arquivo ou CPF no snapshot. Não apagar histórico automaticamente. |
| Identidade externa SSO | `AspNetUserLogins`; vincular identidade OIDC a usuário local | Vínculo explícito após autenticação local; login desconhecido é negado | Identificadores do provedor e subject são transformados em hashes para chave/auditoria. Issuer e subject brutos, tokens e e-mail do provedor não são salvos no evento de auditoria. |

## Controles implementados e revisados

- Autenticação local ASP.NET Core Identity e autorização no backend. SSO OIDC configurável segue desligado por padrão; a identidade federada precisa estar vinculada a uma conta local ativa e não concede papéis por e-mail, grupo ou cargo.
- A listagem `/api/teachers` não devolve e-mail a professores. Admin mantém e-mail na tela administrativa. O perfil pedagógico usa a verificação de Admin ou do próprio titular.
- Importação SG-26 aceita somente CSV/XLSX, limites padrão de 2 MiB/1.000 linhas, rejeita fórmulas/macros no Excel, não persiste upload, mascara CPF e confirma em transação após nova análise.
- Exportação SG-27 é Admin, usa colunas explícitas e exclui CPF, e-mail e credenciais da aba de docentes. ClosedXML escreve texto como valor de texto, sem fórmula.
- Auditoria seleciona snapshots mínimos; operações auditadas salvam na mesma transação/fluxo de persistência descrito na SG-20. A consulta de auditoria limita histórico de reservas/empréstimos aos envolvidos.
- A aplicação não registra corpos HTTP em middleware próprio. Logs detalhados de SQL ou do provedor não foram adicionados nesta SG; configuração dos provedores de log e acesso aos logs é responsabilidade da implantação.
- `Backend/Program.cs` executa `DbSeed.InitializeAsync` na inicialização. Esse seed pode inserir os papéis padrão, turnos padrão quando a tabela estiver vazia e uma conta Admin se configurada. Não iniciar a aplicação contra banco real como verificação somente de leitura.

## CPF e D-06

O CPF é normalizado para 11 dígitos, validado e protegido contra duplicidade por índice único. O armazenamento atual é texto sem criptografia de campo, pois buscas por igualdade, unicidade, migration de dados e gestão de chaves ainda não foram decididas. O acesso ao valor integral deve permanecer restrito aos fluxos administrativos que precisam dele; não adicioná-lo a listagens, exportações genéricas, mensagens ou auditoria.

Proposta para avaliação institucional: confirmar necessidade e responsáveis de consulta; se criptografia de campo for aprovada, definir gestão/rotação e recuperação de chaves e manter um identificador de busca por HMAC separado para igualdade/deduplicação, com threat model e plano de migração reversível. Não usar hash simples de CPF como substituto: o espaço de valores é enumerável. Nenhuma transformação no banco foi feita nesta SG.

## Logs, auditoria e incidentes

Não anexar payloads de login, arquivos importados, tokens, senhas, connection strings ou CPF completo em logs. Mensagens HTTP devem continuar sem stack trace, SQL ou caminhos internos; stack traces necessários à manutenção devem ficar nos logs operacionais de acesso restrito. Revisar configuração de logs da implantação antes da produção. Auditoria é trilha de atividade do sistema, não substitui logs de infraestrutura nem deve ser apagada para atender solicitações sem avaliação de retenção.

## Retenção, consulta e correção

Não há prazos institucionais de retenção definidos aqui. Solicitações de consulta/correção devem ser encaminhadas pelo processo institucional responsável e aplicadas por cadastros autorizados. Antes de exclusão, anonimização ou alteração de vínculos históricos, avaliar obrigações aplicáveis, integridade referencial, reservas, planejamento, auditoria e necessidade de preservar autoria. Não excluir usuários ou históricos automaticamente; desativar acesso deve preservar as referências históricas.

Decisões pendentes: D-06 (CPF e LGPD), D-08 (perfis de Coordenação/Gestão), finalidade e retenção de textos de perfil, responsáveis por atendimento a titulares, classificação/criptografia de backups, retenção e eventual saneamento de registros históricos.
