import assert from "node:assert/strict";
import test from "node:test";
import { chromePath, openAdminFixture } from "./helpers/browser.ts";

test("linha e cartão abrem informações, com teclado e edição independente", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture();
  try {
    await evaluate("adminTest.reset('rooms')");
    await waitFor("document.body.innerText.includes('Novo ambiente')");
    for (const width of [1366, 360]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 850, deviceScaleFactor: 1, mobile: width === 360 });
      await evaluate(width === 1366 ? "document.querySelector('table tbody tr td:nth-child(2)').click()" : "document.querySelector('article dl').click()");
      await waitFor("adminTest.pending.some(item => item.path === '/api/rooms/10/inventory')");
      await evaluate("adminTest.reply('/api/rooms/10/inventory', { computerGroups: [], resources: [] })");
      await waitFor("!!document.querySelector('[role=dialog]')");
      assert.equal(await evaluate("document.querySelector('[role=dialog]').innerText.includes('Ficha técnica cadastrada')"), true);
      await evaluate("document.querySelector('[role=dialog] button[aria-label=Fechar]').click()");
      await waitFor("!document.querySelector('[role=dialog]')");
    }
    await evaluate("(async () => { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); [...document.querySelectorAll('button[aria-label^=\"Abrir informações\"]')].find(item => item.getClientRects().length).focus(); })()");
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await waitFor("adminTest.pending.some(item => item.path === '/api/rooms/10/inventory')");
    await evaluate("adminTest.reply('/api/rooms/10/inventory', { computerGroups: [], resources: [] })");
    await waitFor("!!document.querySelector('[role=dialog]')");
    await evaluate("document.querySelector('[role=dialog] button[aria-label=Fechar]').click()");
    await waitFor("!document.querySelector('[role=dialog]')");
    await evaluate("[...document.querySelectorAll('article button')].find(item => item.textContent.trim() === 'Editar').click()");
    await waitFor("adminTest.pending.some(item => item.path === '/api/rooms/10/inventory')");
    await evaluate("adminTest.reply('/api/rooms/10/inventory', { computerGroups: [], resources: [] })");
    await waitFor("document.querySelector('[role=dialog]')?.innerText.includes('Editar ambiente')");
    assert.equal(await evaluate("[...document.querySelectorAll('button')].some(item => item.textContent.trim() === 'Informações')"), false);
  } finally { await close(); }
});

test("dropdown dos ambientes preserva filtros e cabe nos dois temas e tamanhos", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture();
  try {
    await evaluate("adminTest.reset('rooms')");
    await waitFor("document.body.innerText.includes('Novo ambiente')");
    await evaluate("adminTest.click('Filtros')");
    await waitFor("!!document.querySelector('#room-filters-panel')");
    await evaluate("adminTest.select('Tipo de ambiente', 'Comum')");
    await waitFor("!document.querySelector('main')?.innerText.includes('Laboratório sintético') && document.body.innerText.includes('1 de 2 ambientes exibidos')");
    await evaluate("adminTest.select('Situação', 'active')");
    await waitFor("document.body.innerText.includes('Nenhum ambiente encontrado')");
    for (const theme of ['light', 'dark']) for (const width of [360, 1366]) {
      await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
      await command('Emulation.setDeviceMetricsOverride', { width, height: 850, deviceScaleFactor: 1, mobile: width === 360 });
      assert.equal(await evaluate("(() => { const rect = document.querySelector('#room-filters-panel').getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth + 1; })()"), true);
    }
    await evaluate("adminTest.click('Limpar filtros')");
    await waitFor("document.body.innerText.includes('2 de 2 ambientes exibidos')");
    await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))");
    await waitFor("!document.querySelector('#room-filters-panel')");
    assert.equal(await evaluate("document.activeElement.getAttribute('aria-controls')"), 'room-filters-panel');
  } finally { await close(); }
});

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
