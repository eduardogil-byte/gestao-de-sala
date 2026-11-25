# Frontend do SalaGest

React 18, TypeScript, Vite, Tailwind CSS e ícones Lucide. As páginas ficam em `src/pages/`, componentes compartilhados em `src/components/`, cliente HTTP em `src/lib/api.ts`, tipos em `src/types.ts` e navegação em `src/App.tsx`.

## Pré-requisitos e comandos

Use Node.js 20+ e npm. Na pasta `Frontend/`:

```powershell
npm ci
npx tsc -b
npm run build
npm test
npm run dev -- --host 127.0.0.1
```

O Vite mostra a URL local, normalmente `http://localhost:5173`. Seu proxy encaminha `/api` para `http://localhost:5108` por padrão. Se a API autorizada usar outra porta, defina `VITE_API_TARGET` na sessão **antes** de iniciar o Vite ou use `.env.local` privado; reinicie após alterar. Essa variável só afeta o servidor de desenvolvimento. Em implantação, sirva o build com `/api` encaminhado à API e fallback de SPA. Nunca coloque connection string, senha ou token em `VITE_*`.

O frontend não provisiona banco nem Admin. Só inicie a API depois de confirmar ambiente e destino; veja o [README principal](../README.md) e [SG-etapa6B](../docs/tasks/SG-etapa6B.md).

## Telas e segurança

O Admin dispõe de cadastros pedagógicos, docentes, ambientes/inventário, calendário, planejamento, cronograma, indicadores, importação e exportação. Professores podem acessar suas agendas, reservas, propostas, empréstimos e notificações conforme autorização da API. O menu oculta ações não permitidas, mas a segurança depende das verificações do backend.

O token Bearer fica em `sessionStorage` e é revalidado pela API; logout remove a sessão local. Não trate presença de token como prova de permissão. A interface distingue compatibilidade técnica de disponibilidade em horário, e aprovação de proposta de publicação.

Na Etapa 11, `npx tsc -b`, `npm run build` e 83/83 testes passaram. Os testes de navegador utilizam respostas sintéticas e não demonstram integração real com SQL Server. A [matriz de pendências](../docs/deployment/pendencias-etapa12.md) registra lacunas funcionais e de acessibilidade. Para os fluxos a validar após implantação, consulte [Etapa 13](../docs/deployment/etapa13.md).

Se a página abrir mas `/api` falhar, confira primeiro se a API autorizada está em execução e se `VITE_API_TARGET` corresponde à URL dela; reinicie o Vite após corrigir a variável. Porta 5173 ocupada pode impedir a inicialização com `strictPort` no servidor de desenvolvimento. Erros de login não devem ser contornados editando `sessionStorage` ou permissões locais: verifique a resposta da API e use uma conta de teste autorizada.
