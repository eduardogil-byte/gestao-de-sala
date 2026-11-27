import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { chromePath, openAdminFixture } from "./helpers/browser.ts";

const setup = `adminTest.reset('academic','Admin',{
  '/api/classes':[{id:7,name:'Turma persistente',code:'T01',students:25,semesterId:1,courseId:1,courseModuleId:2,shiftId:1}],
  '/api/semesters':[{id:1,name:'2027 A',startDate:'2027-01-01',endDate:'2027-06-30'},{id:2,name:'2027 B',startDate:'2027-07-01',endDate:'2027-12-31'},{id:3,name:'2028 A',startDate:'2028-01-01',endDate:'2028-06-30'}],
  '/api/courses/1/modules':[{id:2,name:'Modulo atual',courseId:1,order:1},{id:9,name:'Modulo seguinte',courseId:1,order:2}],
  '/api/classes/7/history':[{id:7,semesterId:1,semesterName:'2027 A',startDate:'2027-01-01',moduleName:'Modulo atual',shiftName:'Manha'}],
  '/api/classes/7/units':{legacyWithoutModule:false,presentialHours:8,eadHours:0,unitsWithoutHours:0,units:[]},
  '/api/classes/7/continuation-options?moduleId=2':[{curricularUnitId:3,code:'UC',name:'UC atual',teachers:[{teacherId:'t0',displayName:'Docente 0'}]}],
  '/api/classes/7/continuation-options?moduleId=9':[{curricularUnitId:6,code:'UC2',name:'UC seguinte',teachers:[]}]
})`;

test("continuar turma mantém módulo, confirma descarte, preserva rascunho após erro e consulta histórico", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture('adminIntegrations');
  const lastButton = (text: string) => evaluate(`(() => {const d=[...document.querySelectorAll('[role=dialog]')].at(-1); [...d.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click();})()`);
  try {
    await evaluate(setup);
    await waitFor("document.body.innerText.includes('Turma persistente')");
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Turma persistente').click()");
    await waitFor("document.querySelector('[role=dialog]').innerText.includes('2027 A') && ![...document.querySelectorAll('button')].find(b=>b.textContent==='Continuar em outro semestre').disabled");
    await evaluate("adminTest.click('Continuar em outro semestre')");
    await waitFor("document.body.innerText.includes('Instrutor de UC atual')");
    assert.equal(await evaluate("[...document.querySelectorAll('label')].find(l=>l.querySelector('span')?.textContent==='Módulo da continuação').querySelector('select').value"), '2');
    await evaluate("adminTest.select('Semestre de destino','2'); adminTest.select('Instrutor de UC atual','t0')");
    await lastButton('Cancelar');
    await waitFor("document.querySelectorAll('[role=dialog]').length===3");
    await lastButton('Cancelar');
    await waitFor("document.querySelectorAll('[role=dialog]').length===2");
    for (const theme of ['light','dark']) for (const width of [375,1366]) {
      await evaluate(`document.documentElement.dataset.theme='${theme}'`);
      await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===375});
      assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog]')].at(-1).scrollWidth <= [...document.querySelectorAll('[role=dialog]')].at(-1).clientWidth + 1"), true);
      const folder = process.env.SALAGEST_CONTINUATION_CAPTURES;
      if (folder) {
        await mkdir(folder,{recursive:true}); await new Promise(r=>setTimeout(r,350));
        const shot = await command('Page.captureScreenshot',{format:'png'}) as {data:string};
        await writeFile(`${folder}/${theme}-${width}.png`,Buffer.from(shot.data,'base64'));
      }
    }
    await lastButton('Criar continuação');
    await waitFor("adminTest.pending.some(r=>r.path==='/api/classes/7/continue')");
    assert.deepEqual(await evaluate("adminTest.pending.find(r=>r.path==='/api/classes/7/continue').body"),
      {semesterId:2,courseModuleId:2,shiftId:1,teachers:[{curricularUnitId:3,teacherId:'t0'}]});
    await evaluate("adminTest.reply('/api/classes/7/continue',{error:'Semestre já cadastrado'},409)");
    await waitFor("document.body.innerText.includes('Semestre já cadastrado')");
    assert.equal(await evaluate("[...document.querySelectorAll('label')].find(l=>l.querySelector('span')?.textContent==='Semestre de destino').querySelector('select').value"), '2');
    await lastButton('Criar continuação');
    await waitFor("adminTest.pending.some(r=>r.path==='/api/classes/7/continue')");
    await evaluate(`adminTest.catalog['/api/classes'].push({...adminTest.catalog['/api/classes'][0],id:8,semesterId:2,previousClassGroupId:7});
      const history=[...adminTest.catalog['/api/classes/7/history'],{id:8,semesterId:2,semesterName:'2027 B',startDate:'2027-07-01',moduleName:'Modulo atual',shiftName:'Manha'}];
      adminTest.catalog['/api/classes/7/history']=history; adminTest.catalog['/api/classes/8/history']=history;
      adminTest.catalog['/api/classes/8/units']=adminTest.catalog['/api/classes/7/units'];
      adminTest.reply('/api/classes/7/continue',{id:8},201)`);
    await waitFor("document.querySelectorAll('[role=dialog]').length===1 && document.querySelector('[role=dialog] summary')?.textContent==='Histórico de semestres (2)'");
    await evaluate("document.querySelector('[role=dialog] summary').click()");
    await waitFor("document.body.innerText.includes('2027 B · Em consulta')");
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Unidades curriculares e instrutores\"] h3 + p').textContent"), 'Semestre: 2027 B');
    assert.equal(await evaluate("adminTest.calls.filter(r=>r.method==='POST').every(r=>r.path==='/api/classes/7/continue')"), true);
    await evaluate("adminTest.click('Consultar 2027 A')");
    await waitFor("!!document.querySelector('[role=dialog] summary') && !document.querySelector('[role=dialog] details').open");
    await evaluate("document.querySelector('[role=dialog] summary').click()");
    await waitFor("document.body.innerText.includes('2027 A · Em consulta')");
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Unidades curriculares e instrutores\"] h3 + p').textContent"), 'Semestre: 2027 A');
    await evaluate("adminTest.click('Continuar em outro semestre')");
    await waitFor("document.body.innerText.includes('Semestre de destino')");
    assert.deepEqual(await evaluate("[...document.querySelectorAll('label')].find(l=>l.querySelector('span')?.textContent==='Semestre de destino').querySelector('select').innerText.split('\\n')"), ['Selecione um semestre','2028 A']);
  } finally { await close(); }
});

test("mudar módulo limpa instrutores e Professor apenas consulta histórico", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, close } = await openAdminFixture('adminIntegrations');
  try {
    await evaluate(setup);
    await waitFor("document.body.innerText.includes('Turma persistente')");
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Turma persistente').click()");
    await waitFor("![...document.querySelectorAll('button')].find(b=>b.textContent==='Continuar em outro semestre').disabled");
    await evaluate("adminTest.click('Continuar em outro semestre')");
    await waitFor("document.body.innerText.includes('Instrutor de UC atual')");
    await evaluate("adminTest.select('Instrutor de UC atual','t0'); adminTest.select('Módulo da continuação','9')");
    await waitFor("document.body.innerText.includes('Instrutor de UC seguinte')");
    assert.equal(await evaluate("document.body.innerText.includes('Instrutor de UC atual')"), false);
    await evaluate("adminTest.select('Semestre de destino','2'); adminTest.click('Criar continuação')");
    await waitFor("adminTest.pending.some(r=>r.path==='/api/classes/7/continue')");
    assert.deepEqual(await evaluate("adminTest.pending.find(r=>r.path==='/api/classes/7/continue').body.teachers"), []);
    await evaluate("adminTest.reply('/api/classes/7/continue',{error:'Falha controlada'},409)");
    await waitFor("document.body.innerText.includes('Falha controlada')");
    await evaluate("adminTest.reset('academic','Professor',{'/api/classes':[{id:7,name:'Turma antiga',semesterId:1,students:25}],'/api/classes/7/history':[{id:7,semesterId:1,semesterName:'Semestre A'}],'/api/classes/7/units':{legacyWithoutModule:true,presentialHours:0,eadHours:0,unitsWithoutHours:0,units:[]}})");
    await waitFor("document.body.innerText.includes('Turma antiga')");
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Turma antiga').click()");
    await waitFor("document.body.innerText.includes('Histórico de semestres')");
    assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='Continuar em outro semestre')"), false);
  } finally { await close(); }
});
