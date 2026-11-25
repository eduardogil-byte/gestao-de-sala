import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromePath, openAdminFixture } from "./helpers/browser.ts";

test("períodos e filtros preservam navegação, seleção e temas em desktop e celular", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture("adminIntegrations");
  const navigation = "document.querySelector('[aria-label=\"Navegação entre períodos\"]')";
  const weekLabel = "Fevereiro · Semana 5/5 / Março · Semana 1/5";
  const screenshots = await mkdtemp(join(tmpdir(), "salagest-period-filters-"));
  try {
    await evaluate("adminTest.reset('timeline')");
    await waitFor("document.body.innerText.includes('Filtros do cronograma')");
    assert.equal(await evaluate("document.querySelector('[aria-controls=timeline-filters]').getAttribute('aria-expanded')"), "false");
    assert.equal(await evaluate("document.querySelector('#timeline-filters').getClientRects().length"), 0);
    await evaluate("adminTest.click('Expandir filtros')");
    await evaluate("adminTest.click('Semana')");
    await waitFor("document.querySelector('table')?.innerText.includes('Turma sintética')");
    assert.equal(await evaluate(`${navigation}.previousElementSibling.textContent`), weekLabel);
    assert.equal(await evaluate("[...document.querySelectorAll('h2')].find(h => h.textContent === 'Resumo do período').nextElementSibling.textContent"), `28/02/2027 a 06/03/2027 · ${weekLabel}`);
    for (const text of ["Combine somente", "Ocupações não representam carga horária pedagógica", "Esta consulta não comprova turno livre"])
      assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`), false);

    await evaluate("adminTest.select('Tipo de ambiente', 'Laboratorio'); adminTest.select('Ambiente', '10'); adminTest.select('Instrutor', 't0'); adminTest.select('Turno', '1'); adminTest.select('Tipo de ocupação', 'Aula')");
    await waitFor("document.querySelector('table')?.innerText.includes('Turma sintética')");
    const values = "[...document.querySelectorAll('#timeline-filters select')].map(s => s.value)";
    const selected = await evaluate(values);
    const requests = await evaluate("adminTest.calls.length");
    for (const width of [1366, 360]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 850, deviceScaleFactor: 1, mobile: width === 360 });
      for (const theme of ["light", "dark"]) {
        await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
        await evaluate("document.querySelector('[aria-controls=timeline-filters]').focus()");
        await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" });
        await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
        await waitFor("document.querySelector('[aria-controls=timeline-filters]').getAttribute('aria-expanded') === 'false'");
        assert.equal(await evaluate("document.querySelector('#timeline-filters').getClientRects().length"), 0);
        assert.deepEqual(await evaluate(values), selected);
        await evaluate("adminTest.click('Expandir filtros')");
        await waitFor("document.querySelector('[aria-controls=timeline-filters]').getAttribute('aria-expanded') === 'true'");
        assert.deepEqual(await evaluate(values), selected);
        assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
        const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        await writeFile(join(screenshots, `${width}-${theme}.png`), Buffer.from(screenshot.data, "base64"));
      }
    }
    assert.equal(await evaluate("adminTest.calls.length"), requests);
    await evaluate("document.querySelector('[aria-label=\"Período anterior\"]').click()");
    await waitFor(`${navigation}.previousElementSibling.textContent === 'Fevereiro · Semana 4/5'`);
    assert.deepEqual(await evaluate(values), selected);
    await evaluate("document.querySelector('[aria-label=\"Próximo período\"]').click()");
    await waitFor(`${navigation}.previousElementSibling.textContent === ${JSON.stringify(weekLabel)}`);
    await evaluate("adminTest.click('Limpar filtros')");
    await waitFor(`${values}.every(value => value === '')`);

    await evaluate("adminTest.reset('instructor')");
    await waitFor(`${navigation}?.previousElementSibling.textContent === ${JSON.stringify(weekLabel)}`);
    await evaluate("document.querySelector('[aria-label=\"Próximo período\"]').click()");
    await waitFor(`${navigation}.previousElementSibling.textContent === 'Março · Semana 2/5'`);
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
    console.log(`Capturas dos períodos e filtros: ${screenshots}`);
  } finally { await close(); }
});
