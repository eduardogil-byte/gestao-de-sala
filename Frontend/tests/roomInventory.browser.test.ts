import assert from "node:assert/strict";
import test from "node:test";
import { chromePath, openAdminFixture } from "./helpers/browser.ts";

const inventory = {
  computerGroups: [{ id: 7, description: "Grupo existente", quantity: 10, operationalQuantity: 8, ramGb: 16, tier: "Alto",
    dedicatedGpu: true, processor: "CPU persistida", storage: "SSD", graphicsCard: "GPU", operatingSystem: "SO",
    virtualization: true, dockerWsl: false, cadCompatible: true, simulatorCompatible: null, networkDetails: "Rede persistida", internetAvailable: true,
    software: [{ softwareId: 1, name: "CAD", installedQuantity: 10, version: "2027", licenseQuantity: 9, licenseExpiresOn: "2027-12-31" }] }],
  resources: [{ id: 4, name: "Torno", type: "Máquina", quantity: 2, operationalQuantity: 1, description: "Descrição persistida",
    condition: "Boa", technicalDetails: "Dados persistidos", voltage: 220, warrantyExpiresOn: "2028-01-01", licenseExpiresOn: null }],
};

test("ambientes carregam inventário completo e enviam IDs e remoções explícitas", { skip: !chromePath, timeout: 60000 }, async (t) => {
  const { evaluate, waitFor, close } = await openAdminFixture();
  const reply = (path: string, data: unknown, status = 200) => evaluate(`adminTest.reply(${JSON.stringify(path)}, ${JSON.stringify(data)}, ${status})`);
  const open = async () => {
    await evaluate("adminTest.click('Editar ambiente')");
    await waitFor("adminTest.pending.some(r => r.path === '/api/rooms/10/inventory')");
    assert.equal(await evaluate("!!document.querySelector('[role=dialog]')"), false);
    await reply('/api/rooms/10/inventory', inventory);
    await waitFor("!!document.querySelector('[role=dialog]')");
  };
  try {
    await evaluate("adminTest.reset('rooms')");
    await waitFor("document.body.innerText.includes('Laboratório sintético')");
    await t.test("reabre metadados completos, renomeia pelo ID e preserva licenças e equipamentos", async () => {
      await open();
      assert.equal(await evaluate("[...document.querySelectorAll('input')].some(i => i.value === 'CPU persistida')"), true);
      assert.equal(await evaluate("[...document.querySelectorAll('input')].some(i => i.value === '2027-12-31')"), true);
      await evaluate("adminTest.input('Descrição do grupo', 'Grupo renomeado'); adminTest.input('Computadores operacionais (opcional)', '7')");
      await evaluate("adminTest.click('Salvar alterações')");
      await waitFor("adminTest.pending.some(r => r.path === '/api/rooms/10')");
      const body = await evaluate<any>("adminTest.pending.find(r => r.path === '/api/rooms/10').body");
      assert.deepEqual(body.computerGroups, []);
      const group = body.inventory.computerGroups[0];
      assert.equal(group.id, 7); assert.equal(group.details.description, "Grupo renomeado");
      assert.equal(group.details.operationalQuantity, 7); assert.equal(group.details.dockerWsl, false);
      assert.equal(group.details.networkDetails, "Rede persistida");
      assert.equal(group.software[0].licenseQuantity, 9); assert.equal(group.software[0].licenseExpiresOn, "2027-12-31");
      assert.equal(body.inventory.resources[0].id, 4); assert.equal(body.inventory.resources[0].details.voltage, 220);
      assert.deepEqual(body.inventory.removedGroupIds, []);
      await reply('/api/rooms/10', null, 204);
      await waitFor("!document.querySelector('[role=dialog]')");
    });
    await t.test("remoção exige confirmação e envia IDs específicos", async () => {
      await open();
      await evaluate("adminTest.click('Remover software CAD')");
      await waitFor("document.querySelectorAll('[role=dialog]').length === 2");
      await evaluate("adminTest.click('Remover software')");
      await waitFor("!document.body.innerText.includes('Remover software CAD')");
      await evaluate("adminTest.click('Salvar alterações')");
      await waitFor("adminTest.pending.some(r => r.path === '/api/rooms/10')");
      assert.deepEqual(await evaluate("adminTest.pending.find(r => r.path === '/api/rooms/10').body.inventory.computerGroups[0].removedSoftwareIds"), [1]);
      await reply('/api/rooms/10', null, 204);
      await waitFor("!document.querySelector('[role=dialog]')");
      await open();
      await evaluate("adminTest.click('Remover grupo 1')");
      await waitFor("document.querySelectorAll('[role=dialog]').length === 2");
      await evaluate("adminTest.click('Remover grupo')");
      await waitFor("!document.body.innerText.includes('Grupo 1 · ID 7')");
      await evaluate("adminTest.click('Salvar alterações')");
      await waitFor("adminTest.pending.some(r => r.path === '/api/rooms/10')");
      assert.deepEqual(await evaluate("adminTest.pending.find(r => r.path === '/api/rooms/10').body.inventory.removedGroupIds"), [7]);
      assert.deepEqual(await evaluate("adminTest.pending.find(r => r.path === '/api/rooms/10').body.inventory.computerGroups"), []);
      await reply('/api/rooms/10', null, 204);
    });
  } finally { await close(); }
});
