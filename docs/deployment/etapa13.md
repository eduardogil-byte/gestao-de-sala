# Etapa 13 — implantação futura e homologação integrada

Este é um **plano de execução futura**, não um registro de instalação concluída. Na Etapa 12 não foram criados bancos/contas, aplicadas migrations, iniciada a API ou executados testes com escrita. O destino institucional definitivo (host, domínio, topologia de rede, SQL Server, certificado e operação) ainda não está aprovado. Primeiro homologar em banco isolado com dados fictícios; só depois decidir implantação com dados reais.

## Infraestrutura e decisões antes de instalar

**Confirmado pelo código:** backend ASP.NET Core 8/EF Core 8/SQL Server, frontend React/TypeScript/Vite, autenticação local Identity Bearer, OIDC opcional, API `/api`, build estático e ferramentas PowerShell em `tools/homologacao/` e `tools/backup/`. Para build, usar .NET SDK 8 e Node.js 20+ com npm; para execução framework-dependent do backend, runtime ASP.NET Core 8. O banco precisa suportar as migrations EF Core existentes e a identidade da aplicação deve ter permissões mínimas necessárias.

**A dimensionar pela instituição:** CPU, RAM, disco/IOPS, quantidade de usuários simultâneos, armazenamento de backups, RPO/RTO, disponibilidade, SO/host (IIS ou serviço atrás de proxy), DNS, portas, firewall, certificado, versão/edição do SQL Server e política de atualização. Não há benchmark que justifique números mínimos de hardware. O requisito RNF-01 (60 ambientes/1.000 blocos) deve ser medido em infraestrutura representativa.

**A aprovar:** [D-01 a D-11](../DECISOES.md), principalmente capacidade/horas, conflito docente, carga contratual, CPF/LGPD, calendário e separação de perfis. Definir responsável pelo sistema, DBA, DPO, operação de backup, logs e suporte.

## Sequência protegida de implantação

1. **Reserva e segurança do ambiente sintético.** Responsável formal confirma instância exclusiva, ausência de bancos relevantes, identidade instaladora separada, conta de manutenção sem administração e conta da API sem `sysadmin`/`db_owner` nem acesso a outras instâncias. Nomear banco exclusivo `SalaGest_Etapa6_Testes`; nome diferente sozinho não prova isolamento. O fluxo e os comandos reais estão em [SG-etapa6B](../tasks/SG-etapa6B.md). Qualquer falha na prova de servidor, banco, SID, identidade original, permissões herdadas ou bloqueio das demais instâncias interrompe o procedimento.
2. **TLS SQL e manifesto.** Certificado confiável com SAN do endpoint aprovado, cadeia, validade e acesso à chave pela conta do serviço SQL. Exigir `Encrypt=True` e `TrustServerCertificate=False`. O aprovador gera manifesto externo V2 com ACL restrita e validade; scripts versionados não devem conter SIDs, nomes de contas, senhas ou manifesto preenchido. Verificações de leitura precedem escrita.
3. **Criação e manutenção, com aprovações distintas.** Somente instalador autorizado cria banco novo e logins pelos scripts; manutenção restrita aplica migrations pelo executor validado. O executor verifica exatamente o destino autorizado, marca de reserva e histórico de migrations. **Não** usar `dotnet ef database update` diretamente no fluxo protegido. Não executar migrations ou DbSeed na inicialização normal da API.
4. **Massa sintética e API.** Após verificação das permissões finais, a conta de aplicação não administrativa provisiona o Admin e dois Professores fictícios pelo wrapper e Identity existentes, com senhas interativas sem eco. Desabilitar `Bootstrap__EnableDevelopmentSeed` e SSO institucional no ambiente sintético. Iniciar a API somente pelo wrapper validado; frontend aponta apenas para a URL local autorizada. Não usar pessoas ou dados reais.
5. **Homologação integrada.** Registrar commit, ambiente, versão de schema, horário, papel e resultado de cada cenário, sem tokens, CPFs, senhas ou connection strings. Usar uma nova conexão para confirmar persistência e rollback. Não aceitar fixtures de navegador ou SQLite em memória como prova deste passo.
6. **Destino institucional definitivo.** Escolher host/proxy, DNS, certificados HTTPS, contas de serviço e banco próprios. Publicar o backend com `dotnet publish Backend/SalaGest.Api.csproj -c Release -o <diretorio-aprovado>`; publicar `Frontend/dist` após `npm ci` e `npm run build`. Servir SPA com fallback de rotas e encaminhar `/api` para a API. `VITE_API_TARGET` é apenas proxy do Vite em desenvolvimento. Ajustar `Cors__FrontendOrigins__0` à origem aprovada; restringir portas/firewall e validar TLS ponta a ponta. Não copiar User Secrets ou `Backend/appsettings.json` privado para pacote público.
7. **Observação e retorno.** Verificar `GET /health/live`, `GET /health/ready`, logs de erro, versão de schema, backups e fluxos críticos. Manter artefato anterior identificado. Em falha sem alteração de schema incompatível, voltar o apontamento do host para o artefato anterior e repetir health/fluxos. Se houve migration ou transformação de dados, **não** presumir downgrade: interromper, avaliar recuperação aprovada e restaurar somente em destino/controlado. Registrar decisão e evidência.

O [guia de implantação existente](README.md) cobre opções de hospedagem e configuração, mas seus exemplos genéricos de EF não substituem o executor protegido da Etapa 6 para o banco sintético. Backup/restore seguem [procedimento próprio](../operations/sqlserver-backup-restore.md): backup verificado não comprova recuperação; restauração deve ocorrer em banco novo e isolado, sem `WITH REPLACE`. A identidade da API não recebe privilégios de backup/restore.

## Roteiro de homologação — todos pendentes

| Grupo | Critério de aceite e evidência |
| --- | --- |
| Login e papéis | Admin e dois Professores fictícios entram; 401/403, expiração, logout e acesso cruzado são negados. Registrar HTTP redigido e tela por perfil. |
| Cadastros, docentes, ambientes, inventário e turnos | Criar/editar/inativar via API/SPA; IDs preservados, códigos/quantidades inválidos rejeitados, turnos oferecidos distintos de ocupados. Ler novamente em conexão nova. |
| Catálogo e compatibilidade | Curso → Módulo → UC → Capacidade e requisitos persistem; software válido/vencido/desconhecido altera classificação corretamente. Compatibilidade não equivale a disponibilidade. |
| Reservas e conflitos | Confirmar reserva simples e recorrência parcial explícita; impedir dupla sala, testar conflitos de turma/professor e limite do semestre. Confirmar contagens no SQL. |
| Empréstimos, agenda e cronograma | Oferta, aceite, destino da turma e histórico preservados; prévia, movimento, desfazer/refazer elegíveis, semana/mês/semestre e permissões coerentes. |
| Planejamento | Proposta, aprovação e publicação separadas; aprovação não ocupa sala; publicação revalida revisão/assinatura/conflitos. Trocas A→B→A, falha e operação concorrente não acionam plano de outro semestre. |
| Indicadores, importação e exportação | Comparar capacidade e ocupação com valores conhecidos; denominador indefinido visível; prévia de importação sem gravação; XLSX abre sem dados pessoais indevidos ou fórmula injetada. |
| Concorrência e rollback | Dois clientes disputam o mesmo ambiente; nunca há dupla ocupação. Falha controlada não deixa escrita parcial. Evidência em transação e nova conexão. |
| Navegador e acessibilidade | Admin/Professor em Chrome, Edge e Firefox; desktop/tablet/celular, teclado, foco, mensagens e sem rolagem horizontal indevida. Teste assistivo antes de declarar WCAG. |
| Backup e restauração | Backup apenas de dados sintéticos, restauração em banco novo isolado, `DBCC CHECKDB` e login/fluxos após restore. Registrar RPO/RTO observados. |

Não há homologação concluída até que cada grupo tenha evidência no ambiente autorizado e as falhas bloqueadoras sejam resolvidas ou formalmente aceitas. A [matriz de pendências](pendencias-etapa12.md) registra funcionalidades parciais que não podem ser anunciadas como prontas.
