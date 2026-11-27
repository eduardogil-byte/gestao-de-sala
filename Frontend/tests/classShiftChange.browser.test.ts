import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
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

test("curso, módulo e turno são confirmados e salvos juntos sem alterar vínculos", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture('adminIntegrations');
  const lastButton = (text: string) => evaluate(`(() => {const d=[...document.querySelectorAll('[role=dialog]')].at(-1);[...d.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click();})()`);
  try {
    await evaluate(`adminTest.reset('academic','Admin',{
      '/api/classes':[{id:7,name:'Turma teste',code:'T01',students:20,semesterId:1,shiftId:1,courseId:1,courseModuleId:2}],
      '/api/courses':[{id:1,name:'Curso inicial',code:'C',active:true},{id:5,name:'Outro curso',code:'C2',active:true}],
      '/api/courses/5/modules':[{id:6,courseId:5,name:'Novo módulo',order:1}],
      '/api/shifts':[{id:1,name:'Manhã',startsAt:'08:00:00',endsAt:'12:00:00'},{id:2,name:'Tarde',startsAt:'13:00:00',endsAt:'17:00:00'}],
      '/api/classes/7/units':{legacyWithoutModule:false,presentialHours:0,eadHours:0,unitsWithoutHours:0,units:[]},
      '/api/classes/7/shift-change?shiftId=2':{classId:7,currentShiftId:1,currentShiftName:'Manhã',shiftId:2,shiftName:'Tarde',previewToken:'preview-combined',links:[{label:'Reservas',count:3}]}
    })`);
    await waitFor("document.body.innerText.includes('Turma teste')");
    await evaluate("adminTest.click('Turma teste')");
    await waitFor("!!document.querySelector('[role=dialog]')");
    await evaluate("adminTest.click('Editar turma')");
    await waitFor("!!document.querySelector('input[aria-label=\"Nome da turma\"]')");
    await evaluate("adminTest.select('Curso','5')");
    await waitFor("document.body.innerText.includes('Novo módulo')");
    await evaluate("adminTest.select('Módulo','6'); const s=document.querySelector('select[aria-label=\"Turno da turma\"]');s.value='2';s.dispatchEvent(new Event('change',{bubbles:true})); const i=document.querySelector('input[aria-label=\"Nome da turma\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'Turma revisada');i.dispatchEvent(new Event('input',{bubbles:true}));");
    await lastButton('Salvar');
    await waitFor("document.querySelectorAll('[role=dialog]').length===3");
    assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog]')].at(-1).querySelector('h2').textContent"), 'Confirmar alterações da turma');
    assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog]')].at(-1).innerText.includes('Curso: Outro curso. Módulo: Novo módulo.')"), true);
    assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog]')].at(-1).innerText.includes('continuarão com seus dados e horários atuais')"), true);
    assert.equal(await evaluate("adminTest.calls.some(r=>r.method==='PUT')"), false);
    for (const theme of ['light','dark']) for (const width of [375,1366]) {
      await evaluate(`document.documentElement.dataset.theme='${theme}'`);
      await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===375});
      assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog]')].at(-1).scrollWidth<=[...document.querySelectorAll('[role=dialog]')].at(-1).clientWidth+1"), true);
      const folder = process.env.SALAGEST_COMBINED_CAPTURES;
      if (folder) {
        await mkdir(folder,{recursive:true});
        const shot = await command('Page.captureScreenshot',{format:'png'}) as {data:string};
        await writeFile(`${folder}/${theme}-${width}.png`,Buffer.from(shot.data,'base64'));
      }
    }
    await lastButton('Cancelar');
    await waitFor("document.querySelectorAll('[role=dialog]').length===2");
    assert.equal(await evaluate("adminTest.calls.some(r=>r.method==='PUT')"), false);
    await lastButton('Salvar');
    await waitFor("document.querySelectorAll('[role=dialog]').length===3");
    await lastButton('Confirmar alterações');
    await waitFor("adminTest.pending.some(r=>r.path==='/api/classes/7')");
    assert.deepEqual(await evaluate("adminTest.pending.find(r=>r.path==='/api/classes/7').body"), {
      name:'Turma revisada',code:'T01',shiftId:2,courseId:5,courseModuleId:6,
      curriculumChangeConfirmed:true,shiftChangeConfirmed:true,shiftPreviewToken:'preview-combined'
    });
    await evaluate("adminTest.reply('/api/classes/7',{error:'A prévia mudou. Consulte novamente.'},409)");
    await waitFor("document.body.innerText.includes('A prévia mudou. Consulte novamente.')");
    assert.equal(await evaluate("document.querySelector('input[aria-label=\"Nome da turma\"]').value"), 'Turma revisada');
    await lastButton('Cancelar');
    await waitFor("document.querySelectorAll('[role=dialog]').length===2");
    await lastButton('Salvar');
    await waitFor("document.querySelectorAll('[role=dialog]').length===3");
    await lastButton('Confirmar alterações');
    await waitFor("adminTest.pending.some(r=>r.path==='/api/classes/7')");
    await evaluate("Object.assign(adminTest.catalog['/api/classes'][0],{name:'Turma revisada',shiftId:2,courseId:5,courseModuleId:6});adminTest.reply('/api/classes/7',null,204)");
    await waitFor("document.querySelectorAll('[role=dialog]').length===1 && document.body.innerText.includes('Turma atualizada')");
    assert.equal(await evaluate("document.querySelector('[role=dialog] h2').textContent"), 'Turma revisada');
    assert.equal(await evaluate("adminTest.calls.some(r=>r.method==='PUT'&&r.path==='/api/classes/7/shift-change')"), false);
  } finally { await close(); }
});
