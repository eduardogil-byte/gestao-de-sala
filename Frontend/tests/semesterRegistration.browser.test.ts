import assert from 'node:assert/strict';
import test from 'node:test';
import {chromePath, openAdminFixture} from './helpers/browser.ts';

test('semestres mostram apenas cadastro e preservam as datas sugeridas', {skip: !chromePath, timeout: 60000}, async () => {
  const {evaluate,waitFor,command,close} = await openAdminFixture('adminIntegrations');
  try {
    await evaluate("adminTest.reset('academic')");
    await waitFor("!!document.querySelector('[role=tab]')");
    await evaluate("adminTest.click('Semestres')");
    await waitFor("document.body.innerText.includes('Semestre A')");
    assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Calendário do semestre\"]') || [...document.querySelectorAll('button')].some(item=>item.textContent==='Calendário')"),false);
    await evaluate("adminTest.click('Novo semestre')");
    await waitFor("!!document.querySelector('[role=dialog]')");
    await evaluate("adminTest.input('Ano','2027');adminTest.select('Semestre','1')");
    assert.equal(await evaluate("document.querySelector('[role=dialog]').textContent.includes('Datas sugeridas pela RN-01')"),false);
    const dates = await evaluate("[...document.querySelectorAll('[role=dialog] input[type=date]')].map(item=>item.value)");
    assert.equal((dates as string[]).length,2);
    assert.ok((dates as string[]).every(value=>value.startsWith('2027-')));
    for(const theme of ['light','dark']) for(const width of [360,1366]) {
      await evaluate(`document.documentElement.dataset.theme='${theme}'`);
      await command('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:width===360});
      assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),true);
    }
    await evaluate("adminTest.click('Adicionar semestre')");
    await waitFor("adminTest.pending.some(item=>item.path==='/api/semesters')");
    assert.deepEqual(await evaluate("adminTest.pending.find(item=>item.path==='/api/semesters').body"),{name:'2027/1',startDate:(dates as string[])[0],endDate:(dates as string[])[1]});
    await evaluate("adminTest.reply('/api/semesters',{id:3},201)");
    await waitFor("!document.querySelector('[role=dialog]')");
    assert.equal(await evaluate("adminTest.calls.some(item=>item.path.includes('/calendar'))"),false);
  } finally {await close();}
});
