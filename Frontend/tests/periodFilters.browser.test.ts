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
    await waitFor("!!document.querySelector('[aria-controls=timeline-filters]')");
    assert.equal(await evaluate("document.querySelector('[aria-controls=timeline-filters]').getAttribute('aria-expanded')"), "false");
    assert.equal(await evaluate("document.querySelector('#timeline-filters').getClientRects().length"), 0);
    await evaluate("adminTest.click('Semana')");
    await waitFor("document.querySelector('table')?.innerText.includes('Turma sintética')");
    assert.equal(await evaluate(`${navigation}.textContent.includes('28/02/2027 a 06/03/2027')`), true);
    assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Legenda do cronograma\"]')"), true);
    for (const text of ["Combine somente", "Ocupações não representam carga horária pedagógica", "Esta consulta não comprova turno livre"])
      assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`), false);

    await evaluate("document.querySelector('[aria-controls=timeline-filters]').click()");
    await evaluate("adminTest.select('Tipo de ambiente', 'Laboratorio'); adminTest.select('Ambiente', '10'); adminTest.select('Instrutor', 't0'); adminTest.select('Turno', '1'); adminTest.select('Tipo de ocupação', 'Aula')");
    await waitFor("document.querySelector('table')?.innerText.includes('Turma sintética')");
    const values = "[...document.querySelectorAll('#timeline-filters select')].map(s => s.value)";
    let selected = await evaluate<string[]>(values);
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
        await evaluate("document.querySelector('[aria-controls=timeline-filters]').click()");
        await waitFor("document.querySelector('[aria-controls=timeline-filters]').getAttribute('aria-expanded') === 'true'");
        assert.deepEqual(await evaluate(values), selected);
        assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
        const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        await writeFile(join(screenshots, `${width}-${theme}.png`), Buffer.from(screenshot.data, "base64"));
      }
    }
    assert.equal(await evaluate("document.querySelector('[aria-controls=timeline-filters] span').textContent"), `${selected.filter(Boolean).length} selecionados`);
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await waitFor("document.querySelector('[aria-controls=timeline-filters]').getAttribute('aria-expanded') === 'false'");
    assert.equal(await evaluate("document.activeElement.getAttribute('aria-controls')"), "timeline-filters");
    await evaluate("document.querySelector('[aria-controls=timeline-filters]').click()");
    await evaluate("document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))");
    await waitFor("document.querySelector('[aria-controls=timeline-filters]').getAttribute('aria-expanded') === 'false'");
    assert.equal(await evaluate("adminTest.calls.length"), requests);
    await evaluate("document.querySelector('[aria-label=\"Período anterior\"]').click()");
    await waitFor(`${navigation}.textContent.includes('21/02/2027 a 27/02/2027')`);
    selected = ["", ...selected.slice(1)];
    assert.deepEqual(await evaluate(values), selected);
    assert.equal(await evaluate("document.body.innerText.includes('Os demais filtros foram mantidos')"), true);
    await evaluate("document.querySelector('[aria-label=\"Próximo período\"]').click()");
    await waitFor(`${navigation}.textContent.includes('28/02/2027 a 06/03/2027')`);
    await evaluate("document.querySelector('[aria-controls=timeline-filters]').click()");
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

test("cronograma simplificado preserva período, recupera falhas e oferece lista móvel", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture("adminIntegrations");
  const screenshots = await mkdtemp(join(tmpdir(), "salagest-timeline-simple-"));
  const selected = "[...document.querySelectorAll('#timeline-filters select')].map(s => s.value)";
  try {
    await evaluate("adminTest.reset('timeline')");
    await waitFor("document.body.innerText.includes('Ver mês')");
    await evaluate("document.querySelector('[aria-controls=timeline-filters]').click(); adminTest.select('Turno', '1')");
    await waitFor("[...document.querySelectorAll('label')].find(l => l.querySelector('span')?.textContent === 'Turno').querySelector('select').value === '1'");
    await evaluate("adminTest.click('Limpar filtros')");
    await waitFor(`${selected}[0] === '1' && ${selected}.slice(1).every(value => value === '')`);
    assert.equal(await evaluate("document.body.innerText.includes('Selecione um semestre cadastrado.')"), false);
    await evaluate("adminTest.select('Turno', '1')");
    await evaluate("adminTest.select('Turno', '')");
    await waitFor(`${selected}.slice(1).every(value => value === '')`);
    await evaluate("adminTest.click('Semana')");
    await waitFor("!!document.querySelector('[aria-controls=weekly-room-10]')");
    await evaluate("document.querySelector('[aria-controls=weekly-room-10]').click()");
    assert.equal(await evaluate("document.querySelector('#weekly-room-10').hidden"), true);
    await evaluate("document.querySelector('[aria-controls=weekly-room-10]').click()");
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Legenda do cronograma\"]').getClientRects().length > 0"), true);
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await waitFor("document.querySelector('[aria-controls=timeline-filters]').getAttribute('aria-expanded') === 'false'");

    for (const width of [1366, 360]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 950, deviceScaleFactor: 1, mobile: width === 360 });
      for (const theme of ["light", "dark"]) {
        await evaluate(`document.documentElement.dataset.theme = '${theme}'; window.scrollTo(0, 0)`);
        assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
        if (width === 360) {
          assert.equal(await evaluate("document.querySelector('[aria-label=\"Lista semanal por dia\"]').getClientRects().length > 0"), true);
          assert.equal(await evaluate("document.querySelector('[aria-label=\"Lista semanal por dia\"]').innerText.includes('Turma sintética')"), true);
          assert.equal(await evaluate("document.querySelector('[aria-label=\"Legenda do cronograma\"]').innerText.includes('disponibilidade não confirmada')"), true);
          await evaluate("document.querySelector('input[type=checkbox]').click()");
          assert.equal(await evaluate("document.querySelector('[aria-label=\"Lista semanal por dia\"]').querySelectorAll('section').length"), 1);
          assert.equal(await evaluate("document.querySelector('[aria-label=\"Lista semanal por dia\"]').textContent.includes('Turma sintética')"), true);
          await evaluate("document.querySelector('input[type=checkbox]').click()");
          await evaluate("adminTest.click('Grade')");
          assert.equal(await evaluate("document.querySelector('table').getClientRects().length > 0"), true);
          await evaluate("adminTest.click('Lista por dia')");
        }
        const shot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
        await writeFile(join(screenshots, `${width}-${theme}.png`), Buffer.from(shot.data, "base64"));
      }
    }
    await evaluate("document.querySelector('[aria-label=\"Lista semanal por dia\"] button').click()");
    await waitFor("!!document.querySelector('[role=dialog]')");
    assert.equal(await evaluate("document.querySelector('[role=dialog]').innerText.includes('Laboratório sintético')"), true);
    assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] details')].every(d => !d.open)"), true);
    await evaluate("document.querySelector('[role=dialog] details summary').click()");
    assert.equal(await evaluate("document.querySelector('[role=dialog]').innerText.includes('UC sintética')"), true);
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await waitFor("!document.querySelector('[role=dialog]')");

    const path = await evaluate<string>("adminTest.calls.filter(c => c.path.startsWith('/api/agenda?')).at(-1).path");
    await evaluate(`adminTest.deferred.push(${JSON.stringify(path)}); document.querySelector('[aria-label="Próximo período"]').click()`);
    await waitFor("!document.body.innerText.includes('Consultando ocupações…')");
    await evaluate("document.querySelector('[aria-label=\"Período anterior\"]').click()");
    await waitFor(`adminTest.pending.some(p => p.path === ${JSON.stringify(path)})`);
    await evaluate(`adminTest.reply(${JSON.stringify(path)}, { title: 'Falha de teste' }, 500)`);
    await waitFor("document.body.innerText.includes('Tentar novamente')");
    await evaluate("adminTest.deferred = []; adminTest.click('Tentar novamente')");
    await waitFor("!document.body.innerText.includes('Tentar novamente') && !!document.querySelector('table')");
    assert.equal(await evaluate(`${selected}[0]`), "1");
    await evaluate("document.querySelector('[aria-label^=\"Selecionar período:\"]').click()");
    await waitFor("document.querySelector('[role=dialog]')?.innerText.includes('Selecionar semana')");
    await evaluate("document.querySelector('[role=dialog] button[aria-label^=\"15/03/2027,\"]').click()");
    await waitFor("document.querySelector('[aria-label=\"Navegação entre períodos\"]').textContent.includes('14/03/2027')");
    assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Hoje')"), false);
    console.log(`Capturas do cronograma simplificado: ${screenshots}`);
  } finally { await close(); }
});
