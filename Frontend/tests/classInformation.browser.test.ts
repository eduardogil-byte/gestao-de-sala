import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { chromePath, openAdminFixture } from "./helpers/browser.ts";

const setup = `adminTest.reset('academic','Admin',{
  '/api/classes':[{id:7,name:'Desenvolvimento de Sistemas',code:'DS-2027',students:30,semesterId:1,courseId:1,courseModuleId:2,shiftId:1}],
  '/api/classes/7/history':[{id:7,semesterId:1,semesterName:'Semestre A',moduleName:'Módulo sintético',shiftName:'Manhã'}],
  '/api/classes/7/units':{legacyWithoutModule:false,presentialHours:80,eadHours:40,unitsWithoutHours:1,
    previousUnits:[{curricularUnitId:9,code:'UC09',name:'Fundamentos de informática'}],
    units:[
      {curricularUnitId:3,code:'UC01',name:'Desenvolvimento de aplicações web com integração de serviços',plannedHours:80,deliveryMode:'Presencial',teacherId:'t0',resources:[{resourceCatalogItemId:1,name:'Projetor',quantity:1}]},
      {curricularUnitId:4,code:'UC02',name:'Banco de Dados',plannedHours:40,deliveryMode:'Ead',eadScheduleMode:'HorarioDefinido',teacherId:null,resources:[]},
      {curricularUnitId:5,code:'UC03',name:'Projeto integrador',plannedHours:null,deliveryMode:'Ead',eadScheduleMode:'SemHorarioFixo',teacherId:null,resources:[]}
    ]}
})`;

test("ficha da turma prioriza UCs e recolhe histórico nos dois temas e tamanhos", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture('adminIntegrations');
  try {
    await evaluate(setup);
    await waitFor("document.body.innerText.includes('Desenvolvimento de Sistemas')");
    await evaluate("adminTest.click('Desenvolvimento de Sistemas')");
    await waitFor("!!document.querySelector('[role=dialog] article') && !!document.querySelector('[role=dialog] section[aria-label=\"Histórico da turma\"] details')");
    assert.equal(await evaluate("document.querySelector('[role=dialog]').innerText.includes('2 de 3 UCs sem instrutor definido.')"), true);
    assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] details')].every(d=>!d.open)"), true);
    assert.equal(await evaluate("!!(document.querySelector('[role=dialog] article').compareDocumentPosition(document.querySelector('[aria-label=\"Histórico da turma\"]')) & Node.DOCUMENT_POSITION_FOLLOWING)"), true);
    assert.equal(await evaluate("document.querySelectorAll('[role=dialog] article').length"), 3);
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Unidades curriculares e instrutores\"] h3 + p').textContent"), 'Semestre: Semestre A');
    for (const theme of ['light', 'dark']) for (const [width, height] of [[375,812], [812,375], [1366,900]]) {
      await evaluate(`document.documentElement.dataset.theme='${theme}'`);
      await command('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:width<900});
      assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog], [role=dialog] article')].every(e=>e.scrollWidth<=e.clientWidth+1)"), true);
      assert.equal(await evaluate("(() => {const r=document.querySelector('[role=dialog]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1;})()"), true);
      const folder = process.env.SALAGEST_CLASS_CAPTURES;
      if (folder) {
        await mkdir(folder, {recursive:true});
        const shot = await command('Page.captureScreenshot', {format:'png'}) as {data:string};
        await writeFile(`${folder}/${theme}-${width}.png`, Buffer.from(shot.data,'base64'));
      }
    }
    await evaluate("[...document.querySelectorAll('[role=dialog] summary')].find(s=>s.textContent.startsWith('Histórico de semestres')).click()");
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Histórico da turma\"] details').innerText.includes('Semestre A · Em consulta')"), true);
    assert.equal(await evaluate("adminTest.calls.some(r=>r.method!=='GET')"), false);
  } finally { await close(); }
});

test("histórico mantém foco no modal de consulta e falha de carregamento permite tentar novamente", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture('adminIntegrations');
  try {
    await evaluate(setup.replace("'Admin'", "'Professor'"));
    await waitFor("document.body.innerText.includes('Desenvolvimento de Sistemas')");
    await evaluate("adminTest.click('Desenvolvimento de Sistemas')");
    await waitFor("document.querySelectorAll('[role=dialog] summary').length===3");
    assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] button')].some(b=>b.textContent.includes('instrutor')||b.textContent.includes('Continuar'))"), false);
    await evaluate("[...document.querySelectorAll('[role=dialog] summary')].at(-1).focus()");
    await command('Input.dispatchKeyEvent', {type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await command('Input.dispatchKeyEvent', {type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"), 'Fechar');
    await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
    await waitFor("!document.querySelector('[role=dialog]')");
    await evaluate(setup);
    await waitFor("document.body.innerText.includes('Desenvolvimento de Sistemas')");
    await evaluate("adminTest.deferred.push('/api/classes/7/history'); adminTest.click('Desenvolvimento de Sistemas')");
    await waitFor("adminTest.pending.some(r=>r.path==='/api/classes/7/history')");
    await evaluate("adminTest.reply('/api/classes/7/history',{error:'Não foi possível carregar o histórico'},500)");
    await waitFor("document.querySelector('[role=dialog]').innerText.includes('Não foi possível carregar o histórico')");
    assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Continuar em outro semestre').disabled"), true);
    await evaluate("adminTest.deferred=[]; adminTest.click('Tentar novamente')");
    await waitFor("document.querySelector('[aria-label=\"Histórico da turma\"] details') && ![...document.querySelectorAll('button')].find(b=>b.textContent==='Continuar em outro semestre').disabled");
  } finally { await close(); }
});
