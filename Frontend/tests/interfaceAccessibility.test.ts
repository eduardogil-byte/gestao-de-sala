import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("avisos e carregamento anunciam seu estado sem depender apenas da cor", async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { Busy, Notice } = await server.ssrLoadModule("/src/components/UI.tsx");
    const error = renderToStaticMarkup(createElement(Notice, { message: "Não foi possível salvar." }));
    assert.match(error, /role="alert"/);
    assert.match(error, /Não foi possível salvar\./);
    const success = renderToStaticMarkup(createElement(Notice, { type: "success", message: "Reserva confirmada." }));
    assert.match(success, /role="status"/);
    assert.match(success, /aria-live="polite"/);
    const busy = renderToStaticMarkup(createElement(Busy));
    assert.match(busy, /role="status"/);
    assert.match(busy, /Carregando dados/);
  } finally {
    await server.close();
  }
});

test("modal associa o título ao diálogo e oferece fechamento nomeado", async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { Modal } = await server.ssrLoadModule("/src/components/UI.tsx");
    const markup = renderToStaticMarkup(createElement(Modal, { title: "Confirmar publicação", onClose: () => {} },
      createElement("p", null, "Revise os dados antes de publicar.")));
    const titleId = markup.match(/aria-labelledby="([^"]+)"/)?.[1];
    assert.ok(titleId);
    assert.match(markup, new RegExp(`<h2 id="${titleId}"`));
    assert.match(markup, /role="dialog"/);
    assert.match(markup, /aria-modal="true"/);
    assert.match(markup, /aria-label="Fechar"/);
  } finally {
    await server.close();
  }
});
