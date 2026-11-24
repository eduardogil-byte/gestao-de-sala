import assert from "node:assert/strict";
import test from "node:test";
import { chromePath, openAdminFixture } from "./helpers/browser.ts";

test("grupos usam opções rápidas sem confirmar disponibilidade ou licenças automaticamente", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, close } = await openAdminFixture();
  try {
    await evaluate("adminTest.reset('rooms')");
    await waitFor("document.body.innerText.includes('Novo ambiente')");
    await evaluate("adminTest.click('Novo ambiente')");
    await waitFor("!!document.querySelector('[role=dialog]')");
    await evaluate("[...document.querySelectorAll('[role=dialog] details')].find(item => item.querySelector('summary')?.textContent === 'Computadores e softwares').open = true; adminTest.click('Adicionar grupo')");
    await waitFor("!![...document.querySelectorAll('label span')].find(item => item.textContent === 'Nome do grupo')");
    const value = (label: string) => evaluate<string>(`[...document.querySelectorAll('label')].find(item => item.querySelector('span')?.textContent === ${JSON.stringify(label)}).querySelector('input,select').value`);
    assert.equal(await value('Nome do grupo'), 'Grupo 1');
    assert.equal(await value('Computadores operacionais'), 'all');
    assert.equal(await value('Sistema operacional'), 'Windows 11');
    assert.equal(await value('RAM'), '8');
    assert.equal(await value('Armazenamento'), '256 GB');
    assert.equal(await value('Placa de vídeo'), 'integrated');
    await evaluate("adminTest.input('Computadores cadastrados', '20'); adminTest.select('Computadores operacionais', 'all')");
    assert.equal(await value('Computadores operacionais'), 'all');
    await evaluate("adminTest.select('RAM', '16'); adminTest.select('Armazenamento', '1 TB')");
    assert.equal(await value('RAM'), '16');
    assert.equal(await value('Armazenamento'), '1 TB');
    await evaluate("adminTest.select('Adicionar software instalado', '1')");
    await waitFor("document.body.innerText.includes('Instalação de CAD')");
    await evaluate("adminTest.select('Instalação de CAD', 'all')");
    assert.equal(await value('Licenças (opcional)'), '');
    await evaluate("adminTest.click('Duplicar configuração')");
    await waitFor("[...document.querySelectorAll('input')].some(item => item.value === 'Grupo 2')");
    const modes = await evaluate<string[]>("[...document.querySelectorAll('label')].filter(item => item.querySelector('span')?.textContent === 'Computadores operacionais').map(item => item.querySelector('select').value)");
    assert.deepEqual(modes, ['all', 'unknown']);
    assert.equal(await evaluate("[...document.querySelectorAll('details')].filter(item => item.querySelector('summary')?.textContent === 'Detalhes técnicos').every(item => !item.open)"), true);
  } finally { await close(); }
});

test("calendário salva e edita ocorrências usando o semestre selecionado", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture("adminIntegrations");
  try {
    await evaluate("adminTest.reset('academic')");
    await waitFor("document.body.innerText.includes('Turmas e semestres')");
    await waitFor("!!document.querySelector('details select option[value=\"1\"]')");
    await evaluate("adminTest.catalog['/api/semesters/1/calendar'] = {events: []}; document.querySelector('details').open = true; const select = document.querySelector('details select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, '1'); select.dispatchEvent(new Event('change', {bubbles: true}))");
    await waitFor("document.body.innerText.includes('Nenhuma ocorrência cadastrada')");
    await evaluate("adminTest.input('Início da ocorrência', '2027-03-10'); adminTest.input('Fim da ocorrência', '2027-03-11'); adminTest.input('Descrição da ocorrência', 'Recesso escolar')");
    await evaluate("adminTest.click('Salvar ocorrência')");
    await waitFor("adminTest.pending.some(item => item.path === '/api/semesters/1/calendar/events')");
    await evaluate("adminTest.reply('/api/semesters/1/calendar/events', {id: 7, startDate: '2027-03-10', endDate: '2027-03-11', kind: 'Holiday', description: 'Recesso escolar'}, 201)");
    await waitFor("document.body.innerText.includes('Calendário atualizado')");
    await evaluate("adminTest.click('Editar')");
    await evaluate("adminTest.input('Descrição da ocorrência', 'Feriado escolar'); adminTest.click('Salvar ocorrência')");
    await waitFor("adminTest.pending.some(item => item.path === '/api/semesters/1/calendar/events/7')");
    await evaluate("adminTest.reply('/api/semesters/1/calendar/events/7', null, 204)");
    await waitFor("document.body.innerText.includes('Feriado escolar')");
    for (const theme of ["light", "dark"]) for (const width of [360, 1366]) {
      await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
      await command("Emulation.setDeviceMetricsOverride", { width, height: 850, deviceScaleFactor: 1, mobile: width === 360 });
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
    }
  } finally { await close(); }
});

test("modal adiciona recurso compartilhado e mantém detalhes técnicos recolhidos", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture();
  try {
    await evaluate("adminTest.reset('rooms')");
    await waitFor("document.body.innerText.includes('Novo ambiente')");
    await evaluate("adminTest.click('Novo ambiente')");
    await waitFor("!!document.querySelector('[role=dialog]')");
    assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] label')].some(item => item.textContent.includes('Carteiras'))"), false);
    assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] details')].find(item => item.querySelector('summary').textContent.includes('Computadores e softwares')).open"), false);
    await evaluate("adminTest.click('Novo recurso')");
    await evaluate("adminTest.click('Salvar e adicionar ao ambiente')");
    assert.equal(await evaluate("adminTest.pending.some(item => item.path === '/api/resource-catalog')"), false);
    await evaluate("adminTest.input('Nome do recurso', 'Projetor'); adminTest.input('Categoria do recurso', 'Audiovisual')");
    await evaluate("adminTest.click('Salvar e adicionar ao ambiente')");
    await waitFor("adminTest.pending.some(item => item.path === '/api/resource-catalog')");
    await evaluate("adminTest.reply('/api/resource-catalog', {id: 99, name: 'Projetor', category: 'Audiovisual', description: null, active: true}, 201)");
    await waitFor("[...document.querySelectorAll('[role=dialog] legend')].some(item => item.textContent.includes('Projetor'))");
    await evaluate("adminTest.click('Novo recurso')");
    await evaluate("adminTest.input('Nome do recurso', 'projetor'); adminTest.input('Categoria do recurso', 'Audiovisual'); adminTest.click('Salvar e adicionar ao ambiente')");
    await waitFor("document.body.innerText.includes('Este recurso já existe')");
    for (const theme of ["light", "dark"]) for (const width of [360, 1366]) {
      await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
      await command("Emulation.setDeviceMetricsOverride", { width, height: 850, deviceScaleFactor: 1, mobile: width === 360 });
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
    }
  } finally { await close(); }
});
