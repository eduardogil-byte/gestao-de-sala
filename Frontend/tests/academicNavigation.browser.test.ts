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
      adminTest.catalog['/api/classes/7/units'] = {legacyWithoutModule: false, presentialHours: 8, eadHours: 0, unitsWithoutHours: 0, units: [{curricularUnitId: 3, code: 'UC', name: 'UC teste', plannedHours: 8, deliveryMode: 'Presencial', teacherId: null, resources: [{resourceCatalogItemId: 1, name: 'Projetor', quantity: 1}]}]};
      adminTest.catalog['/api/classes/7/units/3/eligible-teachers'] = [{teacherId: 't0', displayName: 'Docente 0'}]; adminTest.click('Atualizar dados')`);
    await waitFor("document.body.innerText.includes('Turma teste')");
    await evaluate("adminTest.input('Buscar turma', 'inexistente')");
    await waitFor("document.body.innerText.includes('Nenhuma turma encontrada')");
    await evaluate("adminTest.input('Buscar turma', ''); [...document.querySelectorAll('button')].find(item => item.textContent.includes('Turma teste')).click()");
    await waitFor("document.body.innerText.includes('UC teste')");
    assert.equal(await evaluate("document.querySelector('[role=dialog] h2')?.textContent"), 'Turma teste');
    await waitFor("document.querySelector('[role=dialog]').innerText.includes('Módulo sintético')");
    assert.equal(await evaluate("document.querySelector('[role=dialog]').innerText.includes('1 de 1 UCs sem instrutor definido.')"), true);
    assert.equal(await evaluate("document.querySelector('[role=dialog] article details').open"), false);
    await evaluate("document.querySelector('[role=dialog] article summary').click()");
    assert.equal(await evaluate("document.querySelector('[role=dialog] article details').innerText.includes('Projetor · Quantidade: 1')"), true);
    await evaluate("adminTest.click('Editar turma')");
    await waitFor("document.querySelectorAll('[role=dialog]').length === 2");
    assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog]')].at(-1).querySelector('h2').textContent"), 'Editar turma');
    assert.equal(await evaluate("document.querySelector('[role=dialog]').querySelector('input') === null"), true);
    await evaluate("(() => { const input = document.querySelector('[role=dialog] input[aria-label=\"Nome da turma\"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Turma revisada'); input.dispatchEvent(new Event('input', {bubbles: true})); })()");
    await evaluate("adminTest.click('Salvar')");
    await waitFor("adminTest.pending.some(item => item.path === '/api/classes/7')");
    assert.deepEqual(await evaluate("adminTest.pending.find(item => item.path === '/api/classes/7').body"), {name: 'Turma revisada', code: 'T01', shiftId: 1});
    await evaluate("adminTest.reply('/api/classes/7', null, 204)");
    await waitFor("document.querySelector('[role=dialog]')?.textContent.includes('Turma atualizada')");
    await evaluate("adminTest.click('Definir instrutor')");
    await waitFor("[...document.querySelectorAll('label')].find(item => item.textContent.includes('Instrutor responsável'))?.querySelectorAll('option').length === 2");
    await evaluate("adminTest.click('Cancelar')");
    await waitFor("!document.querySelector('[role=dialog] article form')");
    assert.equal(await evaluate("adminTest.calls.some(item => item.method === 'PUT' && item.path.endsWith('/teacher'))"), false);
    await evaluate("adminTest.click('Definir instrutor')");
    await waitFor("[...document.querySelectorAll('label')].find(item => item.textContent.includes('Instrutor responsável'))?.querySelectorAll('option').length === 2");
    assert.equal(await evaluate("document.body.innerText.includes('Semestre da atribuição') || document.body.innerText.includes('Turma da atribuição')"), false);
    await evaluate("adminTest.select('Instrutor responsável', 't0')");
    await evaluate("adminTest.click('Salvar')");
    await waitFor("adminTest.pending.some(item => item.path === '/api/classes/7/units/3/teacher')");
    assert.deepEqual(await evaluate("adminTest.pending.find(item => item.path === '/api/classes/7/units/3/teacher').body"), {teacherId: 't0'});
    await evaluate("adminTest.catalog['/api/classes/7/units'].units[0].teacherId = 't0'; adminTest.reply('/api/classes/7/units/3/teacher', null, 204)");
    await waitFor("document.body.innerText.includes('Docente 0 definido como responsável.')");
    assert.equal(await evaluate("document.querySelector('[role=dialog]').innerText.includes('Todas as UCs possuem instrutor definido.')"), true);
    assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] button')].some(item => item.textContent === 'Alterar instrutor')"), true);
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

test("edição confirma curso e módulo, preserva vínculos e mantém rascunho após erro", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture('adminIntegrations');
  const lastButton = (text: string) => evaluate(`(() => { const dialog = [...document.querySelectorAll('[role=dialog]')].at(-1); [...dialog.querySelectorAll('button')].find(item => item.textContent.trim() === ${JSON.stringify(text)}).click(); })()`);
  try {
    await evaluate("adminTest.reset('academic','Admin',{'/api/courses':[{id:1,name:'Curso inicial',code:'C',active:true},{id:5,name:'Outro curso',code:'C2',active:true}]})");
    await waitFor("!!document.querySelector('[role=tab]')");
    await evaluate(`adminTest.catalog['/api/classes']=[{id:7,name:'Turma teste',code:'T01',students:20,semesterId:1,shiftId:1,courseId:1,courseModuleId:2}];
      adminTest.catalog['/api/courses'].push({id:5,name:'Outro curso',code:'C2',active:true});
      adminTest.catalog['/api/courses/5/modules']=[{id:6,courseId:5,name:'Novo modulo',order:1}];
      adminTest.catalog['/api/classes/7/units']={legacyWithoutModule:false,presentialHours:8,eadHours:0,unitsWithoutHours:0,units:[],links:{bookings:2,assignments:1,occupations:2,plans:1}};
      adminTest.click('Atualizar dados')`);
    await waitFor("document.body.innerText.includes('Turma teste')");
    await evaluate("[...document.querySelectorAll('button')].find(item=>item.textContent==='Turma teste').click()");
    await waitFor("!!document.querySelector('[role=dialog]')");
    await evaluate("adminTest.click('Editar turma')");
    await waitFor("[...document.querySelectorAll('label')].some(item=>item.textContent==='Curso' || item.textContent.includes('Outro curso'))");
    await evaluate("adminTest.select('Curso','5')");
    await waitFor("document.body.innerText.includes('Novo modulo')");
    assert.equal(await evaluate("[...document.querySelectorAll('label')].find(item=>item.querySelector('span')?.textContent==='Módulo').querySelector('select').value"), '');
    await evaluate("adminTest.select('Módulo','6')");
    assert.equal(await evaluate("document.body.innerText.includes('2 reserva(s), 1 atribuição(ões)')"), true);
    for (const theme of ['light','dark']) for (const width of [375,1366]) {
      await evaluate(`document.documentElement.dataset.theme='${theme}'`);
      await command('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:width===375});
      assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog]')].at(-1).scrollWidth <= [...document.querySelectorAll('[role=dialog]')].at(-1).clientWidth + 1"), true);
    }
    await lastButton('Salvar');
    await waitFor("document.querySelectorAll('[role=dialog]').length===3");
    assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog]')].at(-1).innerText.includes('Todos esses registros e as UCs anteriores serão preservados')"), true);
    await lastButton('Cancelar');
    await waitFor("document.querySelectorAll('[role=dialog]').length===2");
    assert.equal(await evaluate("adminTest.pending.length"), 0);
    await lastButton('Salvar');
    await waitFor("document.querySelectorAll('[role=dialog]').length===3");
    await lastButton('Confirmar alteração');
    await waitFor("adminTest.pending.some(item=>item.path==='/api/classes/7')");
    assert.deepEqual(await evaluate("adminTest.pending.find(item=>item.path==='/api/classes/7').body"),
      {name:'Turma teste',code:'T01',shiftId:1,courseId:5,courseModuleId:6,curriculumChangeConfirmed:true});
    await evaluate("adminTest.reply('/api/classes/7',{error:'Falha sintética'},409)");
    await waitFor("document.body.innerText.includes('Falha sintética')");
    assert.equal(await evaluate("[...document.querySelectorAll('label')].find(item=>item.querySelector('span')?.textContent==='Módulo').querySelector('select').value"), '6');
    await lastButton('Salvar');
    await waitFor("document.querySelectorAll('[role=dialog]').length===3");
    await lastButton('Confirmar alteração');
    await waitFor("adminTest.pending.some(item=>item.path==='/api/classes/7')");
    await evaluate(`adminTest.catalog['/api/classes'][0].courseId=5; adminTest.catalog['/api/classes'][0].courseModuleId=6;
      adminTest.catalog['/api/classes/7/units'].previousUnits=[{curricularUnitId:3,code:'UC1',name:'UC anterior'}];
      adminTest.reply('/api/classes/7',null,204)`);
    await waitFor("document.querySelectorAll('[role=dialog]').length===1 && document.body.innerText.includes('Turma atualizada')");
    assert.equal(await evaluate("document.querySelector('[role=dialog]').innerText.includes('Outro curso')"), true);
    assert.equal(await evaluate("document.querySelector('[role=dialog]').innerText.includes('Novo modulo')"), true);
    await evaluate("[...document.querySelectorAll('[role=dialog] summary')].find(item=>item.textContent.includes('UCs anteriores')).click()");
    assert.equal(await evaluate("document.querySelector('[role=dialog]').innerText.includes('UC anterior')"), true);
  } finally { await close(); }
});
