import assert from "node:assert/strict";
import test from "node:test";
import { chromePath, openAdminFixture } from "./helpers/browser.ts";

test("Admin gerencia catálogo e associa recurso ao ambiente sem campos fixos", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, close } = await openAdminFixture();
  try {
    await evaluate("adminTest.reset('rooms')");
    await waitFor("document.body.textContent.includes('Catálogo de recursos')");
    await evaluate("adminTest.input('Nome', 'Projetor'); adminTest.input('Categoria', 'Audiovisual'); adminTest.input('Descrição', 'Projeção'); adminTest.click('Adicionar recurso')");
    await waitFor("adminTest.pending.some(r => r.path === '/api/resource-catalog')");
    assert.deepEqual(await evaluate("adminTest.pending.find(r => r.path === '/api/resource-catalog').body"),
      { name: "Projetor", category: "Audiovisual", description: "Projeção", active: true });
    await evaluate(`adminTest.catalog['/api/resource-catalog'] = [{ id: 5, name: 'Projetor', category: 'Audiovisual', description: 'Projeção', active: true }];
      adminTest.reply('/api/resource-catalog', { id: 5, name: 'Projetor', category: 'Audiovisual', description: 'Projeção', active: true }, 201)`);
    await waitFor("document.body.textContent.includes('Desativar Projetor')");

    await evaluate("adminTest.click('Novo ambiente')");
    await waitFor("!!document.querySelector('[role=dialog]')");
    await evaluate("adminTest.input('Nome da sala', 'Sala nova'); adminTest.select('Adicionar recurso do catálogo', '5')");
    await waitFor("document.querySelector('[role=dialog]')?.textContent.includes('Projetor · Audiovisual')");
    await evaluate("adminTest.input('Quantidade cadastrada', '2'); adminTest.input('Quantidade operacional (opcional)', '1'); adminTest.click('Cadastrar sala')");
    await waitFor("adminTest.pending.some(r => r.path === '/api/rooms')");
    const body = await evaluate<any>("adminTest.pending.find(r => r.path === '/api/rooms').body");
    assert.equal(body.inventory.resources[0].details.resourceCatalogItemId, 5);
    assert.equal(body.inventory.resources[0].details.quantity, 2);
    assert.equal(body.inventory.resources[0].details.operationalQuantity, 1);
    assert.equal(body.active, true);
    await evaluate("adminTest.reply('/api/rooms', { id: 20, name: 'Sala nova' }, 201)");
    await waitFor("!document.querySelector('[role=dialog]')");

    await evaluate("adminTest.click('Desativar Projetor')");
    await waitFor("!!document.querySelector('[role=dialog]')");
    await evaluate("adminTest.click('Desativar')");
    await waitFor("adminTest.pending.some(r => r.path === '/api/resource-catalog/5')");
    assert.equal(await evaluate("adminTest.pending.find(r => r.path === '/api/resource-catalog/5').body.active"), false);
    await evaluate(`adminTest.catalog['/api/resource-catalog'] = [{ id: 5, name: 'Projetor', category: 'Audiovisual', description: 'Projeção', active: false }];
      adminTest.reply('/api/resource-catalog/5', null, 204)`);
    await waitFor("document.body.textContent.includes('Reativar Projetor')");
  } finally { await close(); }
});

test("Instrutor consulta ambientes sem controles do catálogo", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, close } = await openAdminFixture();
  try {
    await evaluate("adminTest.reset('rooms', 'Professor')");
    await waitFor("document.body.textContent.includes('Laboratório sintético')");
    assert.equal(await evaluate("document.body.textContent.includes('Catálogo de recursos')"), false);
    assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b => b.textContent?.includes('Novo ambiente'))"), false);
  } finally { await close(); }
});
