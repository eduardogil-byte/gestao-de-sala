import assert from 'node:assert/strict';
import test from 'node:test';
import {chromePath, openAdminFixture} from './helpers/browser.ts';

test('calendário alterna seleção entre meses e salva somente as datas marcadas', {skip: !chromePath, timeout: 60000}, async () => {
  const {evaluate,waitFor,command,close} = await openAdminFixture('adminIntegrations');
  try {
    await evaluate("adminTest.reset('academic')"); await waitFor("!!document.querySelector('[role=tab]')");
    await evaluate("adminTest.catalog['/api/semesters'][0].startDate='2027-01-01';adminTest.catalog['/api/semesters'][0].endDate='2027-06-30';adminTest.catalog['/api/semesters/1/calendar']={events:[{id:9,startDate:'2027-01-06',endDate:'2027-01-06',kind:'Holiday',description:'Feriado cadastrado'}]};adminTest.click('Atualizar dados');adminTest.click('Semestres')");
    await waitFor("document.body.innerText.includes('01/01/2027')"); await evaluate("adminTest.click('Calendário')");
    await waitFor("!!document.querySelector('button[data-date=\"2027-01-05\"]')");
    const clickDate = (date:string) => evaluate(`document.querySelector('button[data-date="${date}"]').click()`);
    await clickDate('2027-01-05');
    await waitFor("!!document.querySelector('[role=dialog] form')");
    assert.equal(await evaluate("document.querySelector('button[data-date=\"2027-01-05\"]').getAttribute('aria-pressed')"), 'true');
    await clickDate('2027-01-05');
    await waitFor("!document.querySelector('[role=dialog] form')");
    await clickDate('2027-01-06');
    await waitFor("document.body.innerText.includes('Feriado cadastrado')");
    assert.equal(await evaluate("!!document.querySelector('[role=dialog] form')"), false);
    await clickDate('2027-01-06'); await clickDate('2027-01-05');
    await evaluate("adminTest.select('Mês do calendário','2027-02')");
    await waitFor("!!document.querySelector('button[data-date=\"2027-02-10\"]')");
    await clickDate('2027-02-10');
    await evaluate("adminTest.select('Tipo de ocorrência','Recess');adminTest.input('Descrição da ocorrência','Recesso selecionado')");
    for(const theme of ['light','dark']) for(const width of [360,1366]) {
      await evaluate(`document.documentElement.dataset.theme='${theme}'`);
      await command('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:width===360});
      assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),true);
    }
    await evaluate("adminTest.click('Salvar ocorrência')");
    await waitFor("adminTest.pending.some(item=>item.path==='/api/semesters/1/calendar/events/batch')");
    assert.deepEqual(await evaluate("adminTest.pending.find(item=>item.path==='/api/semesters/1/calendar/events/batch').body"),{dates:['2027-01-05','2027-02-10'],kind:'Recess',description:'Recesso selecionado'});
    await evaluate("adminTest.reply('/api/semesters/1/calendar/events/batch',[{id:10,startDate:'2027-01-05',endDate:'2027-01-05',kind:'Recess',description:'Recesso selecionado'},{id:11,startDate:'2027-02-10',endDate:'2027-02-10',kind:'Recess',description:'Recesso selecionado'}])");
    await waitFor("document.body.innerText.includes('Calendário atualizado')");
    await clickDate('2027-02-10');
    await waitFor("document.body.innerText.includes('Recesso selecionado')");
    assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] dd')].some(item=>item.textContent==='Recesso')"),true);
  } finally {await close();}
});
