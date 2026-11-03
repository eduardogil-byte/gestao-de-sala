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

test("confirmação destrutiva descreve o impacto e oferece cancelamento", async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { ConfirmationDialog } = await server.ssrLoadModule("/src/components/UI.tsx");
    const markup = renderToStaticMarkup(createElement(ConfirmationDialog, {
      options: { title: "Liberar data", message: "A sala será liberada apenas nesta ocorrência.", confirmLabel: "Liberar data", danger: true },
      onAnswer: () => {},
    }));
    const descriptionId = markup.match(/aria-describedby="([^"]+)"/)?.[1];
    assert.ok(descriptionId);
    assert.ok(markup.includes(`id="${descriptionId}"`));
    assert.match(markup, /A sala será liberada apenas nesta ocorrência/);
    assert.match(markup, /class="btn-danger"/);
    assert.match(markup, />Cancelar<\/button>/);
    assert.match(markup, />Liberar data<\/button>/);
  } finally {
    await server.close();
  }
});

test("seletor oferece busca para listas grandes e preserva a opção selecionada", async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { SearchableSelect } = await server.ssrLoadModule("/src/components/UI.tsx");
    const options = Array.from({ length: 13 }, (_, index) => ({ value: String(index), label: `Professor ${index}` }));
    const large = renderToStaticMarkup(createElement(SearchableSelect, { label: "Professor", options, value: "12", onChange: () => {} }));
    assert.match(large, /Buscar professor/);
    assert.match(large, /type="search"/);
    assert.match(large, /value="12" selected=""/);
    const small = renderToStaticMarkup(createElement(SearchableSelect, { label: "Professor", options: options.slice(0, 2), value: "0", onChange: () => {} }));
    assert.doesNotMatch(small, /type="search"/);
  } finally {
    await server.close();
  }
});
