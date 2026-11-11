# Redesign visual — Almoxarifado SENAI, primeira rodada

Branch: `feature/sg-redesign-almoxarifado`. Implementação restrita ao frontend e a este registro; sem mudanças em autenticação, contratos HTTP, backend, banco ou migrations.

## Estudo da referência

Fonte: https://github.com/almoxarifesenaicxs/Almoxarifado, branch main, arquivos `FrontEnd/src/index.css`, `styles/theme-standard.css`, `styles/responsive.css`, componentes Sidebar/Header e páginas Dashboard/Login. Consultados por leitura do código; não houve reprodução autenticada do sistema de referência.

| Elemento | Características observadas e adaptação |
| --- | --- |
| Fonte | Manrope 400–800; títulos em 800, rótulos menores e números com destaque. Manrope carregada via Google Fonts, com fontes locais de fallback. |
| Cores claras | Primária #0057D9, fundo #F1F3F6, sidebar #E7EBF1, borda #D4DCE7, texto #0F172A, secundário #64748B. Cartões brancos conforme pedido. |
| Navegação | Sidebar 240 px, recolhida 76 px, itens com ícones de 19 px, altura mínima 46 px, raio 8 px. Ativo azul-claro #D8E5FB e texto #004FC4. Mantidos ícones Lucide existentes e grupos por perfil. |
| Cabeçalho | Referência usa mínimo de 100 px, padding horizontal 44 px, título azul grande, notificações e perfil circular. SalaGest mantém atualização, contador e vinculação SSO no menu de conta. |
| Cartões/tabelas | Bordas discretas, raios próximos de 10 px, sombra leve; indicadores com detalhe lateral. Tabelas recebem cabeçalho neutro compartilhado. Não foram reestruturadas tabelas de outras páginas. |
| Login | Composição centralizada, cartão branco estreito com raio 20 px, ícone circular de 54 px, campos com cerca de 44 px e atalhos informativos. Sem marca ou imagens da referência, recuperação de senha fictícia ou autocadastro. |
| Interação | Navegação com hover neutro, ativo textual e visual; transições de 180–250 ms. Movimento reduzido respeitado, foco visível, link para pular ao conteúdo. |
| Responsividade | Referência tem ajustes em 1200/900/850/600/420 px. SalaGest preserva breakpoint lg de 1024 px para o drawer existente e ajusta cabeçalho/cartões em 600 px. Menu móvel mantém Escape, foco e navegação existentes. |
| Escuro | Fundo #0A1020, cartões #172033, sidebar #0F172A, bordas #2D3A50 e links claros. Tokens e compatibilidade de utilitários neutros/semânticos evitam reescrever as páginas restantes. |

## Componentes reutilizados

- `UI.tsx`: Title, Card, Field, Notice, Modal, Busy, Badge e SubmitButton continuam com as mesmas interfaces.
- `index.css`: tokens de superfícies, texto, bordas, links, sombras, raio e dimensões; classes compartilhadas field, btn, table-head e table-cell.
- `ThemeToggle` e `lib/theme`: seleção clara/escura, preferência persistida em localStorage, fallback do sistema e sincronização entre abas. Não utiliza token de autenticação.
- `App.tsx`: shell, sidebar expansível, drawer móvel e perfil com semântica nativa details/summary; fechamento por Escape e clique externo. Funções de login, logout, SSO e chamadas API preservadas.

## Verificações

- Build TypeScript/Vite aprovado; 45 testes frontend aprovados, zero falhas, incluindo persistência do tema. `git diff --check` sem erros. Testes existentes emitiram avisos de porta WebSocket ocupada sem falhar.
- Chrome headless com dados sintéticos interceptados, sem backend ou contas reais: login e dashboard claro/escuro; sidebar medida em 240 e 76 px; preferência escura preservada após reload; viewports móveis de 390 e 320 px sem overflow horizontal; drawer móvel visível ao abrir; Escape fecha drawer e perfil; nenhum erro JavaScript observado nesse roteiro.
- Capturas de inspeção ficaram em diretório temporário externo ao repositório. Esse ensaio não homologa SQL Server, autenticação real, IdP, acessibilidade completa ou todas as páginas.
- A fonte depende de acesso ao Google Fonts; se bloqueado, a interface utiliza fallback. Nenhum pacote npm, imagem ou logo foi adicionado.

## Próxima rodada

Reservas, agendas de salas/instrutores, cronograma, ambientes, professores, catálogo, turmas, empréstimos, planejamento, notificações, importação e relatórios ainda precisam de revisão visual individual. Já herdam shell, tokens e componentes compartilhados, mas layouts densos, gráficos, cores específicas e tabelas devem ser conferidos em ambos os temas. Dashboard gerencial/UsagePanel mantêm seus dados e estruturas atuais; o acabamento detalhado desses painéis também fica para a padronização seguinte.
