import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { chromePath, openAdminFixture } from "./helpers/browser.ts";

test("sem catálogo mantém ocupações sem turno, separa datas e não declara disponibilidade", async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { WeeklyOccupations } = await server.ssrLoadModule("/src/components/WeeklyOccupations.tsx");
    const item = { id: 1, roomId: 1, roomName: "Ambiente sem cadastro", date: "2026-11-18", startsAt: "2026-11-18T08:00:00", endsAt: "2026-11-18T12:00:00",
      shiftId: null, kind: "Bloqueio", status: "Blocked", description: "Manutenção", conflicts: [], actualTeacherId: null, actualClassGroupId: null };
    const props = { today: item.date, onOpen: () => {}, occupations: [item, { ...item, id: 2, date: "2026-11-19", description: "Outro dia" }] };
    const markup = renderToStaticMarkup(createElement(WeeklyOccupations, props));
    assert.match(markup, /Ambiente sem cadastro/);
    assert.match(markup, /Turno não identificado/);
    assert.match(markup, /Bloqueada/);
    assert.match(markup, /Manutenção/);
    assert.match(markup, /08:00–12:00/);
    assert.doesNotMatch(markup, /Outro dia/);
    assert.match(markup, /não significa Livre/);
    assert.doesNotMatch(markup, />Livre</);
    const failed = renderToStaticMarkup(createElement(WeeklyOccupations, { ...props, error: "Falha ao consultar a agenda" }));
    assert.match(failed, /Falha ao consultar a agenda/);
    assert.doesNotMatch(failed, /Manutenção/);
    const loading = renderToStaticMarkup(createElement(WeeklyOccupations, { ...props, loading: true }));
    assert.match(loading, /Carregando/);
    assert.doesNotMatch(loading, /Manutenção/);
  } finally { await server.close(); }
});

test("início preserva navegação, tema e ocupações em ambos os perfis e tamanhos", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture("appShell");
  try {
    for (const role of ["Professor", "Admin"]) {
      await evaluate(`shellTest.reset('${role}', true)`);
      await waitFor("!!document.querySelector('section[aria-label=\"LAB-01 · Laboratório de Informática\"] table')");
      const menu = await evaluate<string[]>("[...document.querySelectorAll('nav button')].map(button => button.textContent)");
      const agenda = menu.findIndex((label) => label.includes(role === "Admin" ? "Agenda dos Instrutores" : "Minha Agenda"));
      const timeline = menu.findIndex((label) => label.includes("Cronograma de Ambientes"));
      assert.ok(role === "Admin" ? timeline < agenda : agenda < timeline);
      for (const width of [1366, 360]) {
        await command("Emulation.setDeviceMetricsOverride", { width, height: 850, deviceScaleFactor: 1, mobile: width === 360 });
        for (const theme of ["light", "dark"]) {
          if (await evaluate("document.documentElement.dataset.theme") !== theme)
            await evaluate("document.querySelector('header button[title^=\"Ativar modo\"]').click()");
          await waitFor(`document.documentElement.dataset.theme === '${theme}'`);
          assert.equal(await evaluate("localStorage.getItem('salagest-theme')"), theme);
          assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
          const text = await evaluate<string>("document.querySelector('section[aria-label^=\"LAB-01\"]').innerText");
          for (const value of ["Manhã", "Tarde", "Noite", "Turma 001", "Dev 1", "Docente sintético", "Titular sintético", "Segunda ocupação", "Empréstimo efetivado", "Conflito", "Sem turno", "disponibilidade não confirmada"])
            assert.ok(text.includes(value), `Faltou ${value}: ${role}, ${width}, ${theme}`);
          assert.ok(!text.includes("Outro dia"));
          assert.equal(await evaluate("getComputedStyle(document.querySelector('main')).scrollbarColor === getComputedStyle(document.documentElement).scrollbarColor"), true);
        }
      }
      await evaluate("document.querySelector('section[aria-label^=\"LAB-01\"] td button').click()");
      await waitFor("document.querySelector('main h1')?.textContent === 'Agenda dos ambientes'");
      await waitFor("!!document.querySelector('[role=dialog]')");
      assert.equal(await evaluate("document.documentElement.dataset.theme"), "dark");
    }
    await command("Page.reload");
    await waitFor("!!document.querySelector('main h1')");
    assert.equal(await evaluate("document.documentElement.dataset.theme"), "dark");
  } finally { await close(); }
});
