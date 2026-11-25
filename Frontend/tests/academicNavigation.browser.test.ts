import assert from "node:assert/strict";
import test from "node:test";
import { chromePath, openAdminFixture } from "./helpers/browser.ts";

test("Turmas e Semestres usam listas, modais e atribuição contextual", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture('adminIntegrations');
  try {
    await evaluate("adminTest.reset('academic')");
    await waitFor("!!document.querySelector('[role=tab]')");
    assert.equal(await evaluate("document.querySelector('[role=tab][aria-selected=true]').textContent"), 'Turmas');
    assert.equal(await evaluate("document.querySelector('details').open"), false);
    await evaluate(`adminTest.catalog['/api/classes'] = [{id: 7, semesterId: 1, name: 'Turma teste', code: 'T01', students: 20, shiftId: 1, courseId: 1, courseModuleId: 2}];
      adminTest.catalog['/api/classes/7/units'] = {legacyWithoutModule: false, presentialHours: 8, eadHours: 0, unitsWithoutHours: 0, units: [{curricularUnitId: 3, code: 'UC', name: 'UC teste', plannedHours: 8, deliveryMode: 'Presencial', teacherId: null, resources: []}]};
      adminTest.catalog['/api/classes/7/units/3/eligible-teachers'] = [{teacherId: 't0', displayName: 'Docente 0'}]; adminTest.click('Atualizar dados')`);
    await waitFor("document.body.innerText.includes('Turma teste')");
    await evaluate("adminTest.input('Buscar turma', 'inexistente')");
    await waitFor("document.body.innerText.includes('Nenhuma turma encontrada')");
    await evaluate("adminTest.input('Buscar turma', ''); [...document.querySelectorAll('button')].find(item => item.textContent.includes('Turma teste')).click()");
    await waitFor("document.body.innerText.includes('UC teste')");
    assert.equal(await evaluate("document.querySelector('[role=dialog] h2')?.textContent"), 'Informações');
    await evaluate("adminTest.click('Editar')");
    await evaluate("(() => { const input = document.querySelector('[role=dialog] input[aria-label=\"Nome da turma\"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Turma revisada'); input.dispatchEvent(new Event('input', {bubbles: true})); })()");
    await evaluate("adminTest.click('Salvar')");
    await waitFor("adminTest.pending.some(item => item.path === '/api/classes/7')");
    assert.deepEqual(await evaluate("adminTest.pending.find(item => item.path === '/api/classes/7').body"), {name: 'Turma revisada', code: 'T01', shiftId: 1});
    await evaluate("adminTest.reply('/api/classes/7', null, 204)");
    await waitFor("document.querySelector('[role=dialog]')?.textContent.includes('Turma atualizada')");
    await evaluate("adminTest.click('Definir instrutor')");
    await waitFor("[...document.querySelectorAll('label')].find(item => item.textContent.includes('Instrutor habilitado'))?.querySelectorAll('option').length === 2");
    assert.equal(await evaluate("document.body.innerText.includes('Semestre da atribuição') || document.body.innerText.includes('Turma da atribuição')"), false);
    await evaluate("adminTest.select('Instrutor habilitado', 't0')");
    await evaluate("adminTest.click('Salvar instrutor responsável')");
    await waitFor("adminTest.pending.some(item => item.path === '/api/classes/7/units/3/teacher')");
    assert.deepEqual(await evaluate("adminTest.pending.find(item => item.path === '/api/classes/7/units/3/teacher').body"), {teacherId: 't0'});
    await evaluate("adminTest.reply('/api/classes/7/units/3/teacher', null, 204)");
    await waitFor("document.body.innerText.includes('Instrutor responsável registrado')");
    for (const theme of ['light', 'dark']) for (const width of [360, 1366]) {
      await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
      await command('Emulation.setDeviceMetricsOverride', {width, height: 850, deviceScaleFactor: 1, mobile: width === 360});
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
    }
    await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))");
    await waitFor("!document.querySelector('[role=dialog]')");
    await evaluate("adminTest.click('Semestres')");
    await evaluate("adminTest.click('Novo semestre')");
    await waitFor("!!document.querySelector('[role=dialog]')");
    await evaluate("adminTest.input('Ano', '2027')");
    await evaluate("adminTest.select('Semestre', '1')");
    assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] label')].find(item => item.querySelector('span')?.textContent === 'Início').querySelector('input').value"), '2027-02-01');
    await evaluate("adminTest.click('Adicionar semestre')");
    await waitFor("adminTest.pending.some(item => item.path === '/api/semesters')");
    await evaluate("adminTest.reply('/api/semesters', {id: 3}, 201)");
    await waitFor("!document.querySelector('[role=dialog]')");
    await evaluate("adminTest.click('Turmas'); adminTest.click('Nova turma')");
    await waitFor("!!document.querySelector('[role=dialog]')");
    await evaluate("adminTest.select('Semestre', '1'); adminTest.select('Curso do Plano de Curso', '1')");
    await waitFor("document.querySelector('[role=dialog]').innerText.includes('Módulo sintético')");
    await evaluate("adminTest.select('Módulo do curso', '2')");
    await waitFor("document.querySelector('[role=dialog]').innerText.includes('UC sintética')");
    await evaluate("adminTest.input('Turma', 'Turma nova'); adminTest.select('Turno da turma', '1')");
    await evaluate("adminTest.click('Adicionar turma')");
    await waitFor("adminTest.pending.some(item => item.path === '/api/classes')");
    assert.equal(await evaluate("adminTest.pending.find(item => item.path === '/api/classes').body.courseModuleId"), 2);
    await evaluate("adminTest.reply('/api/classes', {id: 8}, 201)");
    await waitFor("!document.querySelector('[role=dialog]')");
  } finally { await close(); }
});
