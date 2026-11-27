import assert from "node:assert/strict";
import test from "node:test";
import { chromePath, openAdminFixture } from "./helpers/browser.ts";

test("turno exige aviso com vínculos e confirmação envia somente o turno", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture('adminIntegrations');
  const lastButton = (text: string) => evaluate(`(() => { const dialog = [...document.querySelectorAll('[role=dialog]')].at(-1); [...dialog.querySelectorAll('button')].find(item => item.textContent.trim() === ${JSON.stringify(text)}).click(); })()`);
  try {
    await evaluate("adminTest.reset('academic')");
    await waitFor("!!document.querySelector('[role=tab]')");
    await evaluate(`adminTest.catalog['/api/classes']=[{id:7,name:'Turma teste',code:'T01',students:20,semesterId:1,shiftId:1,courseId:1,courseModuleId:2}];
      adminTest.catalog['/api/shifts'].push({id:2,name:'Tarde',startsAt:'13:00:00',endsAt:'17:00:00'});
      adminTest.catalog['/api/classes/7/units']={legacyWithoutModule:false,presentialHours:0,eadHours:0,unitsWithoutHours:0,units:[]};
      adminTest.catalog['/api/classes/7/shift-change?shiftId=2']={classId:7,currentShiftId:1,currentShiftName:'Manhã',shiftId:2,shiftName:'Tarde',previewToken:'preview-v1',links:[{label:'Reservas',count:3},{label:'Atribuições pedagógicas',count:2}]};
      adminTest.click('Atualizar dados')`);
    await waitFor("document.body.innerText.includes('Turma teste')");
    await evaluate("[...document.querySelectorAll('button')].find(item=>item.textContent.includes('Turma teste')).click()");
    await waitFor("!!document.querySelector('[role=dialog]')");
    await evaluate("adminTest.click('Editar turma')");
    await evaluate("(() => { const input=document.querySelector('input[aria-label=\"Nome da turma\"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Nome não salvo'); input.dispatchEvent(new Event('input',{bubbles:true})); const select=document.querySelector('select[aria-label=\"Turno da turma\"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'2'); select.dispatchEvent(new Event('change',{bubbles:true})); })()");
    await evaluate("adminTest.click('Salvar')");
    await waitFor("document.querySelectorAll('[role=dialog]').length === 3");
    assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog]')].at(-1).textContent.includes('Reservas3')"), true);
    assert.equal(await evaluate("adminTest.calls.some(item => item.method === 'PUT')"), false);
    for (const theme of ['light','dark']) for (const width of [360,1366]) {
      await evaluate(`document.documentElement.dataset.theme='${theme}'`);
      await command('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:width===360});
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
    }
    await lastButton('Cancelar');
    await waitFor("document.querySelectorAll('[role=dialog]').length === 2");
    assert.equal(await evaluate("adminTest.calls.some(item => item.method === 'PUT')"), false);
    await evaluate("adminTest.click('Salvar')");
    await waitFor("document.querySelectorAll('[role=dialog]').length === 3");
    await lastButton('Confirmar turno');
    await waitFor("adminTest.pending.some(item=>item.path==='/api/classes/7/shift-change')");
    assert.deepEqual(await evaluate("adminTest.pending.find(item=>item.path==='/api/classes/7/shift-change').body"), {shiftId:2,confirmed:true,previewToken:'preview-v1'});
    assert.equal(await evaluate("adminTest.calls.some(item=>item.method==='PUT' && item.path==='/api/classes/7')"), false);
    await evaluate("adminTest.catalog['/api/classes'][0].shiftId=2; adminTest.reply('/api/classes/7/shift-change',null,204)");
    await waitFor("document.querySelectorAll('[role=dialog]').length===1 && document.body.innerText.includes('Turno oficial atualizado')");
    assert.equal(await evaluate("document.querySelector('[role=dialog]').textContent.includes('Nome não salvo')"), false);
    assert.equal(await evaluate("document.querySelector('[role=dialog]').textContent.includes('Turma teste')"), true);
  } finally { await close(); }
});
