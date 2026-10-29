import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("cronograma renderiza controles de consulta e reserva o filtro de professor ao administrador", async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
  try {
    const { RoomTimeline } = await server.ssrLoadModule("/src/pages/RoomTimeline.tsx");
    const admin = renderToStaticMarkup(createElement(RoomTimeline, {
      user: { id: "admin", displayName: "Admin", email: "", roles: ["Admin"] },
      openBookings: () => {},
    }));
    const teacher = renderToStaticMarkup(createElement(RoomTimeline, {
      user: { id: "teacher", displayName: "Professor", email: "", roles: ["Professor"] },
      openBookings: () => {},
    }));
    assert.match(admin, /Cronograma de Ambientes/);
    assert.match(admin, /Semana/);
    assert.match(admin, /Mês/);
    assert.match(admin, /Semestre/);
    assert.match(admin, /Novo ambiente|Ambiente/);
    assert.match(admin, /Professor<\/span>/);
    assert.doesNotMatch(teacher, /Professor<\/span>/);
    assert.match(teacher, /Sem registro/);
  } finally {
    await server.close();
  }
});
