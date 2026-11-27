import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { chromePath, openAdminFixture } from "./helpers/browser.ts";

test("listas de instrutores e turmas rolam sem ampliar a página", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture('adminIntegrations');
  try {
    for (const mode of ['teachers', 'academic']) {
      await evaluate(`adminTest.reset('${mode}')`);
      await waitFor("!!document.querySelector('input[type=search]')");
      if (mode === 'academic') {
        await evaluate(`adminTest.catalog['/api/classes'] = Array.from({length:40}, (_,i)=>({id:i+1,name:'Turma '+(i+1),code:'T'+i,students:25,semesterId:1,shiftId:1,courseId:1,courseModuleId:2}));
          for(let i=1;i<=40;i++) adminTest.catalog['/api/classes/'+i+'/units']={legacyWithoutModule:false,presentialHours:0,eadHours:0,unitsWithoutHours:0,units:[]}; adminTest.click('Atualizar dados')`);
        await waitFor("document.querySelectorAll('[aria-label=\"Lista de turmas cadastradas\"] tbody tr').length === 40");
      }
      const label = mode === 'academic' ? 'Lista de turmas cadastradas' : 'Lista de instrutores cadastrados';
      const region = `[...document.querySelectorAll('[aria-label="${label}"]')].find(item=>item.getClientRects().length)`;
      for (const theme of ['light','dark']) for (const width of [360,1366]) {
        await evaluate(`document.documentElement.dataset.theme='${theme}'`);
        await command('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:width===360});
        await waitFor(`${region}?.scrollHeight > ${region}?.clientHeight`);
        assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
        assert.equal(await evaluate(`(() => {const box=${region}; box.scrollTop=100;return box.scrollTop > 0;})()`), true);
        if (mode === 'academic' || width === 1366) {
          assert.equal(await evaluate(`(() => {const box=${region};return Math.abs(box.querySelector('th').getBoundingClientRect().top-box.getBoundingClientRect().top) < 3;})()`), true);
        }
      }
      await evaluate(`(() => {const box=${region};box.scrollTop=0;box.querySelector('button').click();})()`);
      await waitFor("!!document.querySelector('[role=dialog]')");
      assert.equal(await evaluate("!!document.querySelector('[role=dialog] h2')"), true);
      await evaluate("document.querySelector('[role=dialog] button[aria-label=Fechar]').click()");
      await waitFor("!document.querySelector('[role=dialog]')");
    }
  } finally { await close(); }
});

test("ambientes têm rolagem vertical própria e cabeçalho fixo na tabela", { skip: !chromePath, timeout: 60000 }, async () => {
  const {evaluate,waitFor,command,close} = await openAdminFixture();
  const region = "document.querySelector('[aria-label=\"Lista de ambientes cadastrados\"]')";
  try {
    await evaluate(`const originalFetch=window.fetch;window.fetch=async(input,init)=>String(input)==='/api/rooms'&&(!init?.method||init.method==='GET')
      ?new Response(JSON.stringify(Array.from({length:40},(_,i)=>({...adminTest.catalog['/api/rooms'][0],id:i+10,name:'Ambiente '+(i+1),code:'AMB-'+(i+1)})))):originalFetch(input,init)`);
    for(const role of ['Admin','Professor']) {
      await evaluate(`adminTest.reset('rooms','${role}')`);
      await waitFor(`${region}?.querySelectorAll('tbody tr').length===40`);
      for(const theme of ['light','dark']) for(const width of [375,1366]) {
        await evaluate(`document.documentElement.dataset.theme='${theme}'`);
        await command('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:width===375});
        await waitFor(`${region}.scrollHeight>${region}.clientHeight`);
        assert.equal(await evaluate(`${region}.clientHeight<=Math.min(innerHeight*.6,448)+1`),true);
        assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),true);
        await evaluate(`${region}.scrollIntoView({block:'center'});${region}.scrollTop=0;${region}.focus()`);
        const pageTop=await evaluate<number>('scrollY');
        await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
        await command('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
        await waitFor(`${region}.scrollTop>0`);
        assert.equal(await evaluate('scrollY'),pageTop);
        await evaluate(`${region}.scrollTop=150`);
        if(width===1366) assert.equal(await evaluate(`Math.abs(${region}.querySelector('th').getBoundingClientRect().top-${region}.getBoundingClientRect().top)<3`),true);
        const folder=process.env.SALAGEST_ROOMS_SCROLL_CAPTURES;
        if(folder) {
          await mkdir(folder,{recursive:true});
          await evaluate("new Promise(r=>setTimeout(r,250))");
          const shot=await command('Page.captureScreenshot',{format:'png'}) as {data:string};
          await writeFile(`${folder}/${role}-${theme}-${width}.png`,Buffer.from(shot.data,'base64'));
        }
      }
    }
  } finally {await close();}
});
