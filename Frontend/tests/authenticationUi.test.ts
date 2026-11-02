import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("acesso público oferece login sem autocadastro", async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { Access } = await server.ssrLoadModule("/src/pages/Access.tsx");
    const markup = renderToStaticMarkup(createElement(Access, { onLogin: () => {} }));
    assert.match(markup, /Entrar na plataforma/);
    assert.match(markup, /Procure a administração/);
    assert.doesNotMatch(markup, /Cadastre-se|Criar conta|Nome completo/);
  } finally { await server.close(); }
});

test("cadastro de professor aparece somente para Admin", async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { Teachers } = await server.ssrLoadModule("/src/pages/Teachers.tsx");
    const profile = { id: "account", email: "account@example.test", displayName: "Conta" };
    const admin = renderToStaticMarkup(createElement(Teachers, { user: { ...profile, roles: ["Admin"] } }));
    const professor = renderToStaticMarkup(createElement(Teachers, { user: { ...profile, roles: ["Professor"] } }));
    assert.match(admin, /<form/);
    assert.match(admin, /Cadastrar professor/i);
    assert.match(admin, /type="password"/);
    assert.doesNotMatch(professor, /<form|Cadastrar professor/i);
  } finally { await server.close(); }
});

test("envio usado pelo cadastro administrativo preserva Bearer sem substituir sessão", async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  const originalFetch = globalThis.fetch;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  try {
    const { register, tokenStore } = await server.ssrLoadModule("/src/lib/api.ts");
    tokenStore.set("admin-session");
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "/api/auth/register");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer admin-session");
      assert.equal(init?.method, "POST");
      return new Response(JSON.stringify({ role: "Professor" }), { status: 201 });
    };
    await register("Professor", "professor@example.test", "Example123!");
    assert.equal(tokenStore.get(), "admin-session");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
    await server.close();
  }
});
