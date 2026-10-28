# SalaGest — Frontend

Interface React 18 + TypeScript + Vite 5 + Tailwind CSS para o backend desta branch. Consulte o [guia da raiz](../README.md) para preparar banco, migrations, Admin e API.

## Instalação e scripts

Na pasta `Frontend/`, com Node.js e npm disponíveis:

```powershell
npm ci
npm run build
npm run dev
```

| Script existente | Comportamento |
| --- | --- |
| `npm run dev` | Inicia Vite com `--host 0.0.0.0`, porta 5173 e proxy `/api` |
| `npm run build` | Executa `tsc -b` e `vite build`; gera `dist/` |
| `npm run preview` | Serve o build para inspeção; não substitui a validação integrada em desenvolvimento |

Não há script `npm test` nesta base. `npm ci` usa o lockfile; atualizar dependências é uma tarefa separada.

## Proxy e integração

Acesse <http://localhost:5173>. `vite.config.ts` usa `strictPort: true`: a inicialização falha se a porta estiver ocupada. O script de desenvolvimento escuta em todas as interfaces; considere isso em redes compartilhadas.

`src/lib/api.ts` chama `/api` no mesmo endereço do frontend. O proxy de desenvolvimento encaminha as chamadas para `http://localhost:5108`, preservando o prefixo. Inicie a API separadamente.

Para outro destino, no PowerShell de `Frontend/`, antes de iniciar Vite:

```powershell
$env:VITE_API_TARGET = "http://localhost:5109"
npm run dev
```

O destino vem de `process.env.VITE_API_TARGET`. A configuração atual não chama `loadEnv`: copiar `.env.example` para `.env.local` não basta para configurar essa leitura na avaliação do arquivo de configuração. Use a variável do processo e reinicie Vite após alterá-la. A variável representa a URL da API, nunca conexão SQL ou credenciais.

O login usa `/api/auth/login`, seguido de `/api/me`. O token fica em `sessionStorage` e é enviado como Bearer Token. O cliente trata erros HTTP e sinaliza sessão não autorizada. A API valida autorização e propriedade dos registros.

Os caminhos relativos `/api` permanecem no build. Hospedar arquivos estáticos exige definir como essas chamadas chegam ao backend; `VITE_API_TARGET` não é configuração de produção embutida no cliente.

## Componentes e fluxo de leitura

| Arquivo ou área | Responsabilidade |
| --- | --- |
| `src/main.tsx`, `src/App.tsx` | Inicialização, sessão, navegação e composição |
| `src/lib/api.ts` | Requisições, token e erros |
| `src/lib/data.tsx` | Contexto compartilhado e recarga das coleções |
| `src/types.ts` | Tipos consumidos pela interface |
| `src/components/BookingForm.tsx`, `NeedFields.tsx` | Reserva e requisitos da aula |
| `src/components/OccupationManager.tsx` | Situação letiva, troca de sala e liberação |
| `src/components/UsagePanel.tsx` | Indicadores recebidos da API |
| `src/components/UI.tsx` | Campos, avisos, modais e estados comuns |
| `src/pages/` | Acesso, ambientes, estrutura acadêmica, professores, reservas, empréstimos, agenda, painel e notificações |

## Comportamentos atuais

- Reservas começam como solicitações `Pendente`; o professor escolhe a sala e confirma por `/api/bookings/{id}/confirm`, sem aprovação administrativa rotineira.
- Sugestões incluem salas ocupadas e incompatíveis. A API revalida a confirmação, inclusive quando apenas parte das datas está disponível.
- Reservas recorrentes aceitam dias selecionados e EAD semanal; alunos por computador são informados separadamente da capacidade física da sala.
- Empréstimos seguem oferta do titular, aceite do destinatário e finalização do titular. Em ofertas múltiplas, aceite e finalização são por ocorrência.
- Marcar EAD ou não letivo não libera automaticamente a sala: liberação é explícita.
- A agenda é semanal. `Schedules.tsx` permanece no código, mas não integra o menu principal atual.
- Admin mantém ambientes, computadores, softwares, semestres e turmas. Painel e notificações consomem dados da API.

O catálogo pedagógico e seus testes pertencem à branch de desenvolvimento indicada no guia raiz; não são funcionalidades desta base.

## Validação

Build verifica tipos e empacotamento, não navegação, persistência ou permissões. Siga [TESTES_MANUAIS.md](TESTES_MANUAIS.md) com banco de desenvolvimento, Admin e dois professores fictícios.

Verifique login/logout, API indisponível, erros 401/403/409, reserva única/recorrente, confirmação parcial, empréstimos, transferência e liberação. Confira mensagens, uso por teclado, foco e layout em desktop/celular. Registre versão, dados e resultados; sem API/SQL Server, os cenários integrados continuam pendentes.

As instruções foram revisadas contra o código, sem instalação, build ou homologação nesta contribuição documental.
