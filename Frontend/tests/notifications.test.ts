import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("notificações mostram assunto, leitura, vínculo e histórico sem expor links legados", async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { NotificationItem, Notifications } = await server.ssrLoadModule("/src/pages/Notifications.tsx");
    const base = { id: 1, actorName: "Coordenação", subject: "Aula remanejada",
      message: "Aula transferida para o Laboratório 2.", createdAtUtc: "2027-03-15T12:00:00Z",
      readAtUtc: null, relatedType: "Occupation", relatedId: 7 };
    const options = { row: base, onMark: () => {}, openRelated: () => {}, toggleHistory: () => {}, showHistory: false };
    const unread = renderToStaticMarkup(createElement(NotificationItem, options));
    assert.match(unread, /Aula remanejada/);
    assert.match(unread, /Não lida/);
    assert.match(unread, /Coordenação/);
    assert.match(unread, /Ver histórico/);
    assert.match(unread, /Abrir registro relacionado/);
    assert.match(unread, /Lida<\/button>/);
    const read = renderToStaticMarkup(createElement(NotificationItem,
      { ...options, row: { ...base, readAtUtc: "2027-03-15T13:00:00Z" } }));
    assert.doesNotMatch(read, /Lida<\/button>/);
    const legacy = renderToStaticMarkup(createElement(NotificationItem,
      { ...options, row: { ...base, subject: null, relatedType: null, relatedId: null } }));
    assert.match(legacy, /Aviso do SalaGest/);
    assert.doesNotMatch(legacy, /Abrir registro relacionado/);
    const opened = renderToStaticMarkup(createElement(NotificationItem, { ...options, showHistory: true }));
    assert.match(opened, /Carregando dados/);
    const page = renderToStaticMarkup(createElement(Notifications, { openRelated: () => {} }));
    assert.match(page, /Notificações/);
  } finally { await server.close(); }
});
