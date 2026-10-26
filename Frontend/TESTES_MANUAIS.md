# Roteiro de testes manuais — frontend SalaGest v0.2

Pré-condição: usar backend v0.2, banco com migrações, turnos padrão e contas de Admin, Professor A e Professor B.

- [ ] `npm install` e `npm run build` terminam sem erros.
- [ ] Acessar `http://localhost:5173`, autenticar e ver salas/turmas.
- [ ] Professor A cria reserva única na quarta de manhã, confirma no Lab 1; aparece na agenda.
- [ ] Professor B cria reserva para a mesma sala/data/turno; vê o laboratório ocupado, com professor/turma e alternativas ordenadas; a API impede a sobreposição.
- [ ] Professor B cria recorrência seg/ter/qua até a primeira semana do mês seguinte; a prévia mostra as datas finais exatas.
- [ ] Reservar recorrência com parte das datas ocupadas: verificar mensagem de conflito e confirmação apenas de datas livres.
- [ ] Confirmar uso de computadores em duplas, exibindo separadamente quantidade de lugares e computadores.
- [ ] Professor A seleciona algumas ocupações suas e oferece empréstimo ao Professor B; ofertas não ultrapassam datas e turnos originais.
- [ ] Professor B aceita uma ocorrência; Professor A finaliza com EAD ou outra sala; a agenda indica titular e destinatário.
- [ ] Professor A edita status de um dia para EAD: verificar que a sala permanece reservada até liberação explícita.
- [ ] Professor A libera só uma data; as outras ocorrências permanecem.
- [ ] Professor A transfere sua ocorrência para outra sala livre e compatível; conferir histórico no backend.
- [ ] Ao tentar transferir para sala ocupada/incompatível, a API deve rejeitar sem apagar o registro original.
- [ ] Admin visualiza o calendário de calor e filtra por turno e turma; a intensidade acompanha quantidade de salas usadas.
- [ ] O professor afetado recebe e marca como lida uma notificação gerada pela API.
- [ ] Logout / login, tratamento de API desconectada, navegação em desktop e celular.

**Não considerar homologado** sem build e teste ponta a ponta com SQL Server.
