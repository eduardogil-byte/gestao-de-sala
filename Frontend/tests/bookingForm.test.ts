import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("recorrência começa na data escolhida e propõe apenas os dias selecionados", async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { firstSelected, actualDates } = await server.ssrLoadModule("/src/components/BookingForm.tsx");
    assert.equal(firstSelected("2026-11-04", [1, 3]), "2026-11-04");
    assert.deepEqual(actualDates("2026-11-04", "2026-11-11", [1, 3]), ["2026-11-04", "2026-11-09", "2026-11-11"]);
    assert.deepEqual(actualDates("2026-11-04", "2026-11-03", [3]), []);
    const markup = renderToStaticMarkup(createElement((await server.ssrLoadModule("/src/components/BookingForm.tsx")).BookingForm,
      { user: { id: "p", displayName: "Professor", email: "", roles: ["Professor"] }, onCreated: () => {} }));
    assert.match(markup, /Turma \(opcional\)/);
    assert.match(markup, /Atividade \/ justificativa \(obrigatória\)/);
    assert.match(markup, /Continuar para escolha da sala/);
  } finally { await server.close(); }
});
