import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { chromePath, openAdminFixture } from "./helpers/browser.ts";

function setup(role = "Admin") {
  const booking = { id:7,reason:"Aula",status:"Pendente",teacherId:"t0",classGroupId:20,curricularUnitId:40,
    curricularUnitName:"Desenvolvimento de aplicações web",curricularCapabilityId:null,startsAt:"2027-03-01T08:00:00",
    endsAt:"2027-03-01T12:00:00",students:30,recurrence:"Semanal",weekdaysMask:10,repeatUntil:"2027-03-31",version:"v1",
    needsProjector:true,needsTeacherComputer:true,needsStudentComputers:false,minTier:"Basico",minRamGb:0,
    needsDedicatedGpu:false,softwareIds:[],studentsPerComputer:1 };
  const options = [{classGroupId:20,className:"Desenvolvimento de Sistemas",students:30,curricularUnitId:40,
    unitName:"Desenvolvimento de aplicações web",weekday:null,preferredShiftId:1,qualificationWarning:false,capabilities:[]}];
  return `adminTest.reset('bookings',${JSON.stringify(role)},${JSON.stringify({
    "/api/classes":[{id:20,name:"Desenvolvimento de Sistemas",code:"DS-2027",students:30,semesterId:1,shiftId:1}],
    "/api/bookings":[booking,{...booking,id:8,teacherId:role === "Admin" ? "t1" : "t0"}, {...booking,id:9,status:"Aprovada",approvedRoomId:10}, {...booking,id:11,status:"Rejeitada"}],
    ...Object.fromEntries([7,9,11].map(id => [`/api/audit/Booking/${id}`, [{id,action:"Criada",actorName:"Docente 0",
      createdAtUtc:"2027-02-01T12:00:00Z",beforeJson:null,afterJson:JSON.stringify({ClassGroupId:20,Status:"Pendente"}),reason:null}]])),
    "/api/bookings/pedagogical-options":options,"/api/bookings/pedagogical-options?teacherId=t0":options,
    "/api/bookings/7/suggestions":[{id:10,name:"Laboratório de Informática",location:"Bloco A",seats:35,computers:30,compatible:true,
      available:false,availableOccurrences:1,totalOccurrences:3,computerGroups:[],conflicts:[]}],
    "/api/bookings/7/availability?roomId=10":{roomId:10,total:3,available:1,unavailable:2,days:[
      {start:"2027-03-01T08:00:00",end:"2027-03-01T12:00:00",available:true,conflicts:[]},
      {start:"2027-03-03T08:00:00",end:"2027-03-03T12:00:00",available:false,conflicts:[{teacherId:"t0",classGroupId:20,startsAt:"2027-03-03T08:00:00"}]},
      {start:"2027-03-04T08:00:00",end:"2027-03-04T12:00:00",available:false,conflicts:[{teacherId:"t1",classGroupId:20,startsAt:"2027-03-04T08:00:00"}]}]},
  })})`;
}

const row = "document.getElementById('booking-7').closest('.card')";
const options = { skip: !chromePath, timeout: 60000 };

async function captureViews(browser: Awaited<ReturnType<typeof openAdminFixture>>, name: string) {
  for (const theme of ['light','dark']) for (const width of [375,1366]) {
    await browser.evaluate(`document.documentElement.dataset.theme='${theme}'`);
    await browser.command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===375});
    await browser.evaluate("new Promise(r=>setTimeout(r,250));");
    assert.equal(await browser.evaluate("[...document.querySelectorAll('[role=dialog]')].every(d=>d.scrollWidth<=d.clientWidth+1)"),true);
    const folder=process.env.SALAGEST_BOOKINGS_CAPTURES;
    if(folder) {
      await mkdir(folder,{recursive:true});
      await browser.evaluate("[...document.querySelectorAll('.modal-scroll')].at(-1).scrollTop=0");
      const shot=await browser.command('Page.captureScreenshot',{format:'png'}) as {data:string};
      await writeFile(`${folder}/${name}-${theme}-${width}.png`,Buffer.from(shot.data,'base64'));
    }
  }
}

test("reservas: busca, situação e filtros administrativos preservam a distinção dos perfis", options, async () => {
  const {evaluate,waitFor,command,close} = await openAdminFixture('adminIntegrations');
  try {
    for (const role of ['Admin','Professor']) {
      await evaluate(setup(role));
      await waitFor("!!document.getElementById('booking-7')");
      assert.equal(await evaluate("document.body.innerText.includes('#null')"), false);
      assert.equal(await evaluate("document.querySelector('h1').textContent"), role === 'Admin' ? 'Reservas de salas' : 'Minhas reservas');
      await evaluate("document.querySelector('summary').click()");
      assert.equal(await evaluate("[...document.querySelectorAll('label')].some(l=>l.querySelector('span')?.textContent==='Instrutor')"), role === 'Admin');
      if(role === 'Admin') {
        await evaluate("adminTest.select('Instrutor','t1')");
        await waitFor("!document.getElementById('booking-7') && !!document.getElementById('booking-8')");
        await evaluate("adminTest.click('Limpar filtros')");
      }
      await evaluate("adminTest.input('Período a partir de','2027-04-01')");
      await waitFor("document.body.innerText.includes('Nenhuma reserva encontrada')");
      await evaluate("adminTest.input('Período a partir de','2027-03-15')");
      await waitFor("!!document.getElementById('booking-7')");
      await evaluate("adminTest.input('Período a partir de','')");
      await evaluate("adminTest.input('Buscar reserva','nao existe')");
      await waitFor("document.body.innerText.includes('Nenhuma reserva encontrada')");
      await evaluate("adminTest.input('Buscar reserva','aplicacoes')");
      await waitFor("!!document.getElementById('booking-7')");
      await evaluate("adminTest.input('Buscar reserva','')");
      await evaluate("[...document.querySelectorAll('button[aria-pressed]')].find(b=>b.textContent.startsWith('Confirmadas')).click()");
      await waitFor("!!document.getElementById('booking-9') && !document.getElementById('booking-7')");
      await evaluate("[...document.querySelectorAll('button[aria-pressed]')].find(b=>b.textContent.startsWith('Todas')).click();document.querySelector('details').open=false");
      for(const theme of ['light','dark']) for(const [width,height] of [[375,812],[812,375],[1366,900]]) {
        await evaluate(`document.documentElement.dataset.theme='${theme}'`);
        await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});
        assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"), true);
        const folder=process.env.SALAGEST_BOOKINGS_CAPTURES;
        if(folder) {
          await mkdir(folder,{recursive:true});
          await evaluate("new Promise(r=>setTimeout(r,250))");
          const shot=await command('Page.captureScreenshot',{format:'png'}) as {data:string};
          await writeFile(`${folder}/${role}-list-${theme}-${width}.png`,Buffer.from(shot.data,'base64'));
        }
      }
    }
  } finally {await close();}
});

test("cartão abre detalhes e histórico por clique e teclado, com ações apenas para pendentes", options, async () => {
  const browser = await openAdminFixture('adminIntegrations');
  const {evaluate,waitFor,command,close} = browser;
  const key = async (value:string,code:number) => {
    const name=value===' ' ? 'Space' : value;
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:value,code:name,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code,
      ...(value==='Enter' ? {text:'\r',unmodifiedText:'\r'} : value===' ' ? {text:' ',unmodifiedText:' '} : {})});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:value,code:name,windowsVirtualKeyCode:code});
  };
  try {
    for(const role of ['Admin','Professor']) {
      await evaluate(setup(role)); await waitFor("!!document.getElementById('booking-11')");
      assert.equal(await evaluate("[...document.querySelectorAll('article button')].filter(b=>b.textContent==='Escolher sala').length"),2);
      assert.equal(await evaluate(`${row}.querySelector('summary')===null`),true);
      await evaluate(`${row}.closest('article').click()`);
      await waitFor("document.querySelector('[role=dialog] h2')?.textContent==='Detalhes da reserva #7'");
      assert.equal(await evaluate("document.querySelector('[aria-label=\"Histórico da reserva\"]').open"),false);
      await captureViews(browser,`${role}-details-history-collapsed`);
      await evaluate("document.querySelector('[aria-label=\"Histórico da reserva\"] summary').focus()");
      await key('Enter',13);
      await waitFor("document.querySelector('[aria-label=\"Histórico da reserva\"]').innerText.includes('Criada')");
      assert.equal(await evaluate("adminTest.calls.some(r=>r.path==='/api/bookings/7/suggestions')"),false);
      assert.equal(await evaluate("getComputedStyle(document.querySelector('[aria-label=\"Histórico da reserva\"] ol')).overflowY"),'visible');
      assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] button')].some(b=>b.textContent==='Editar')"),true);
      await captureViews(browser,`${role}-details-pending`);
      await evaluate("document.querySelector('[aria-label=\"Histórico da reserva\"] summary').focus()");
      await key(' ',32);
      assert.equal(await evaluate("document.querySelector('[aria-label=\"Histórico da reserva\"]').open"),false);
      await evaluate("document.querySelector('button[aria-label=Fechar]').click()");
      await waitFor("!document.querySelector('[role=dialog]')");
      await evaluate(`${row}.querySelector('button[aria-haspopup=dialog]').focus()`);
      await key('Enter',13);
      await waitFor("document.querySelector('[role=dialog] h2')?.textContent==='Detalhes da reserva #7'");
      await key('Escape',27); await waitFor("!document.querySelector('[role=dialog]')");
      assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"),'Abrir detalhes da reserva #7: Desenvolvimento de Sistemas');
      await key(' ',32); await waitFor("document.querySelector('[role=dialog] h2')?.textContent==='Detalhes da reserva #7'");
      await key('Escape',27); await waitFor("!document.querySelector('[role=dialog]')");
      for(const id of [9,11]) {
        await evaluate(`document.getElementById('booking-${id}').closest('article').querySelector('p').click()`);
        await waitFor(`document.querySelector('[role=dialog] h2')?.textContent==='Detalhes da reserva #${id}'`);
        assert.equal(await evaluate("document.querySelector('[aria-label=\"Histórico da reserva\"]').open"),false);
        await evaluate("document.querySelector('[aria-label=\"Histórico da reserva\"] summary').click()");
        await waitFor("document.querySelector('[aria-label=\"Histórico da reserva\"]').innerText.includes('Criada')");
        assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] button')].some(b=>['Escolher sala','Editar','Descartar'].includes(b.textContent.trim()))"),false);
        await captureViews(browser,`${role}-details-${id}`);
        await key('Escape',27); await waitFor("!document.querySelector('[role=dialog]')");
      }
      const auditCalls=await evaluate<number>("adminTest.calls.filter(r=>r.path.startsWith('/api/audit/')).length");
      await evaluate(`[...${row}.querySelectorAll('button')].find(b=>b.textContent==='Escolher sala').click()`);
      await waitFor("document.querySelector('[role=dialog] h2')?.textContent==='Escolher sala'");
      assert.equal(await evaluate("document.querySelectorAll('[role=dialog]').length"),1);
      assert.equal(await evaluate("adminTest.calls.filter(r=>r.path.startsWith('/api/audit/')).length"),auditCalls);
      await key('Escape',27); await waitFor("!document.querySelector('[role=dialog]')");
      assert.equal(await evaluate("adminTest.calls.some(r=>r.method!=='GET')"),false);
    }
  } finally {await close();}
});

test("criação e edição protegem rascunho ao fechar e durante envio", options, async () => {
  const browser = await openAdminFixture('adminIntegrations');
  const {evaluate,waitFor,close} = browser;
  const lastButton=(text:string)=>evaluate(`(()=>{const d=[...document.querySelectorAll('[role=dialog]')].at(-1);[...d.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click();})()`);
  try {
    await evaluate(setup()); await waitFor("!!document.getElementById('booking-7')");
    await evaluate("adminTest.click('Nova reserva')"); await waitFor("!!document.querySelector('form')");
    assert.equal(await evaluate("[...document.querySelectorAll('label')].find(l=>l.querySelector('span')?.textContent==='Turma').querySelector('select').disabled"), true);
    await evaluate("adminTest.select('Instrutor responsável','t0')");
    await waitFor("[...document.querySelectorAll('label')].find(l=>l.querySelector('span')?.textContent==='Unidade curricular').querySelector('select').value==='40'");
    await captureViews(browser,'Admin-form');
    await evaluate("document.querySelector('form input[type=checkbox]').click();document.querySelector('form button[aria-haspopup=dialog]').click()");
    await waitFor("document.querySelectorAll('[role=dialog]').length===2");
    await captureViews(browser,'Admin-repeat-until');
    await lastButton('Cancelar'); await waitFor("document.querySelectorAll('[role=dialog]').length===1");
    await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
    await waitFor("document.querySelectorAll('[role=dialog]').length===2");
    await lastButton('Cancelar');
    await waitFor("document.querySelectorAll('[role=dialog]').length===1");
    assert.equal(await evaluate("[...document.querySelectorAll('label')].find(l=>l.querySelector('span')?.textContent==='Instrutor responsável').querySelector('select').value"), 't0');
    await evaluate("document.querySelector('form').requestSubmit()");
    await waitFor("adminTest.pending.some(r=>r.path==='/api/bookings')");
    await evaluate("document.querySelector('button[aria-label=Fechar]').click()");
    assert.equal(await evaluate("document.querySelectorAll('[role=dialog]').length"),1);
    assert.equal(await evaluate("adminTest.calls.filter(r=>r.method==='POST').length"),1);
    await evaluate("adminTest.reply('/api/bookings',{error:'Falha ao salvar'},500)");
    await waitFor("document.querySelector('form').innerText.includes('Falha ao salvar')");
    await lastButton('Cancelar'); await waitFor("document.querySelectorAll('[role=dialog]').length===2");
    await lastButton('Descartar alterações'); await waitFor("!document.querySelector('[role=dialog]')");
    await evaluate(`${row}.querySelector('button[aria-haspopup=dialog]').click()`);
    await waitFor("!!document.querySelector('[role=dialog] h2')");
    await evaluate("adminTest.click('Editar')");
    await waitFor("!!document.querySelector('form')");
    await evaluate("const i=document.querySelector('input[type=url]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'https://example.test/plano');i.dispatchEvent(new Event('input',{bubbles:true}))");
    await evaluate("[...document.querySelectorAll('[role=dialog]')].at(-1).parentElement.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))");
    await waitFor("document.querySelectorAll('[role=dialog]').length===3");
    await lastButton('Cancelar');
    assert.equal(await evaluate("document.querySelector('input[type=url]').value"),'https://example.test/plano');
    assert.equal(await evaluate("adminTest.calls.some(r=>r.method==='PUT')"),false);
    await captureViews(browser,'Admin-edit');
    await evaluate(setup('Professor')); await waitFor("!document.querySelector('[role=dialog]') && !!document.getElementById('booking-7')");
    await evaluate("adminTest.click('Nova reserva')"); await waitFor("!!document.querySelector('form')");
    await waitFor("[...document.querySelectorAll('label')].find(l=>l.querySelector('span')?.textContent==='Unidade curricular').querySelector('select').value==='40'");
    assert.equal(await evaluate("[...document.querySelectorAll('label')].some(l=>l.querySelector('span')?.textContent==='Instrutor responsável')"),false);
    await evaluate("document.querySelector('form details').open=true");
    await captureViews(browser,'Professor-form-resources');
  } finally {await close();}
});

test("escolha de sala preserva erros, confirma datas e não reutiliza sugestões antigas", options, async () => {
  const browser = await openAdminFixture('adminIntegrations');
  const {evaluate,waitFor,command,close} = browser;
  const lastButton=(text:string)=>evaluate(`(()=>{const d=[...document.querySelectorAll('[role=dialog]')].at(-1);[...d.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click();})()`);
  try {
    await evaluate(setup()); await waitFor("!!document.getElementById('booking-7')");
    await evaluate(`([...${row}.querySelectorAll('button')].find(b=>b.textContent==='Escolher sala')).click()`);
    await waitFor("!!document.querySelector('[aria-label=\"Ambientes sugeridos para a reserva\"] button:not([disabled])')");
    await evaluate("document.querySelector('[aria-label=\"Ambientes sugeridos para a reserva\"] button').click()");
    await waitFor("document.querySelector('[aria-label=\"Detalhes da sala selecionada\"]').innerText.includes('3 datas solicitadas')");
    await captureViews(browser,'Admin-room');
    assert.equal(await evaluate("document.querySelector('[role=dialog]').innerText.includes('Substituir alocações de Docente 0 nesta mesma turma')"),true);
    await evaluate("document.querySelector('[role=dialog] input[type=checkbox]').click()");
    await lastButton('Revisar 2 datas'); await waitFor("document.querySelectorAll('[role=dialog]').length===2");
    const review=await evaluate<string>("[...document.querySelectorAll('[role=dialog]')].at(-1).innerText");
    assert.match(review,/Laboratório de Informática/); assert.match(review,/04\/03\/2027/); assert.match(review,/01\/03\/2027, 03\/03\/2027/);
    await captureViews(browser,'Admin-partial-confirm');
    assert.equal(await evaluate("adminTest.pending.length"),0);
    await lastButton('Confirmar 2 datas');
    await waitFor("adminTest.pending.some(r=>r.path==='/api/bookings/7/confirm')");
    assert.deepEqual(await evaluate("adminTest.pending.find(r=>r.path==='/api/bookings/7/confirm').body"),{roomId:10,confirmPartial:true,replaceOwnClassBooking:true});
    await evaluate("adminTest.reply('/api/bookings/7/confirm',{error:'A disponibilidade mudou. Consulte novamente.'},409)");
    await waitFor("!!document.querySelector('[role=alert]') && [...document.querySelectorAll('button')].find(b=>b.textContent.includes('Revisar 2'))?.disabled===false");
    assert.equal(await evaluate("document.querySelector('[role=alert]').textContent.includes('A disponibilidade mudou')"),true);
    for(const theme of ['light','dark']) for(const width of [375,1366]) {
      await evaluate(`document.documentElement.dataset.theme='${theme}'`);
      await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===375});
      assert.equal(await evaluate("document.querySelector('[role=dialog]').scrollWidth<=document.querySelector('[role=dialog]').clientWidth+1"),true);
    }
    await lastButton('Tentar novamente'); await waitFor("!document.querySelector('[role=alert]')");
    await evaluate("document.querySelector('button[aria-label=Fechar]').click()"); await waitFor("!document.querySelector('[role=dialog]')");
    await evaluate(`adminTest.deferred.push('/api/bookings/7/suggestions');([...${row}.querySelectorAll('button')].find(b=>b.textContent==='Escolher sala')).click()`);
    await waitFor("adminTest.pending.some(r=>r.path==='/api/bookings/7/suggestions')");
    assert.equal(await evaluate("document.querySelectorAll('[aria-label=\"Ambientes sugeridos para a reserva\"] button').length"),0);
    await evaluate("adminTest.reply('/api/bookings/7/suggestions',{error:'Falha ao carregar salas'},500)");
    await waitFor("document.body.innerText.includes('Falha ao carregar salas')");
    assert.equal(await evaluate("document.querySelectorAll('[aria-label=\"Ambientes sugeridos para a reserva\"] button').length"),0);
    await lastButton('Tentar novamente'); await waitFor("adminTest.pending.some(r=>r.path==='/api/bookings/7/suggestions')");
    await evaluate("document.querySelector('button[aria-label=Fechar]').click()"); await waitFor("!document.querySelector('[role=dialog]')");
    await evaluate("[...document.getElementById('booking-8').closest('.card').querySelectorAll('button')].find(b=>b.textContent==='Escolher sala').click()");
    await waitFor("document.querySelector('[role=dialog]')?.innerText.includes('Nenhuma sala cadastrada')");
    await evaluate("adminTest.reply('/api/bookings/7/suggestions',[{id:999,name:'Sala da consulta anterior'}])");
    await evaluate("new Promise(r=>setTimeout(r,100))");
    assert.equal(await evaluate("document.querySelector('[role=dialog]').innerText.includes('Sala da consulta anterior')"),false);
  } finally {await close();}
});
