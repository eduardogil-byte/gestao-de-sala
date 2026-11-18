import assert from "node:assert/strict";
import test from "node:test";
import { chromePath, openAdminFixture } from "./helpers/browser.ts";

test("dashboard por semestre preserva gráficos, filtros, temas, comparação e acesso exclusivo do Admin", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture("managerDashboard");
  try {
    await waitFor("document.body.textContent.includes('Ocupação do semestre · 2027/1')");
    for (const width of [1366, 360]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 850, deviceScaleFactor: 1, mobile: width === 360 });
      for (const theme of ["light", "dark"]) {
        await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
        assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
        const segments = await evaluate<number[]>("[...document.querySelector('[role=img][aria-label^=\"Laboratório\"]').children].map(element => parseFloat(element.style.width))");
        assert.deepEqual(segments, [30, 30, 30, 10]);
      }
    }
    const select = async (label: string, value: string) => {
      const field = `[...document.querySelectorAll('label')].find(label => label.querySelector('span')?.textContent === ${JSON.stringify(label)})?.querySelector('select')`;
      await waitFor(`!!(${field})?.querySelector('option[value="${value}"]')`);
      await evaluate(`(() => { const select = ${field}; select.value = ${JSON.stringify(value)}; select.dispatchEvent(new Event('change', {bubbles:true})); })()`);
    };
    await select("Semestre", "2");
    await waitFor("document.body.textContent.includes('Ocupação do semestre · 2027/2')");
    assert.equal(await evaluate("!!document.querySelector('[role=img][aria-label^=\"Laboratório\"]')"), false);
    assert.equal(await evaluate("document.body.textContent.includes('Capacidade não configurada')"), true);
    await select("Comparar com outro semestre", "1");
    await waitFor("document.body.textContent.includes('Comparação entre semestres')");
    await select("Semestre", "1");
    await waitFor("document.body.textContent.includes('Ocupação do semestre · 2027/1')");
    await select("Ambiente", "1");
    await waitFor("adminTest.calls.some(path => path.endsWith('/semesters/1?roomId=1'))");
    await evaluate("adminTest.reset('rooms')");
    await waitFor("document.querySelector('h1')?.textContent === 'Ambientes'");
    await select("Semestre dos turnos", "1");
    await waitFor("document.body.textContent.includes('90% · Gargalo')");
    await evaluate("adminTest.reset('dashboard', 'Professor')");
    await waitFor("document.body.textContent.includes('Próximas aulas e reservas')");
    assert.equal(await evaluate("document.body.textContent.includes('Dashboard gerencial de ocupação')"), false);
    assert.equal(await evaluate("adminTest.calls.some(path => path.includes('occupancy-indicators'))"), false);
  } finally { await close(); }
});
