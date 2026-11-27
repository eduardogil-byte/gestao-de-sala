import assert from "node:assert/strict";
import test from "node:test";
import { chromePath, openAdminFixture } from "./helpers/browser.ts";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("indicadores acompanham semana e turno, mantêm capacidade desconhecida e calendário acessível", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture("adminIntegrations");
  const picker = "document.querySelector('[aria-label^=\"Selecionar período:\"]')";
  const summary = "document.querySelector('[aria-label=\"Indicadores gerais de ocupação\"]')";
  try {
    await evaluate("adminTest.reset('timeline')");
    await waitFor("document.body.innerText.includes('Ver mês')");
    await waitFor(`${summary}?.textContent.includes('8 hde 92 h')`);
    await evaluate("adminTest.click('Semana')");
    await waitFor(`${summary}?.textContent.includes('20%')`);
    const text = await evaluate<string>(`${summary}.textContent`);
    assert.ok(text.includes('4 hde 20 h'), text);
    assert.ok(text.includes('1de 5 dias de aula'), text);
    assert.equal(await evaluate(`${summary}.querySelectorAll('dt').length`), 3);
    assert.equal(await evaluate("document.querySelectorAll('[aria-label=\"Indicadores de ocupação do ambiente\"]').length"), 0);
    assert.equal(await evaluate(`${summary}.previousElementSibling.querySelector('[aria-controls=timeline-filters]') != null`), true);
    await evaluate("adminTest.select('Turno', '1')");
    await waitFor("adminTest.calls.some(c => c.path.includes('occupancy-indicators') && c.path.includes('from=2027-03-01') && c.path.includes('to=2027-03-06') && c.path.includes('shiftId=1'))");
    await waitFor(`${summary}?.textContent.includes('20%')`);
    for (const width of [375, 1440]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width === 375 });
      for (const theme of ['light', 'dark']) {
        await evaluate(`document.documentElement.dataset.theme='${theme}'`);
        const aligned = await evaluate<boolean>(`(() => {
          const button=document.querySelector('[aria-controls=timeline-filters]').getBoundingClientRect();
          const shift=[...document.querySelectorAll('label')].find(l=>l.querySelector('span')?.textContent==='Turno').querySelector('select').getBoundingClientRect();
          return button.left >= shift.right && Math.abs(button.top-shift.top)<3;
        })()`);
        assert.equal(aligned, true, `${width} ${theme}: turno e filtros devem ficar juntos`);
        assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
      }
    }
    await evaluate(`${picker}.focus()`);
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await waitFor("!!document.querySelector('[role=dialog]')");
    assert.equal(await evaluate("document.querySelectorAll('[role=dialog] button[aria-pressed=true]').length"), 7);
    await evaluate("document.querySelector('[role=dialog] button[aria-label^=\"02/03/2027,\"]').click()");
    await waitFor("!document.querySelector('[role=dialog]')");
    await evaluate(`${picker}.focus(); ${picker}.click()`);
    await waitFor("!!document.querySelector('[role=dialog]')");
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await waitFor("!document.querySelector('[role=dialog]')");
    assert.equal(await evaluate(`document.activeElement === ${picker}`), true);
    await evaluate(`adminTest.reset('timeline', 'Admin', {
      '/api/occupancy-indicators/semesters/1?from=2027-03-01&to=2027-03-31&roomId=10': {
        ...adminTest.report, from:'2027-03-01', to:'2027-03-31', rooms:[{...adminTest.report.rooms[0], daysWithOccupations:1, eligibleSlots:null, occupiedEligibleSlots:null, eligibleDays:null, occupiedEligibleDays:null}]
      }
    })`);
    await waitFor("document.body.innerText.includes('Total não definido')");
    assert.equal(await evaluate("document.querySelectorAll('[role=progressbar]').length"), 0);
    await evaluate("adminTest.reset('timeline', 'Professor')");
    await waitFor("document.body.innerText.includes('Ver mês')");
    assert.equal(await evaluate("adminTest.calls.some(c => c.path.includes('occupancy-indicators'))"), false);
  } finally { await close(); }
});

test("totais somam capacidades dos ambientes exibidos e respeitam o filtro de tipo", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, close } = await openAdminFixture("adminIntegrations");
  const summary = "document.querySelector('[aria-label=\"Indicadores gerais de ocupação\"]')";
  try {
    await evaluate(`adminTest.reset('timeline', 'Admin', {
      '/api/rooms': [{ id:10, name:'Laboratório sintético', kind:'Laboratorio' }, {id:11, name:'Sala B', kind:'Sala'}],
      '/api/occupancy-indicators/semesters/1?from=2027-03-01&to=2027-03-31': {
        ...adminTest.report, roomsWithUnknownCapacity:0, rooms:[
          {...adminTest.report.rooms[0], capacityHours:20, occupiedWithinCapacityHours:4, eligibleSlots:5, occupiedEligibleSlots:1},
          {...adminTest.report.rooms[0], roomId:11, roomName:'Sala B', kind:'Sala', capacityHours:40, occupiedWithinCapacityHours:20, eligibleSlots:10, occupiedEligibleSlots:5}
        ]
      }
    })`);
    await waitFor("document.body.innerText.includes('Ver mês')");
    await evaluate("adminTest.select('Ambiente', '')");
    await waitFor(`${summary}?.querySelector('dd')?.textContent === '40%'`);
    assert.equal(await evaluate(`${summary}.textContent.includes('24 hde 60 h')`), true);
    assert.equal(await evaluate(`${summary}.textContent.includes('6de 15 dias de aula')`), true);
    await evaluate("document.querySelector('[aria-controls=timeline-filters]').click(); adminTest.select('Tipo de ambiente','Sala')");
    await waitFor(`${summary}?.querySelector('dd')?.textContent === '50%'`);
    assert.equal(await evaluate(`${summary}.textContent.includes('20 hde 40 h')`), true);
    assert.equal(await evaluate(`${summary}.textContent.includes('5de 10 dias de aula')`), true);
  } finally { await close(); }
});

test("faixa contínua mantém detalhes e remanejamento individuais nos dois temas e tamanhos", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture("adminIntegrations");
  const screenshots = await mkdtemp(join(tmpdir(), "salagest-timeline-summary-"));
  const strip = "document.querySelector('[aria-label^=\"Sequência de\"]')";
  try {
    await evaluate(`adminTest.reset('timeline', 'Admin', { '/api/agenda': ['01','02','03'].map((day, index) => ({
      ...adminTest.occupation, id: 5 + index, actualClassGroupId: 1, date: '2027-03-' + day,
      startsAt: '2027-03-' + day + 'T08:00:00', endsAt: '2027-03-' + day + 'T12:00:00'
    })) })`);
    await waitFor("document.body.innerText.includes('Ver mês')");
    await evaluate("adminTest.click('Semana')");
    await waitFor(`!!${strip}`);
    assert.equal(await evaluate(`${strip}.closest('td').colSpan`), 3);
    assert.equal(await evaluate(`${strip}.querySelector('p').textContent`), "Docente 0 · Turma sintética");
    assert.equal(await evaluate(`${strip}.querySelectorAll('button').length`), 3);
    assert.equal(await evaluate(`${strip}.innerText.includes('08:00') || ${strip}.innerText.includes('01/03')`), false);
    assert.equal(await evaluate("document.body.innerText.includes('Ambientes exibidos e turno selecionado')"), false);
    for (const width of [1440, 375]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width === 375 });
      for (const theme of ["light", "dark"]) {
        await evaluate(`document.documentElement.dataset.theme='${theme}'; window.scrollTo(0,0)`);
        await new Promise(resolve => setTimeout(resolve, 300));
        assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
        const height = await evaluate<number>("document.documentElement.scrollHeight");
        const capture = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } }) as { data: string };
        await writeFile(join(screenshots, `${width}-${theme}.png`), Buffer.from(capture.data, "base64"));
      }
    }
    await evaluate("adminTest.click('Grade')");
    await evaluate(`${strip}.querySelectorAll('button')[1].focus()`);
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await waitFor("document.querySelector('[role=dialog]')?.textContent.includes('02/03/2027')");
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await waitFor("!document.querySelector('[role=dialog]')");
    await evaluate(`(() => {
      const strip=${strip}, cell=strip.closest('td'), rect=cell.getBoundingClientRect(), transfer=new DataTransfer();
      strip.querySelector('button').dispatchEvent(new DragEvent('dragstart', { bubbles:true, dataTransfer:transfer }));
      cell.dispatchEvent(new DragEvent('drop', { bubbles:true, cancelable:true, dataTransfer:transfer, clientX:rect.left + rect.width * .5 }));
    })()`);
    await waitFor("adminTest.calls.some(c => c.path === '/api/occupations/5/move-preview')");
    assert.deepEqual(await evaluate("adminTest.calls.find(c => c.path === '/api/occupations/5/move-preview').body"), { roomId: 10, date: "2027-03-02", shiftId: 1 });
    assert.equal(await evaluate("adminTest.calls.some(c => c.path.endsWith('/move'))"), false);
    console.log(`Capturas do cronograma: ${screenshots}`);
  } finally { await close(); }
});

test("seletor de semestre usa o mesmo campo dos filtros e cards pequenos omitem turno e horário", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture("adminIntegrations");
  const screenshots = await mkdtemp(join(tmpdir(), "salagest-semester-field-"));
  try {
    await evaluate("adminTest.reset('timeline')");
    await waitFor("!!document.querySelector('select[aria-label=\"Selecionar semestre\"]')");
    await waitFor("document.body.innerText.includes('Ver mês')");
    await evaluate("adminTest.select('Tipo de ambiente', 'Laboratorio')");
    await waitFor("document.querySelector('[aria-label=\"Filtros selecionados\"]')?.children.length === 2");
    assert.equal(await evaluate(`(() => {
      const chips=[...document.querySelector('[aria-label="Filtros selecionados"]').children];
      return chips.every(chip => chip.getBoundingClientRect().height === chips[0].getBoundingClientRect().height && chip.getBoundingClientRect().height >= 44);
    })()`), true);
    for (const width of [375, 1440]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width === 375 });
      for (const theme of ["light", "dark"]) {
        await evaluate(`document.documentElement.dataset.theme='${theme}'`);
        await new Promise(resolve => setTimeout(resolve, 300));
        assert.equal(await evaluate(`(() => {
          const semester = document.querySelector('select[aria-label="Selecionar semestre"]');
          const shift = [...document.querySelectorAll('label')].find(label => label.querySelector('span')?.textContent === 'Turno').querySelector('select');
          const a = getComputedStyle(semester), b = getComputedStyle(shift);
          return a.height === b.height && a.borderRadius === b.borderRadius && a.backgroundColor === b.backgroundColor && a.fontSize === b.fontSize;
        })()`), true);
        assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
        const capture = await command("Page.captureScreenshot", { format: "png" }) as { data: string };
        await writeFile(join(screenshots, `${width}-${theme}.png`), Buffer.from(capture.data, "base64"));
      }
    }
    await evaluate("const select=document.querySelector('select[aria-label=\"Selecionar semestre\"]'); select.value='2'; select.dispatchEvent(new Event('change', {bubbles:true}))");
    await waitFor("adminTest.calls.some(c => c.path.startsWith('/api/agenda?') && c.path.includes('semesterId=2'))");
    await evaluate("adminTest.reset('timeline')");
    await waitFor("document.querySelector('select[aria-label=\"Selecionar semestre\"]')?.value === '1'");
    await evaluate("adminTest.click('Semana')");
    await waitFor("!!document.querySelector('table button[aria-label^=\"Detalhes:\"]')");
    assert.equal(await evaluate("document.querySelector('table button[aria-label^=\"Detalhes:\"]').innerText.includes('08:00')"), false);
    await evaluate("document.querySelector('table button[aria-label^=\"Detalhes:\"]').click()");
    await waitFor("document.querySelector('[role=dialog]')?.innerText.includes('Detalhes da ocupação')");
    assert.equal(await evaluate("document.querySelector('[role=dialog]').innerText.includes('Manhã')"), true);
    assert.equal(await evaluate("document.querySelector('[role=dialog]').innerText.includes('08:00–12:00')"), true);
    console.log(`Capturas do filtro de semestre: ${screenshots}`);
  } finally { await close(); }
});

test("mês legível em ambos os temas, seleção por teclado, filtros preservados e escopo do Excel", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture("adminIntegrations");
  const selected = (label: string) => `[...document.querySelectorAll('label')].find(l => l.querySelector('span')?.textContent === '${label}').querySelector('select').value`;
  try {
    await evaluate("adminTest.reset('timeline')");
    await waitFor("document.body.innerText.includes('Ver mês')");
    await evaluate("adminTest.click('Mês')");
    await waitFor("!!document.querySelector('[aria-label=\"Calendário mensal\"]')");
    for (const width of [375, 812, 1440]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: width === 812 ? 375 : 900, deviceScaleFactor: 1, mobile: width < 1024 });
      for (const theme of ["light", "dark"]) {
        await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
        assert.equal(await evaluate("!!document.querySelector('input[type=date]')"), false);
        assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Hoje')"), false);
        assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
        assert.equal(await evaluate(`Array.from(document.querySelectorAll('[aria-label="Calendário mensal"] button')).every(b => b.scrollWidth <= b.clientWidth + 1)`), true);
        assert.equal(await evaluate(`document.querySelector('[aria-label="Legenda do cronograma"]').getClientRects().length > 0`), true);
      }
    }
    const day = "document.querySelector('[aria-label^=\"15/03/2027:\"]')";
    await evaluate(`${day}.focus()`);
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await waitFor("document.querySelector('#timeline-day-details')?.textContent.includes('15/03/2027')");
    assert.equal(await evaluate(`${day}.getAttribute('aria-pressed')`), "true");
    await evaluate("document.querySelector('[aria-label^=\"16/03/2027:\"]').click()");
    await waitFor("document.querySelector('#timeline-day-details')?.textContent.includes('Disponibilidade não confirmada')");
    await evaluate("document.querySelector('[aria-controls=timeline-filters]').click(); adminTest.select('Instrutor', 't0'); adminTest.select('Turno', '1')");
    await evaluate("document.querySelector('[aria-label^=\"Selecionar período:\"]').click()");
    await waitFor("document.querySelector('[role=dialog]')?.innerText.includes('Selecionar mês')");
    await evaluate("adminTest.click('março')");
    await waitFor(`${selected("Semestre")} === '1'`);
    assert.equal(await evaluate(selected("Instrutor")), "t0");
    await evaluate("document.querySelector('[aria-label^=\"Selecionar período:\"]').click()");
    await waitFor("document.querySelector('[role=dialog]')?.innerText.includes('Selecionar mês')");
    await evaluate("adminTest.click('abril')");
    await waitFor(`${selected("Semestre")} === ''`);
    assert.equal(await evaluate(selected("Instrutor")), "t0");
    assert.equal(await evaluate(selected("Ambiente")), "10");
    assert.equal(await evaluate(selected("Turno")), "1");
    assert.equal(await evaluate("document.body.innerText.includes('Os demais filtros foram mantidos')"), true);
    await evaluate("adminTest.click('Exportar')");
    await waitFor("!!document.querySelector('[role=dialog]')");
    const scope = await evaluate<string>("document.querySelector('[role=dialog]').innerText");
    for (const text of ["01/04/2027 a 30/04/2027", "Laboratório sintético", "Manhã", "não são aplicados ao arquivo"])
      assert.ok(scope.includes(text), text);
    await evaluate("adminTest.click('Cancelar')");
    assert.equal(await evaluate("adminTest.calls.some(c => c.path.startsWith('/api/exports/'))"), false);
    assert.equal(await evaluate("adminTest.calls.some(c => c.method !== 'GET')"), false);
    await evaluate("adminTest.reset('timeline', 'Professor')");
    await waitFor("document.body.innerText.includes('Ver mês')");
    assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Exportar')"), false);
  } finally { await close(); }
});

test("mês usa grade de ambientes com dias numéricos e finais de semana distintos", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture("adminIntegrations");
  const screenshots = await mkdtemp(join(tmpdir(), "salagest-month-grid-"));
  const grid = "document.querySelector('[aria-label=\"Grade mensal de Laboratório sintético\"]')";
  try {
    await evaluate("adminTest.reset('timeline')");
    await waitFor("document.body.innerText.includes('Ver mês')");
    await evaluate("adminTest.click('Mês')");
    await waitFor(`!!${grid}`);
    assert.deepEqual(await evaluate(`${grid}.querySelector('thead').innerText.trim().split(/\\s+/).slice(1)`), Array.from({length:31}, (_, index) => String(index + 1).padStart(2,'0')));
    assert.equal(await evaluate(`${grid}.querySelector('button[aria-label^="Detalhes:"]').innerText`), "Docente 0 · Turma sintética");
    for (const width of [375, 1440]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width === 375 });
      for (const theme of ['light','dark']) {
        await evaluate(`document.documentElement.dataset.theme='${theme}'; ${grid}.scrollIntoView({block:'center'})`);
        await new Promise(resolve => setTimeout(resolve, 300));
        assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
        assert.equal(await evaluate(`(() => {
          const headers=${grid}.querySelectorAll('thead th');
          return getComputedStyle(headers[6]).backgroundColor !== getComputedStyle(headers[5]).backgroundColor &&
            headers[6].getAttribute('aria-label').includes('fim de semana') && headers[7].getAttribute('aria-label').includes('fim de semana');
        })()`), true);
        const height = await evaluate<number>("document.documentElement.scrollHeight");
        const capture = await command("Page.captureScreenshot", {format:'png', captureBeyondViewport:true, clip:{x:0,y:0,width,height,scale:1}}) as {data:string};
        await writeFile(join(screenshots, `${width}-${theme}.png`), Buffer.from(capture.data,'base64'));
      }
    }
    await evaluate(`${grid}.querySelector('button[aria-label^="Detalhes:"]').click()`);
    await waitFor("document.querySelector('[role=dialog]')?.innerText.includes('Detalhes da ocupação')");
    assert.equal(await evaluate("document.querySelector('[role=dialog]').innerText.includes('08:00–12:00')"), true);
    await command("Input.dispatchKeyEvent", {type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await waitFor("!document.querySelector('[role=dialog]')");
    await evaluate(`(() => {
      const table=${grid}.querySelector('table'), transfer=new DataTransfer(), cell=table.querySelectorAll('tbody td')[1];
      table.querySelector('button[aria-label^="Detalhes:"]').dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));
      const rect=cell.getBoundingClientRect();
      cell.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:rect.left+rect.width/2}));
    })()`);
    await waitFor("adminTest.calls.some(c => c.path === '/api/occupations/5/move-preview')");
    assert.deepEqual(await evaluate("adminTest.calls.find(c => c.path === '/api/occupations/5/move-preview').body"), {roomId:10,date:'2027-03-02',shiftId:1});
    console.log(`Capturas da grade mensal: ${screenshots}`);
  } finally { await close(); }
});

test("indicadores não exibem resposta de outro período e recuperam falha sem inventar zero", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, close } = await openAdminFixture("adminIntegrations");
  const oldPath = "/api/occupancy-indicators/semesters/1?from=2027-03-07&to=2027-03-13&roomId=10";
  const nextPath = "/api/occupancy-indicators/semesters/1?from=2027-03-21&to=2027-03-27&roomId=10";
  try {
    await evaluate("adminTest.reset('timeline')");
    await waitFor("document.body.innerText.includes('Ver mês')");
    await evaluate("adminTest.click('Semana')");
    await waitFor("document.body.textContent.includes('20%')");
    await evaluate(`adminTest.deferred.push(${JSON.stringify(oldPath)}); document.querySelector('[aria-label="Próximo período"]').click()`);
    await waitFor(`adminTest.pending.some(p => p.path === ${JSON.stringify(oldPath)})`);
    await evaluate("document.querySelector('[aria-label=\"Próximo período\"]').click()");
    await waitFor("document.querySelector('[aria-label=\"Indicadores gerais de ocupação\"] dd')?.textContent === '20%'");
    await evaluate(`adminTest.reply(${JSON.stringify(oldPath)}, { ...adminTest.report, from:'2027-03-07', to:'2027-03-13', rooms:[{...adminTest.report.rooms[0],occupancyPercent:90}] })`);
    assert.equal(await evaluate("document.body.textContent.includes('90%')"), false);
    await evaluate(`adminTest.deferred.push(${JSON.stringify(nextPath)}); document.querySelector('[aria-label="Próximo período"]').click()`);
    await waitFor(`adminTest.pending.some(p => p.path === ${JSON.stringify(nextPath)})`);
    await evaluate(`adminTest.reply(${JSON.stringify(nextPath)}, {title:'Falha de teste'}, 500)`);
    await waitFor("document.body.innerText.includes('Recalcular indicadores')");
    assert.equal(await evaluate("document.querySelectorAll('[role=progressbar]').length"), 0);
    await evaluate("adminTest.deferred=[]; adminTest.click('Recalcular indicadores')");
    await waitFor("document.querySelector('[aria-label=\"Indicadores gerais de ocupação\"] dd')?.textContent === '0%'");
    assert.equal(await evaluate("document.body.innerText.includes('Recalcular indicadores')"), false);
  } finally { await close(); }
});

test("retornar ao cronograma restaura data, modo, filtros, dia selecionado e rolagem", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture("appShell");
  try {
    await command("Emulation.setDeviceMetricsOverride", { width: 1366, height: 600, deviceScaleFactor: 1, mobile: false });
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await evaluate("shellTest.reset('Admin', true)");
    await waitFor("!!document.querySelector('nav')");
    const navigate = (name: string) => `[...document.querySelectorAll('nav button')].find(b => b.textContent.includes('${name}')).click()`;
    await evaluate(navigate("Cronograma de Ambientes"));
    await waitFor("!!document.querySelector('table')");
    await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Mês').click()");
    await waitFor("!!document.querySelector('[aria-label=\"Calendário mensal\"]')");
    await evaluate("const select = [...document.querySelectorAll('label')].find(l => l.querySelector('span')?.textContent === 'Turno').querySelector('select'); select.value = '1'; select.dispatchEvent(new Event('change', { bubbles: true }))");
    await waitFor("!!document.querySelector('#timeline-day-details')");
    await evaluate("document.querySelectorAll('[aria-label=\"Calendário mensal\"] button:not(:disabled)')[3].click(); window.scrollTo(0, 260)");
    const date = await evaluate<string>("document.querySelector('[aria-label^=\"Selecionar período:\"]').textContent");
    const day = await evaluate<string>("document.querySelector('[aria-label=\"Calendário mensal\"] [aria-pressed=true]').getAttribute('aria-label')");
    const scroll = await evaluate<number>("window.scrollY");
    assert.ok(scroll > 0);
    await evaluate("[...document.querySelectorAll('main button')].find(b => b.textContent.trim() === 'Reservas').click()");
    await waitFor("!document.querySelector('[aria-label=\"Calendário mensal\"]')");
    await evaluate(navigate("Cronograma de Ambientes"));
    await waitFor("!!document.querySelector('[aria-label=\"Calendário mensal\"]')");
    await waitFor(`Math.abs(window.scrollY - ${scroll}) < 2`);
    assert.equal(await evaluate("document.querySelector('[aria-label^=\"Selecionar período:\"]').textContent"), date);
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Calendário mensal\"] [aria-pressed=true]').getAttribute('aria-label')"), day);
    assert.equal(await evaluate("[...document.querySelectorAll('label')].find(l => l.querySelector('span')?.textContent === 'Turno').querySelector('select').value"), "1");
  } finally { await close(); }
});
