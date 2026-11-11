import assert from "node:assert/strict";
import test from "node:test";
import { getNavigationSections } from "../src/lib/navigation.ts";
import { chromePath, openAdminFixture } from "./helpers/browser.ts";

test("relatórios e exportações são exclusivos do Admin na navegação", () => {
  const pages = (admin: boolean) => getNavigationSections(admin).flatMap((section) => section.items.map((item) => item.page));
  assert.equal(pages(true).includes("exports"), true);
  assert.equal(pages(false).includes("exports"), false);
});

test("relatórios consultam dados oficiais e exportam apenas com filtros válidos", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture("adminIntegrations");
  const reset = async () => {
    await evaluate("adminTest.reset('export')");
    await waitFor("document.body.innerText.includes('Relatórios e exportações')");
  };
  try {
    await reset();
    assert.equal(await evaluate("adminTest.calls.some(c => c.path.includes('/occupancy-indicators/'))"), false);
    await evaluate("adminTest.select('Semestre da análise', '1')");
    await waitFor("document.body.innerText.includes('Capacidade') && document.body.innerText.includes('Indeterminado')");
    assert.equal(await evaluate("adminTest.calls.some(c => c.path === '/api/occupancy-indicators/semesters/1')"), true);
    await evaluate("adminTest.select('Ambiente da análise', '10')");
    await waitFor("adminTest.calls.some(c => c.path === '/api/occupancy-indicators/semesters/1?roomId=10')");
    await evaluate(`adminTest.catalog['/api/occupancy-indicators/compare?firstSemesterId=1&secondSemesterId=2&roomId=10'] = {
      first: structuredClone(adminTest.report), second: { ...structuredClone(adminTest.report), semesterId: 2 } };
      adminTest.select('Comparar com', '2')`);
    await waitFor("document.body.innerText.includes('Comparação entre semestres')");
    assert.equal(await evaluate("document.body.innerText.includes('Não comprovada')"), true);

    await evaluate("adminTest.select('Semestre da análise', '2')");
    await waitFor("document.body.innerText.includes('indicadores incompletos')");
    assert.equal(await evaluate("document.body.innerText.includes('Ocupação por ambiente')"), false);
    await evaluate("adminTest.catalog['/api/occupancy-indicators/semesters/2?roomId=10'] = { ...structuredClone(adminTest.report), semesterId: 2, rooms: [] }; adminTest.select('Semestre da análise', '1')");
    await waitFor("adminTest.calls.filter(c => c.path === '/api/occupancy-indicators/semesters/1?roomId=10').length >= 2");
    await evaluate("adminTest.select('Semestre da análise', '2')");
    await waitFor("document.body.innerText.includes('Nenhum ambiente retornado para este filtro')");

    await reset();
    await evaluate("adminTest.select('Relatório', 'Ocupacoes')");
    assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Exportar Excel')?.disabled"), true);
    await evaluate("adminTest.input('Data inicial', '2027-03-31'); adminTest.input('Data final', '2027-03-01')");
    await waitFor("document.body.innerText.includes('A data final deve ser')");
    assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Exportar Excel')?.disabled"), true);
    await evaluate("adminTest.input('Data inicial', '2027-03-01'); adminTest.select('Ambiente (opcional)', '10'); adminTest.select('Turno (opcional)', '1')");
    await evaluate("adminTest.click('Exportar Excel')");
    const occupationPath = "/api/exports/Ocupacoes?roomId=10&shiftId=1&from=2027-03-01&to=2027-03-01";
    await waitFor(`adminTest.calls.some(c => c.path === ${JSON.stringify(occupationPath)})`);
    await waitFor("document.body.innerText.includes('Arquivo Excel enviado ao navegador')");

    await evaluate("adminTest.select('Relatório', 'Comparacao')");
    await waitFor("[...document.querySelectorAll('label span')].some(s => s.textContent === 'Segundo semestre')");
    await evaluate("adminTest.select('Primeiro semestre', '1'); adminTest.select('Segundo semestre', '1')");
    assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Exportar Excel')?.disabled"), true);
    await evaluate("adminTest.select('Segundo semestre', '2')");
    const comparisonPath = "/api/exports/Comparacao?semesterId=1&secondSemesterId=2&roomId=10";
    await evaluate(`adminTest.deferred.push(${JSON.stringify(comparisonPath)})`);
    await evaluate("adminTest.click('Exportar Excel')");
    await waitFor(`adminTest.pending.some(c => c.path === ${JSON.stringify(comparisonPath)})`);
    await evaluate(`adminTest.reply(${JSON.stringify(comparisonPath)}, { error: 'Sem registros para os filtros.' }, 404)`);
    await waitFor("document.body.innerText.includes('Sem registros para os filtros.')");

    for (const width of [390, 768, 1440]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 850, deviceScaleFactor: 1, mobile: width < 500 });
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
    }
  } finally { await close(); }
});
