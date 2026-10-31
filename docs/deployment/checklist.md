# Checklist de implantação e homologação

Use em Staging primeiro. Não marque itens como concluídos sem evidência registrada. Não executar sobre o SQL Server real de desenvolvimento sem autorização específica.

## Antes da implantação

- [ ] Host, sistema operacional, domínio, DNS, TLS e proxy aprovados.
- [ ] Runtime ASP.NET Core 8 (ou artefato self-contained aprovado) e Node/npm de build disponíveis.
- [ ] Banco de destino confirmado e isolado do desenvolvimento.
- [ ] Connection string fornecida por canal de segredo; identidade da aplicação com privilégio mínimo.
- [ ] Origem do frontend definida e CORS configurado com origens exatas.
- [ ] Variáveis por ambiente revisadas; nenhum segredo incluído em Git ou pacote.
- [ ] `Bootstrap:EnableDevelopmentSeed` ausente/falso em Staging e Production.
- [ ] Processo aprovado para provisionar primeiro Admin sem senha padrão.
- [ ] Provedor e parâmetros SSO confirmados ou SSO permanece desativado.
- [ ] Migrations revisadas, estado atual consultado e SQL gerado revisado por responsável autorizado.
- [ ] Backup aprovado, arquivo verificado, restauração de ensaio planejada e RPO/RTO definidos.
- [ ] Decisões institucionais D-01, D-03, D-04, D-06 e D-08 avaliadas.
- [ ] Pendência RN-07/RN-08 (movimentação de blocos pedagógicos completos) comunicada.
- [ ] Artefatos Release do backend e `Frontend/dist` identificados por versão.

## Durante a implantação

- [ ] Registrar versão, ambiente e destino aprovados.
- [ ] Publicar em diretório de versão novo; preservar artefatos anteriores.
- [ ] Aplicar somente SQL revisado e autorizado; nunca atualizar schema na inicialização.
- [ ] Configurar HTTPS no host/proxy aprovado e fallback de rotas SPA.
- [ ] Encaminhar `/api` ao backend; confirmar que o frontend mantém URL relativa.
- [ ] Iniciar aplicação sem seed e conferir logs de inicialização.
- [ ] Verificar `GET /health/live` e `GET /health/ready`.
- [ ] Registrar a versão do schema e resultado das operações.

## Depois da implantação / SG-30

### Infraestrutura e operação

- [ ] Verificar connectividade SQL Server e migrations aplicadas, sem executar mudanças não aprovadas.
- [ ] Confirmar que inicialização normal não cria papéis, turnos, Admin nem outros dados.
- [ ] Testar indisponibilidade do banco e `503` de readiness em ambiente isolado.
- [ ] Conferir HTTPS, CORS, roteamento SPA, cache de assets e configuração por ambiente.
- [ ] Revisar logs para ausência de segredos e dados pessoais desnecessários.
- [ ] Gerar backup autorizado e restaurá-lo em banco isolado; registrar evidência.
- [ ] Ensaiar atualização e rollback dos artefatos; tratar recuperação de banco separadamente.

### Segurança e funcionalidades

- [ ] Validar login local, expiração/logout e perfis Admin/Professor.
- [ ] Validar SSO somente se provedor e credenciais reais estiverem autorizados; cobrir vínculo, issuer, audience, bloqueio e logout.
- [ ] Validar cadastros pedagógicos, docentes, ambientes e inventário.
- [ ] Validar reservas simples/recorrentes, conflitos e permissões.
- [ ] Validar empréstimos, cronograma, movimentações e desfazer/refazer.
- [ ] Validar agenda docente e calendário institucional.
- [ ] Validar planejamento, estados, publicação e conflitos.
- [ ] Validar Dashboard SG-24, oportunidades SG-25 e indicadores SG-23.
- [ ] Validar importação SG-26 e exportação SG-27 com dados de teste aprovados.
- [ ] Revisar LGPD, CPF, auditoria, autorizações e dados exportados.
- [ ] Registrar limitações: movimentação completa de blocos RN-07/RN-08 não implementada.

### Desempenho

- [ ] Medir consultas amplas e períodos extensos em banco isolado.
- [ ] Medir exportações com volume representativo dentro dos limites configurados.
- [ ] Avaliar múltiplas sessões simultâneas e concorrência de reservas.
- [ ] Registrar latências, erros, uso de memória e limites observados.

## Critérios de saída

- [ ] Evidências, responsável, data e ambiente registrados.
- [ ] Falhas bloqueadoras resolvidas ou formalmente aceitas pela instituição.
- [ ] Backup e recuperação realmente ensaiados em ambiente isolado.
- [ ] Aprovação institucional de implantação registrada.

Este checklist não declara a aplicação homologada ou pronta para produção por si só.
