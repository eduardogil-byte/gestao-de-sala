import assert from "node:assert/strict";
import test from "node:test";
import { chromePath, openAdminFixture } from "./helpers/browser.ts";

test("ambientes mostram filtros, ficha persistida e turnos sem presumir disponibilidade", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture();
  try {
    await evaluate("adminTest.reset('rooms')");
    await waitFor("document.body.innerText.includes('Sala inativa')");
    assert.equal(await evaluate("document.querySelectorAll('table tbody tr').length"), 2);
    assert.equal(await evaluate("document.body.innerText.includes('2 de 2 ambientes exibidos')"), true);

    await evaluate("adminTest.select('Situação', 'inactive')");
    await waitFor("document.body.innerText.includes('1 de 2 ambientes exibidos')");
    assert.equal(await evaluate("document.querySelectorAll('table tbody tr').length"), 1);
    await evaluate("adminTest.select('Situação', '')");
    await evaluate("adminTest.input('Buscar ambiente', 'LAB-10')");
    await waitFor("document.body.innerText.includes('1 de 2 ambientes exibidos')");
    assert.equal(await evaluate("document.querySelector('table tbody')?.innerText.includes('Sala inativa')"), false);
    await evaluate("adminTest.input('Buscar ambiente', '')");

    await evaluate(`adminTest.catalog['/api/occupancy-indicators/semesters/1'] = {
      semesterId: 1, physicalOccupiedHours: 4, capacityHours: null, availableHours: null, occupancyPercent: null,
      roomsWithUnknownCapacity: 1, conflictPairs: 0, thresholds: { bottleneckPercent: 85, opportunityPercent: 40 },
      months: [], warnings: [], rooms: [{ roomId: 10, roomName: 'Laboratório sintético', kind: 'Laboratorio',
        physicalOccupiedHours: 4, capacityHours: null, availableHours: null, occupancyPercent: null,
        classification: 'Unknown', warnings: [], shifts: [{ shiftId: 1, shiftName: 'Manhã', occupiedHours: 4,
          capacityHours: null, availableHours: null, warnings: ['Turno não configurado para este ambiente'] }] }] };
      adminTest.select('Semestre dos turnos', '1')`);
    await waitFor("document.querySelector('table tbody tr td:nth-child(4)')?.innerText.includes('Nenhum turno configurado')");
    assert.equal(await evaluate("document.querySelector('table tbody tr td:nth-child(4)')?.innerText.includes('Manhã')"), false);
    assert.equal(await evaluate("document.querySelector('table tbody tr td:nth-child(5)')?.innerText.includes('Manhã')"), true);
    await evaluate("adminTest.catalog['/api/semesters/1/rooms/10/operating-shifts'] = null; adminTest.select('Semestre dos turnos', '2')");
    await waitFor("adminTest.calls.some(c => c.path === '/api/semesters/2/rooms/10/operating-shifts')");
    await evaluate("adminTest.select('Semestre dos turnos', '1')");
    await waitFor("document.querySelector('table tbody tr td:nth-child(4)')?.innerText.includes('Não informado')");
    await evaluate("adminTest.catalog['/api/semesters/1/rooms/10/operating-shifts'] = [{ shiftId: 1, weekdaysMask: 62 }]; adminTest.select('Semestre dos turnos', '2')");
    await waitFor("adminTest.calls.filter(c => c.path === '/api/semesters/2/rooms/10/operating-shifts').length >= 2");
    await evaluate("adminTest.select('Semestre dos turnos', '1')");
    await waitFor("document.querySelector('table tbody tr td:nth-child(4)')?.innerText.includes('Manhã')");
    await evaluate("adminTest.click('Configurar turnos')");
    await waitFor("document.querySelector('[role=dialog]')?.innerText.includes('Salvar turnos oferecidos')");
    assert.equal(await evaluate("document.querySelector('[role=dialog]')?.innerText.includes('Semestre A')"), true);
    await evaluate("document.querySelector('[role=dialog] button[aria-label=Fechar]')?.click()");
    await waitFor("!document.querySelector('[role=dialog]')");

    await evaluate("adminTest.click('Ver ficha e inventário')");
    await waitFor("adminTest.pending.some(r => r.path === '/api/rooms/10/inventory')");
    await evaluate(`adminTest.reply('/api/rooms/10/inventory', { computerGroups: [{ id: 7, description: 'Grupo técnico',
      quantity: 10, operationalQuantity: null, ramGb: 16, software: [{ softwareId: 1, name: 'CAD',
      installedQuantity: 10, licenseQuantity: null, licenseExpiresOn: null }] }], resources: [{ id: 4,
      name: 'Torno', type: 'Máquina', quantity: 2, operationalQuantity: 1, technicalDetails: '220 V' }] })`);
    await waitFor("document.querySelector('[role=dialog]')?.innerText.includes('Grupo técnico')");
    const detail = await evaluate<string>("document.querySelector('[role=dialog]')?.innerText ?? ''");
    assert.match(detail, /Operacionais não informados/);
    assert.match(detail, /Licenças: Não informadas/);
    assert.match(detail, /Validade: Não informado/);
    assert.match(detail, /Torno/);
    await evaluate("document.querySelector('[role=dialog] button[aria-label=Fechar]')?.click()");
    await evaluate("adminTest.click('Ver ficha e inventário')");
    await waitFor("adminTest.pending.some(r => r.path === '/api/rooms/10/inventory')");
    await evaluate(`adminTest.reply('/api/rooms/10/inventory', { computerGroups: [{ id: 7, description: 'Grupo completo',
      quantity: 10, operationalQuantity: 8, ramGb: 16, tier: 'Alto', dedicatedGpu: true,
      processor: 'CPU verificada', storage: 'SSD', graphicsCard: 'GPU verificada', operatingSystem: 'SO verificado',
      virtualization: true, dockerWsl: false, cadCompatible: true, simulatorCompatible: false,
      internetAvailable: true, networkDetails: 'Rede restrita', software: [{ softwareId: 1, name: 'CAD',
      installedQuantity: 8, version: '2027', licenseQuantity: 8, licenseExpiresOn: '2027-12-31' }] }],
      resources: [{ id: 4, name: 'Torno', type: 'Máquina', quantity: 2, operationalQuantity: 1,
        description: 'Recurso específico', technicalDetails: '220 V' }] })`);
    await waitFor("document.querySelector('[role=dialog]')?.innerText.includes('Grupo completo')");
    const complete = await evaluate<string>("document.querySelector('[role=dialog]')?.innerText ?? ''");
    for (const value of ["CPU verificada", "16 GB", "SSD", "GPU verificada", "SO verificado", "Virtualização", "Docker / WSL",
      "Suporte a CAD", "Suporte a simuladores", "Rede restrita", "2027", "8 instalações", "Licenças: 8", "Recurso específico"])
      assert.equal(complete.includes(value), true, value);
    await evaluate("document.querySelector('[role=dialog] button[aria-label=Fechar]')?.click()");
    for (const width of [768, 390]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 850, deviceScaleFactor: 1, mobile: width < 500 });
      assert.equal(await evaluate("getComputedStyle(document.querySelector('table').parentElement).display === 'none'"), true);
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    }
    await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    assert.equal(await evaluate("getComputedStyle(document.querySelector('table').parentElement).display === 'block'"), true);
    await evaluate("adminTest.click('Importar ambientes')");
    await waitFor("document.body.innerText.includes('Prévia não altera') || document.body.innerText.includes('A prévia não altera')");
    assert.equal(await evaluate("adminTest.importedKind"), "Ambientes");
    assert.equal(await evaluate("document.querySelector('select')?.value"), "Ambientes");
    await evaluate("adminTest.reset('rooms')");
    await waitFor("document.body.innerText.includes('Importar recursos')");
    await evaluate("adminTest.click('Importar recursos')");
    assert.equal(await evaluate("adminTest.importedKind"), "Recursos");
    await waitFor("document.querySelector('select')?.value === 'Recursos'");
    await evaluate("adminTest.reset('rooms', 'Professor')");
    await waitFor("document.body.innerText.includes('Sala inativa')");
    assert.equal(await evaluate("document.body.innerText.includes('Consulta restrita ao Admin')"), true);
    assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b => /^(Editar ambiente|Configurar turnos|Importar ambientes|Importar recursos)$/.test(b.textContent?.trim() || ''))"), false);
    assert.equal(await evaluate("adminTest.calls.some(c => c.path.includes('occupancy-indicators') || c.path.includes('operating-shifts'))"), false);
  } finally { await close(); }
});
