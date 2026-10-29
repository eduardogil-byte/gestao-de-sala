import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("agenda renderiza três visões e restringe seleção de instrutor ao administrador", async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { InstructorAgenda } = await server.ssrLoadModule("/src/pages/InstructorAgenda.tsx");
    const teacher = renderToStaticMarkup(createElement(InstructorAgenda,
      { user: { id: "t1", displayName: "João", email: "", roles: ["Professor"] } }));
    const admin = renderToStaticMarkup(createElement(InstructorAgenda,
      { user: { id: "a1", displayName: "Admin", email: "", roles: ["Admin"] } }));
    assert.match(teacher, /Minha Agenda/);
    assert.match(teacher, /Semana/);
    assert.match(teacher, /Mês/);
    assert.match(teacher, /Semestre/);
    assert.doesNotMatch(teacher, /Instrutor<\/span>/);
    assert.match(admin, /Agenda dos Instrutores/);
    assert.match(admin, /Instrutor<\/span>/);
  } finally { await server.close(); }
});
