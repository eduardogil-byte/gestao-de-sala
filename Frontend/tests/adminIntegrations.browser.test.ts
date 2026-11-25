import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromePath, openAdminFixture } from "./helpers/browser.ts";

test("integrações administrativas usam contratos existentes e preservam estado", { skip: !chromePath, timeout: 120000 }, async (t) => {
  const { evaluate, waitFor, command, close } = await openAdminFixture("adminIntegrations");
  const requirement = "/api/courses/1/modules/2/curricular-units/3/capabilities/4/environment-requirements";
  const operating = "/api/semesters/1/rooms/10/operating-shifts";
  const reportPath = "/api/occupancy-indicators/semesters/1?roomId=10";
  const comparePath = "/api/occupancy-indicators/compare?firstSemesterId=1&secondSemesterId=2&roomId=10";
  const reply = (path: string, data: unknown, status = 200) => evaluate(`adminTest.reply(${JSON.stringify(path)}, ${JSON.stringify(data)}, ${status})`);
  const reset = async (mode: string, role = "Admin") => {
    await evaluate(`adminTest.reset(${JSON.stringify(mode)}, ${JSON.stringify(role)})`);
    await waitFor("!document.body.innerText.includes('Carregando dados...')");
    if (mode === "teachers") {
      await waitFor("!!document.querySelector('button[aria-label^=\"Abrir perfil de\"]')");
      await evaluate("document.querySelector('button[aria-label^=\"Abrir perfil de\"]').click()");
    }
  };
  const screenshotDir = await mkdtemp(join(tmpdir(), "salagest-etapa5b-"));
  const capture = async (name: string) => {
    const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(join(screenshotDir, `${name}.png`), Buffer.from(screenshot.data, "base64"));
  };
  try {
    await t.test("turnos e indicadores: atualizar preserva filtros, comparação e oferta não enviada", async () => {
      await waitFor("document.body.textContent.includes('Pendências gerenciais')");
      await capture("dashboard-desktop");
      await evaluate("adminTest.select('Ambiente', '10'); adminTest.select('Comparar com outro semestre', '2')");
      await waitFor(`adminTest.calls.some(r => r.path === ${JSON.stringify(comparePath)})`);
      await evaluate("adminTest.click('Configurar turnos oferecidos')");
      await waitFor(`adminTest.pending.some(r => r.path === ${JSON.stringify(operating)})`);
      await reply(operating, [{ shiftId: 1, weekdaysMask: 2 }]);
      await waitFor("document.querySelector('[role=dialog]')?.innerText.includes('Quarta')");
      await evaluate("[...document.querySelectorAll('[role=dialog] label')].find(l => l.textContent.trim() === 'Quarta').querySelector('input').click()");
      const before = await evaluate<number>(`adminTest.calls.filter(r => r.path === ${JSON.stringify(reportPath)}).length`);
      const compareBefore = await evaluate<number>(`adminTest.calls.filter(r => r.path === ${JSON.stringify(comparePath)}).length`);
      await evaluate(`adminTest.catalog[${JSON.stringify(reportPath)}].physicalOccupiedHours = 8;
        adminTest.catalog['/api/rooms'][0].computerGroups = [{quantity: 10, operationalQuantity: null}]; adminTest.click('Atualizar dados')`);
      await waitFor(`adminTest.calls.filter(r => r.path === ${JSON.stringify(reportPath)}).length > ${before}`);
      await waitFor(`adminTest.calls.filter(r => r.path === ${JSON.stringify(comparePath)}).length > ${compareBefore}`);
      assert.equal(await evaluate("document.body.innerText.includes('Quantidade operacional de computadores não informada em: Laboratório sintético')"), false);
      assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] label')].find(l => l.textContent.trim() === 'Quarta').querySelector('input').checked"), true);
      assert.equal(await evaluate("[...document.querySelectorAll('label')].find(l => l.querySelector('span')?.textContent === 'Ambiente').querySelector('select').value"), "10");
      assert.equal(await evaluate("[...document.querySelectorAll('label')].find(l => l.querySelector('span')?.textContent === 'Comparar com outro semestre').querySelector('select').value"), "2");
      await evaluate("adminTest.click('Salvar turnos oferecidos')");
      await waitFor("document.querySelectorAll('[role=dialog]').length === 2");
      await evaluate("adminTest.click('Confirmar turnos')");
      await waitFor(`adminTest.pending.some(r => r.path === ${JSON.stringify(operating)})`);
      assert.deepEqual(await evaluate(`adminTest.pending.find(r => r.path === ${JSON.stringify(operating)}).body`), [{ shiftId: 1, weekdaysMask: 10 }]);
      await reply(operating, null, 204);
      await waitFor("document.body.innerText.includes('Turnos oferecidos salvos')");
      await waitFor("document.body.innerText.includes('Indeterminado')");
      await capture("turnos-desktop");
      const beforeFailure = await evaluate<number>(`adminTest.calls.filter(r => r.path === ${JSON.stringify(reportPath)}).length`);
      await evaluate("adminTest.deferred.push('/api/software'); adminTest.click('Atualizar dados')");
      await waitFor("adminTest.pending.some(r => r.path === '/api/software')");
      await reply('/api/software', { error: "Falha sintética no catálogo" }, 500);
      await waitFor(`adminTest.calls.filter(r => r.path === ${JSON.stringify(reportPath)}).length > ${beforeFailure}`);
      assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] label')].find(l => l.textContent.trim() === 'Quarta').querySelector('input').checked"), true);
      await evaluate("adminTest.click('Salvar turnos oferecidos')");
      await waitFor("document.querySelectorAll('[role=dialog]').length === 2");
      await evaluate("adminTest.click('Confirmar turnos')");
      await waitFor(`adminTest.pending.some(r => r.path === ${JSON.stringify(operating)})`);
      const beforeClose = await evaluate<number>(`adminTest.calls.filter(r => r.path === ${JSON.stringify(reportPath)}).length`);
      await evaluate("document.querySelector('[aria-label=Fechar]').click()");
      await reply(operating, null, 204);
      await waitFor(`adminTest.calls.filter(r => r.path === ${JSON.stringify(reportPath)}).length > ${beforeClose}`);
    });
    await t.test("filtro visual de tipo mantém o escopo da API e preserva a seleção ao atualizar", async () => {
      await reset("dashboard");
      await waitFor("document.body.innerText.includes('Ocupação dos ambientes')");
      await evaluate("adminTest.select('Tipo de ambiente (lista)', 'Laboratorio')");
      const before = await evaluate<number>("adminTest.calls.filter(r => r.path === '/api/occupancy-indicators/semesters/1').length");
      await evaluate("adminTest.click('Atualizar dados')");
      await waitFor(`adminTest.calls.filter(r => r.path === '/api/occupancy-indicators/semesters/1').length > ${before}`);
      assert.equal(await evaluate("[...document.querySelectorAll('label')].find(l => l.querySelector('span')?.textContent === 'Tipo de ambiente (lista)').querySelector('select').value"), "Laboratorio");
      assert.equal(await evaluate("document.body.innerText.includes('o resumo acima permanece no escopo da consulta da API')"), true);
    });
    await t.test("requisitos são cadastrados e critérios removidos por PUT, sem DELETE", async () => {
      await reset("requirements"); await waitFor("document.body.innerText.includes('Computadores necessários')");
      await evaluate("adminTest.select('Tipo de ambiente exigido', 'Laboratorio'); adminTest.input('Computadores necessários (opcional)', '20'); adminTest.input('RAM mínima por computador (GB, opcional)', '16')");
      await evaluate("adminTest.click('Adicionar requisito de recurso')");
      await waitFor("document.body.innerText.includes('Recurso do catálogo')");
      await evaluate("adminTest.select('Recurso do catálogo', '9'); adminTest.select('Adicionar software exigido', '1')");
      await waitFor("document.body.innerText.includes('Licenças necessárias')");
      await evaluate("adminTest.input('Licenças necessárias (opcional)', '20'); adminTest.click('Salvar requisitos técnicos')");
      await waitFor(`adminTest.pending.some(r => r.path === ${JSON.stringify(requirement)})`);
      const body = await evaluate<any>(`adminTest.pending.find(r => r.path === ${JSON.stringify(requirement)}).body`);
      assert.equal(body.requiredComputers, 20); assert.equal(body.minRamGb, 16);
      assert.equal(body.resources[0].name, "Bancada"); assert.equal(body.resources[0].resourceCatalogItemId, 9);
      assert.equal(body.software[0].requiredLicenses, 20);
      await capture("requisitos-desktop");
      assert.equal(await evaluate(`adminTest.pending.find(r => r.path === ${JSON.stringify(requirement)}).method`), "POST");
      await reply(requirement, { registered: true }, 201);
      await waitFor("document.body.innerText.includes('Requisitos técnicos salvos')");
      await evaluate("adminTest.click('Remover requisito de recurso 1'); adminTest.click('Remover requisito de software CAD')");
      await evaluate("adminTest.click('Salvar requisitos técnicos')");
      await waitFor(`adminTest.pending.some(r => r.path === ${JSON.stringify(requirement)})`);
      const update = await evaluate<any>(`adminTest.pending.find(r => r.path === ${JSON.stringify(requirement)})`);
      assert.equal(update.method, "PUT"); assert.deepEqual(update.body.resources, []); assert.deepEqual(update.body.software, []);
      assert.equal(update.body.requiredComputers, 20);
      await reply(requirement, null, 204);
    });
    await t.test("catálogo mantém caminho completo e Professor somente consulta requisitos", async () => {
      await reset("catalog", "Professor");
      await waitFor("document.body.innerText.includes('Curso sintético')");
      await evaluate("adminTest.input('Buscar curso', 'Inexistente')");
      await waitFor("document.body.innerText.includes('Nenhum resultado para a busca')");
      assert.equal(await evaluate("document.body.innerText.includes('Curso sintético')"), false);
      await evaluate("adminTest.input('Buscar curso', 'Curso')");
      await waitFor("document.body.innerText.includes('Ver módulos')");
      await evaluate("adminTest.click('Ver módulos')"); await waitFor("document.body.innerText.includes('Módulo sintético')");
      await evaluate("adminTest.click('Ver UCs')"); await waitFor("document.body.innerText.includes('UC sintética')");
      await evaluate("adminTest.click('Ver capacidades')"); await waitFor("document.body.innerText.includes('Capacidade sintética')");
      assert.equal(await evaluate("document.querySelector('[aria-label=\"Resumo da carga horária\"]')?.innerText.includes('Carga horária completa')"), true);
      await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), true);
      await capture("catalogo-capacidades-mobile");
      await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      await evaluate("adminTest.click('Requisitos técnicos')");
      await waitFor("document.body.innerText.includes('Somente Admin')");
      assert.equal(await evaluate("!!document.querySelector('[role=dialog] input:not(:disabled)')"), false);
      assert.equal(await evaluate("document.body.innerText.includes('Salvar requisitos técnicos')"), false);
      assert.equal(await evaluate(`adminTest.calls.some(r => r.path === ${JSON.stringify(requirement)} && r.method === 'GET')`), true);
      assert.equal(await evaluate("adminTest.calls.some(r => r.method !== 'GET')"), false);
      await reset("dashboard", "Professor");
      await waitFor("document.querySelector('h1')?.textContent === 'Visão Geral'");
      assert.equal(await evaluate("document.body.innerText.includes('Configurar turnos oferecidos')"), false);
    });
    await t.test("recursos da UC usam o catálogo e somente Admin pode salvar", async () => {
      const path = "/api/courses/1/modules/2/curricular-units/3/resources";
      await reset("catalog", "Professor");
      await waitFor("document.body.innerText.includes('Curso sintético')");
      await evaluate("adminTest.click('Ver módulos')"); await waitFor("document.body.innerText.includes('Módulo sintético')");
      await evaluate("adminTest.click('Ver UCs')"); await waitFor("document.body.innerText.includes('UC sintética')");
      await evaluate("adminTest.click('Ver capacidades')");
      await waitFor("document.body.innerText.includes('Recursos necessários da UC')");
      await evaluate("adminTest.click('Recursos necessários da UC')");
      await waitFor("document.querySelector('[role=dialog]')?.innerText.includes('Nenhum recurso configurado')");
      assert.equal(await evaluate("document.querySelector('[role=dialog]')?.innerText.includes('Salvar recursos da UC')"), false);
      await reset("catalog", "Admin");
      await waitFor("document.body.innerText.includes('Curso sintético')");
      await evaluate("adminTest.click('Ver módulos')"); await waitFor("document.body.innerText.includes('Módulo sintético')");
      await evaluate("adminTest.click('Ver UCs')"); await waitFor("document.body.innerText.includes('UC sintética')");
      await evaluate("adminTest.click('Ver capacidades')");
      await evaluate("adminTest.click('Recursos necessários da UC')");
      await waitFor("document.querySelector('[role=dialog]')?.innerText.includes('Adicionar recurso do catálogo')");
      await evaluate("adminTest.select('Adicionar recurso do catálogo', '9'); adminTest.click('Salvar recursos da UC')");
      await waitFor(`adminTest.pending.some(r => r.path === ${JSON.stringify(path)})`);
      assert.deepEqual(await evaluate(`adminTest.pending.find(r => r.path === ${JSON.stringify(path)}).body`),
        [{ resourceCatalogItemId: 9, quantity: 1 }]);
      await reply(path, null, 204);
    });
    await t.test("turma carrega módulo, UC, CH e recursos e registra EAD sem duplicar o plano", async () => {
      await reset("academic", "Admin");
      await evaluate(`adminTest.catalog['/api/courses/1/modules/2/curricular-units/3/resources'] =
        [{ resourceCatalogItemId: 9, name: 'Bancada', category: 'Equipamento', quantity: 1 }]`);
      await evaluate("adminTest.select('Semestre', '1'); adminTest.select('Curso do Plano de Curso', '1')");
      await waitFor("document.body.innerText.includes('Módulo sintético')");
      await evaluate("adminTest.select('Módulo do curso', '2')");
      await waitFor("document.body.innerText.includes('UC sintética · CH 8 h')");
      assert.equal(await evaluate("document.body.innerText.includes('Bancada (1)')"), true);
      await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      for (const theme of ["light", "dark"]) {
        await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
        assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
      }
      await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      await evaluate("adminTest.select('Turno da turma', '1'); adminTest.input('Turma', 'Turma EAD'); adminTest.select('Oferta de UC sintética', 'Ead')");
      await evaluate("adminTest.select('Horário on-line de UC sintética', 'HorarioDefinido'); adminTest.click('Adicionar turma')");
      await waitFor("adminTest.pending.some(r => r.path === '/api/classes')");
      const body = await evaluate<any>("adminTest.pending.find(r => r.path === '/api/classes').body");
      assert.equal(body.courseId, 1); assert.equal(body.courseModuleId, 2);
      assert.deepEqual(body.unitOfferings, [{ curricularUnitId: 3, deliveryMode: "Ead", eadScheduleMode: "HorarioDefinido" }]);
      assert.equal(Object.hasOwn(body.unitOfferings[0], "plannedHours"), false);
      await reply("/api/classes", { id: 42, name: "Turma EAD" }, 201);
      await reset("academic", "Professor");
      await evaluate(`adminTest.catalog['/api/classes'] = [{ id: 7, semesterId: 1, name: 'Turma anterior', students: 20, shiftId: 1,
        courseId: null, courseModuleId: null }];
        adminTest.catalog['/api/classes/7/units'] = { legacyWithoutModule: true, units: [], presentialHours: 0, eadHours: 0, unitsWithoutHours: 0 };
        adminTest.click('Atualizar dados')`);
      await waitFor("document.body.innerText.includes('Turma anterior')");
      await evaluate("adminTest.click('Ver UCs da turma')");
      await waitFor("document.body.innerText.includes('Turma anterior sem módulo vinculado')");
      assert.equal(await evaluate("document.body.innerText.includes('Adicionar turma')"), false);
    });
    await t.test("atribuição usa apenas UCs ofertadas e instrutores habilitados, sem horário nem sala", async () => {
      await reset("academic", "Admin");
      await evaluate(`adminTest.catalog['/api/classes'] = [{ id: 7, semesterId: 1, courseId: 1,
        courseModuleId: 2, name: 'Turma EAD', students: 20, shiftId: 1 }];
        adminTest.catalog['/api/classes/7/units'] = { legacyWithoutModule: false, presentialHours: 0,
        eadHours: 8, unitsWithoutHours: 0, units: [{ curricularUnitId: 3, code: 'UC', name: 'UC sintética',
        plannedHours: 8, deliveryMode: 'Ead', eadScheduleMode: 'SemHorarioFixo', teacherId: null, resources: [] }] };
        adminTest.catalog['/api/classes/7/units/3/eligible-teachers'] = [{ teacherId: 't0', displayName: 'Docente 0' }];
        adminTest.click('Atualizar dados')`);
      await waitFor("document.body.innerText.includes('Turma EAD')");
      await evaluate("adminTest.select('Semestre da atribuição', '1'); adminTest.select('Turma da atribuição', '7')");
      await waitFor("document.body.innerText.includes('UC · UC sintética · EAD')");
      await evaluate("adminTest.select('UC ofertada', '3')");
      await waitFor("document.body.innerText.includes('Docente 0')");
      await evaluate("adminTest.select('Instrutor habilitado', 't0'); adminTest.click('Salvar instrutor responsável')");
      const path = '/api/classes/7/units/3/teacher';
      await waitFor(`adminTest.pending.some(r => r.path === ${JSON.stringify(path)})`);
      assert.deepEqual(await evaluate<any>(`adminTest.pending.find(r => r.path === ${JSON.stringify(path)}).body`),
        { teacherId: 't0' });
      await reply(path, null, 204);
      await waitFor("document.body.innerText.includes('Instrutor responsável registrado')");
      await reset("academic", "Professor");
      assert.equal(await evaluate("document.body.innerText.includes('Salvar instrutor responsável')"), false);
    });
    await t.test("grade semestral mostra CH, EAD sem sala e pendências sem liberar publicação", async () => {
      await reset("schedules", "Admin");
      await evaluate(`adminTest.catalog['/api/schedules'] = [{ id: 5, semesterId: 1, status: 'Rascunho',
        unallocatedMeetings: 1, allocatedMeetings: 2, createdAtUtc: '2027-03-01T00:00:00' }];
        adminTest.catalog['/api/schedules/5'] = { id: 5, semesterId: 1, status: 'Rascunho',
        unallocatedMeetings: 1, createdAtUtc: '2027-03-01T00:00:00', lessons: [],
        unitPlans: [{ id: 11, classGroupId: 7, className: 'Turma sintética', courseName: 'Curso sintético',
          moduleName: 'Módulo sintético', curricularUnitId: 3, unitName: 'UC presencial', teacherId: 't0',
          plannedHours: 8, allocatedHours: 4, unallocatedHours: 4, pendingReason: 'Ambiente ocupado',
          deliveryMode: 'Presencial', eadScheduleMode: null, meetings: [{ id: 1, date: '2027-03-03',
          shiftId: 1, shiftName: 'Manhã', start: '08:00:00', end: '12:00:00', roomId: 10,
          room: 'Laboratório sintético', plannedHours: 4 }] },
        { id: 12, classGroupId: 7, className: 'Turma sintética', courseName: 'Curso sintético',
          moduleName: 'Módulo sintético', curricularUnitId: 4, unitName: 'UC EAD', teacherId: 't0',
          plannedHours: 8, allocatedHours: 8, unallocatedHours: 0, pendingReason: null,
          deliveryMode: 'Ead', eadScheduleMode: 'SemHorarioFixo', meetings: [{ id: 2, date: null,
          shiftId: null, shiftName: null, start: null, end: null, roomId: null, room: null,
          plannedHours: 8 }] }] };
        adminTest.click('Atualizar dados')`);
      await waitFor("document.body.innerText.includes('Grade #5')");
      await evaluate("adminTest.select('Semestre', '1'); [...document.querySelectorAll('button')].find(b => b.textContent.includes('Grade #5')).click()");
      await waitFor("document.body.innerText.includes('UC EAD')");
      assert.equal(await evaluate("document.body.innerText.includes('EAD sem horário fixo') && document.body.innerText.includes('sem sala física')"), true);
      assert.equal(await evaluate("document.body.innerText.includes('Ambiente ocupado') && document.body.innerText.includes('não alocada: 4 h')"), true);
      assert.equal(await evaluate("document.body.innerText.includes('Curso sintético') && document.body.innerText.includes('Módulo sintético')"), true);
      assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Publicar grade'))?.disabled"), true);
      const alternativesPath = '/api/schedules/5/unit-plans/11/alternatives?meetingId=1&from=2027-03-03';
      await evaluate(`adminTest.deferred.push(${JSON.stringify(alternativesPath)})`);
      await evaluate("adminTest.click('Ajustar')");
      await waitFor(`adminTest.pending.some(r => r.path === ${JSON.stringify(alternativesPath)})`);
      await reply(alternativesPath, [{ date: '2027-03-05', shiftId: 1, roomId: 10,
        roomName: 'Laboratório sintético', hours: 4 }]);
      await waitFor("document.body.innerText.includes('2027-03-05')");
      await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.includes('2027-03-05'))?.click()");
      await evaluate("adminTest.click('Validar e salvar')");
      const previewPath = '/api/schedules/5/unit-plans/11/meeting-preview';
      await waitFor(`adminTest.pending.some(r => r.path === ${JSON.stringify(previewPath)})`);
      assert.deepEqual(await evaluate<any>(`adminTest.pending.find(r => r.path === ${JSON.stringify(previewPath)}).body`),
        { meetingId: 1, date: '2027-03-05', shiftId: 1, roomId: 10 });
      await reply(previewPath, { allowed: false, blocks: ['Instrutor indisponível'], hours: 4 });
      await waitFor("document.body.innerText.includes('Instrutor indisponível')");
      assert.equal(await evaluate("adminTest.calls.some(r => r.path === '/api/schedules/5/unit-plans/11/meeting' && r.method === 'PUT')"), false);
      await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      for (const theme of ["light", "dark"]) {
        await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
        assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
      }
      await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      await evaluate("adminTest.input('Manhã: horas pedagógicas por encontro', '4'); adminTest.click('Salvar CH do turno')");
      const path = '/api/shifts/1/pedagogical-hours';
      await waitFor(`adminTest.pending.some(r => r.path === ${JSON.stringify(path)})`);
      assert.deepEqual(await evaluate<any>(`adminTest.pending.find(r => r.path === ${JSON.stringify(path)}).body`), { hours: 4 });
      await reply(path, null, 204);
      await reset("schedules", "Professor");
      assert.equal(await evaluate("document.body.innerText.includes('Carga pedagógica por turno') || document.body.innerText.includes('Gerar nova grade')"), false);
    });
    await t.test("Admin cadastra capacidade no contexto da UC e consulta fechamento de carga", async () => {
      await reset("catalog", "Admin");
      await waitFor("document.body.innerText.includes('Curso sintético')");
      await evaluate("adminTest.click('Ver módulos')"); await waitFor("document.body.innerText.includes('Módulo sintético')");
      await evaluate("adminTest.click('Ver UCs')"); await waitFor("document.body.innerText.includes('UC sintética')");
      await evaluate("adminTest.click('Ver capacidades')"); await waitFor("document.body.innerText.includes('Capacidade sintética')");
      assert.equal(await evaluate("document.querySelector('[aria-label=\"Resumo da carga horária\"]')?.innerText.includes('8 h')"), true);
      await evaluate("adminTest.click('Novo capacidade')");
      await evaluate("adminTest.input('Descrição', 'Capacidade adicional'); adminTest.input('Carga horária necessária', '2,5'); adminTest.input('Ordem', '2')");
      await evaluate("const t = [...document.querySelectorAll('label')].find(l => l.querySelector('span')?.textContent === 'Conteúdos relacionados').querySelector('textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, 'Conteúdo adicional'); t.dispatchEvent(new Event('input', {bubbles:true}))");
      await evaluate("adminTest.click('Salvar capacidade')");
      const path = "/api/courses/1/modules/2/curricular-units/3/capabilities";
      await waitFor(`adminTest.pending.some(r => r.path === ${JSON.stringify(path)})`);
      const pending = await evaluate<any>(`adminTest.pending.find(r => r.path === ${JSON.stringify(path)})`);
      assert.equal(pending.method, "POST");
      assert.deepEqual(pending.body, { description: "Capacidade adicional", contents: "Conteúdo adicional", requiredHours: 2.5, order: 2 });
      await reply(path, { id: 5 }, 201);
      await waitFor("document.body.innerText.includes('Cadastro realizado')");
    });
    await t.test("docentes: Admin consulta e edita perfil; Professor vê apenas o próprio", async () => {
      await reset("teachers", "Admin");
      await waitFor("[...document.querySelectorAll('textarea')].some(t => t.value === 'Formação registrada')");
      assert.equal(await evaluate("document.body.innerText.includes('Cursos habilitados') && document.body.innerText.includes('UCs habilitadas') && document.body.innerText.includes('Capacidades vinculadas')"), true);
      await evaluate("adminTest.input('Buscar docente', 'Docente 0')");
      await waitFor("[...document.querySelectorAll('.card')].some(c => c.textContent.includes('Docentes exibidos') && c.textContent.includes('1'))");
      assert.equal(await evaluate("document.querySelector('table tbody').querySelectorAll('tr').length"), 1);
      await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), true);
      await capture("docentes-mobile");
      await command("Emulation.setDeviceMetricsOverride", { width: 768, height: 1024, deviceScaleFactor: 1, mobile: false });
      assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), true);
      await capture("docentes-tablet");
      await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      await capture("docentes-desktop");
      await evaluate("(() => { const field = [...document.querySelectorAll('label')].find(l => l.querySelector('span')?.textContent === 'Formação').querySelector('textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, 'Formação atualizada'); field.dispatchEvent(new Event('input', {bubbles:true})); })()");
      await evaluate("adminTest.click('Salvar perfil')");
      const profilePath = "/api/teachers/t0/pedagogical-profile";
      await waitFor(`adminTest.pending.some(r => r.path === ${JSON.stringify(profilePath)})`);
      assert.equal(await evaluate(`adminTest.pending.find(r => r.path === ${JSON.stringify(profilePath)}).body.education`), "Formação atualizada");
      await reply(profilePath, null, 204);
      await waitFor("document.body.innerText.includes('Perfil pedagógico atualizado')");
      await evaluate("document.querySelector('button[aria-label=\"Terça · Manhã\"]').click()");
      await waitFor("document.querySelector('button[aria-label=\"Terça · Manhã\"]').getAttribute('aria-pressed') === 'true'");
      await evaluate("adminTest.click('Salvar disponibilidade')");
      const availabilityPath = "/api/teachers/t0/availability";
      await waitFor(`adminTest.pending.some(r => r.path === ${JSON.stringify(availabilityPath)})`);
      assert.deepEqual(await evaluate<any>(`adminTest.pending.find(r => r.path === ${JSON.stringify(availabilityPath)}).body`),
        [{ weekday: 1, shiftId: 1 }, { weekday: 2, shiftId: 1 }]);
      await reply(availabilityPath, null, 204);
      await evaluate("document.querySelector('[role=dialog] button[aria-label=Fechar]').click()");
      await waitFor("!document.querySelector('[role=dialog]')");
      await evaluate("adminTest.click('Cadastrar instrutor')");
      await waitFor("!!document.querySelector('[role=dialog]')");
      await evaluate("adminTest.input('Nome', 'Docente de teste'); adminTest.input('E-mail', 'docente@example.test'); adminTest.input('Senha inicial', 'Example123!'); adminTest.click('Criar instrutor')");
      await waitFor("adminTest.pending.some(r => r.path === '/api/auth/register')");
      await reply("/api/auth/register", { role: "Professor" }, 201);
      await waitFor("document.body.innerText.includes('Instrutor cadastrado')");
      await reset("teachers", "Professor");
      await waitFor("[...document.querySelectorAll('textarea')].some(t => t.value === 'Formação registrada')");
      assert.equal(await evaluate("document.querySelector('table tbody').querySelectorAll('tr').length"), 1);
      assert.equal(await evaluate("document.body.innerText.includes('docente0@example.test')"), false);
      assert.equal(await evaluate("document.body.innerText.includes('Cadastrar instrutor') || document.body.innerText.includes('Salvar perfil') || document.body.innerText.includes('Buscar docente')"), false);
      assert.equal(await evaluate("[...document.querySelectorAll('textarea')].every(t => t.readOnly)"), true);
      assert.equal(await evaluate("adminTest.calls.some(r => r.path.includes('/pedagogical-profile') && !r.path.includes('/t0/'))"), false);
    });
    await t.test("habilitações carregam curso, módulo e UCs do catálogo institucional", async () => {
      await reset("teachers", "Admin");
      await waitFor("document.body.innerText.includes('Habilitações por curso e UC')");
      await evaluate("adminTest.select('Curso para habilitação', '1')");
      await waitFor("document.body.innerText.includes('Módulo sintético')");
      await evaluate("adminTest.select('Módulo para habilitação', '2')");
      await waitFor("document.body.innerText.includes('UC · UC sintética')");
      await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      for (const theme of ["light", "dark"]) {
        await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
        assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
      }
      await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      assert.equal(await evaluate("[...document.querySelectorAll('input[type=checkbox]')].some(i => i.checked)"), true);
      await evaluate(`adminTest.catalog['/api/teachers/t0/pedagogical-profile'].curricularUnits = [];
        [...document.querySelectorAll('label')].find(l => l.textContent.includes('UC · UC sintética')).querySelector('input').click()`);
      const path = '/api/teachers/t0/pedagogical-profile/courses/1/curricular-units/3';
      await waitFor(`adminTest.pending.some(r => r.path === ${JSON.stringify(path)})`);
      assert.equal(await evaluate(`adminTest.pending.find(r => r.path === ${JSON.stringify(path)}).method`), "DELETE");
      await reply(path, null, 204);
      await waitFor("[...document.querySelectorAll('label')].find(l => l.textContent.includes('UC · UC sintética')).querySelector('input').checked === false");
      await evaluate(`adminTest.reset('teachers', 'Admin');
        adminTest.catalog['/api/courses'].push({ id: 5, code: 'X', name: 'Outro curso', active: true });
        adminTest.catalog['/api/courses/5/modules'] = [{ id: 6, courseId: 5, name: 'Módulo de outro curso', order: 1 }];
        adminTest.catalog['/api/courses/5/modules/6/curricular-units'] = [{ id: 7, courseModuleId: 6,
          code: 'UC-X', name: 'UC de outro curso', plannedHours: 12 }]`);
      await waitFor("!!document.querySelector('button[aria-label^=\"Abrir perfil de\"]')");
      await evaluate("document.querySelector('button[aria-label^=\"Abrir perfil de\"]').click()");
      await waitFor("document.body.innerText.includes('Habilitações por curso e UC')");
      await evaluate("adminTest.select('Curso para habilitação', '5')");
      await waitFor("document.body.innerText.includes('Módulo de outro curso')");
      await evaluate("[...document.querySelectorAll('label')].find(l => l.textContent.includes('Habilitado para o curso')).querySelector('input').click()");
      const coursePath = '/api/teachers/t0/pedagogical-profile/courses/5';
      await waitFor(`adminTest.pending.some(r => r.path === ${JSON.stringify(coursePath)})`);
      assert.equal(await evaluate(`adminTest.pending.find(r => r.path === ${JSON.stringify(coursePath)}).method`), 'POST');
      await evaluate("adminTest.catalog['/api/teachers/t0/pedagogical-profile'].courses.push({ courseId: 5, courseName: 'Outro curso' })");
      await reply(coursePath, { courseId: 5 }, 201);
      await evaluate("adminTest.select('Módulo para habilitação', '6')");
      await waitFor("document.body.innerText.includes('UC-X · UC de outro curso')");
      await evaluate("[...document.querySelectorAll('label')].find(l => l.textContent.includes('UC-X · UC de outro curso')).querySelector('input').click()");
      const unitPath = '/api/teachers/t0/pedagogical-profile/courses/5/curricular-units/7';
      await waitFor(`adminTest.pending.some(r => r.path === ${JSON.stringify(unitPath)})`);
      assert.equal(await evaluate(`adminTest.pending.find(r => r.path === ${JSON.stringify(unitPath)}).method`), 'POST');
      await reply(unitPath, { curricularUnitId: 7 }, 201);
      await reset("teachers", "Professor");
      assert.equal(await evaluate("document.body.innerText.includes('Habilitações por curso e UC')"), false);
    });
    await t.test("cronograma móvel mantém ocupações, filtros e detalhes sem rolagem da página", async () => {
      await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await reset("timeline"); await waitFor("document.body.innerText.includes('Filtros do cronograma')");
      await evaluate("adminTest.click('Semana')");
      await waitFor("document.querySelector('button[aria-pressed=true]')?.textContent.trim() === 'Semana'");
      await waitFor("document.querySelector('table')?.innerText.includes('Turma sintética')");
      await capture("cronograma-mobile");
      await evaluate("window.scrollTo(0, document.body.scrollHeight)");
      await capture("cronograma-mobile-grade");
      await evaluate("window.scrollTo(0, 0)");
      assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), true);
      const mobileOccupations = "[...document.querySelectorAll('table button')].filter(b => b.textContent.includes('Turma sintética'))";
      assert.equal(await evaluate(`${mobileOccupations}.length`), 1);
      await evaluate(`${mobileOccupations}[0].click()`);
      await waitFor("document.querySelector('[role=dialog]')?.innerText.includes('Detalhes da ocupação')");
      await capture("cronograma-mobile-detalhes");
    });
    await t.test("cronograma alterna três períodos, filtra tipo e mantém ações restritas", async () => {
      await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      await reset("timeline");
      await evaluate("adminTest.click('Semana')");
      await waitFor("document.body.innerText.includes('Ocupações da Semana')");
      await waitFor("!!document.querySelector('table button[aria-label^=\"Detalhes:\"]')");
      await capture("cronograma-desktop-semana");
      await evaluate("window.scrollTo(0, document.body.scrollHeight)");
      await capture("cronograma-desktop-grade");
      await evaluate("window.scrollTo(0, 0)");
      assert.equal(await evaluate("document.querySelector('h1')?.textContent"), "Cronograma");
      assert.equal(await evaluate("[...document.querySelectorAll('.card')].some(card => card.textContent.includes('Ocupações registradas') && card.textContent.includes('1'))"), true);
      await evaluate("adminTest.select('Tipo de ambiente', 'Laboratorio')");
      assert.equal(await evaluate("[...document.querySelectorAll('label')].find(l => l.querySelector('span')?.textContent === 'Tipo de ambiente').querySelector('select').value"), "Laboratorio");
      assert.equal(await evaluate("adminTest.calls.filter(r => r.path.startsWith('/api/agenda?')).every(r => !r.path.includes('roomKind'))"), true);
      await evaluate("adminTest.click('Mês')");
      await waitFor("document.body.innerText.includes('ocupação(ões)') && document.querySelector('button[aria-pressed=true]')?.textContent.trim() === 'Mês'");
      await capture("cronograma-desktop-mes");
      await evaluate("adminTest.click('Semestre')");
      await waitFor("document.body.innerText.includes('Maior número de ocupações no semestre')");
      await capture("cronograma-desktop-semestre");
      assert.equal(await evaluate("document.body.innerText.includes('Semestre A')"), true);
      await command("Emulation.setDeviceMetricsOverride", { width: 768, height: 1024, deviceScaleFactor: 1, mobile: false });
      await capture("cronograma-tablet-semestre");
      assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), true);
      await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      await evaluate("adminTest.click('Semana')");
      await waitFor("document.body.innerText.includes('Ocupações da Semana')");
      await evaluate("document.querySelector('table button[aria-label^=\"Detalhes:\"]').click()");
      await waitFor("document.querySelector('[role=dialog]')?.innerText.includes('Mover ocupação')");
      await evaluate("adminTest.click('Mover ocupação')");
      await waitFor("document.querySelector('[role=dialog]')?.innerText.includes('Consultar prévia')");
      await evaluate("adminTest.click('Consultar prévia')");
      await waitFor("adminTest.pending.some(r => r.path === '/api/occupations/5/move-preview')");
      await reply("/api/occupations/5/move-preview", { allowed: false, origin: { roomId: 10 }, destination: { roomId: 10, date: "2027-03-01", shiftId: 1 }, blocks: ["Conflito sintético"], warnings: [], technicalClassification: "Unknown", technicalFindings: [] });
      await waitFor("document.querySelector('[role=dialog]')?.innerText.includes('Conflito sintético')");
      assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b => b.textContent.trim() === 'Confirmar movimentação').disabled"), true);
      await evaluate("adminTest.click('Consultar prévia')");
      await waitFor("adminTest.pending.some(r => r.path === '/api/occupations/5/move-preview')");
      await reply("/api/occupations/5/move-preview", { allowed: true, origin: { roomId: 10, startsAt: "2027-03-01T08:00:00", endsAt: "2027-03-01T12:00:00" }, destination: { roomId: 10, roomName: "Laboratório sintético", date: "2027-03-01", shiftId: 1, shiftName: "Manhã" }, blocks: [], warnings: [], technicalClassification: "Unknown", technicalFindings: [] });
      await waitFor("!![...document.querySelectorAll('[role=dialog] button')].find(b => b.textContent.trim() === 'Confirmar movimentação' && !b.disabled)");
      await evaluate("adminTest.click('Confirmar movimentação')");
      await waitFor("adminTest.pending.some(r => r.path === '/api/occupations/5/move')");
      assert.equal(await evaluate("adminTest.pending.find(r => r.path === '/api/occupations/5/move').body.confirm"), true);
      await reply("/api/occupations/5/move", null, 204);
      await waitFor("document.body.innerText.includes('Ocupação remanejada')");
      await reset("timeline", "Professor");
      await evaluate("adminTest.click('Semana')");
      await waitFor("document.body.innerText.includes('Ocupações da Semana')");
      await evaluate("document.querySelector('table button[aria-label^=\"Detalhes:\"]').click()");
      await waitFor("document.querySelector('[role=dialog]')?.innerText.includes('Detalhes da ocupação')");
      assert.equal(await evaluate("document.querySelector('[role=dialog]')?.innerText.includes('Mover ocupação')"), false);
      assert.equal(await evaluate("adminTest.calls.some(r => r.method !== 'GET')"), false);
    });
    await t.test("oportunidades seleciona capacidade com Enter e anuncia seleção por texto", async () => {
      await reset("opportunities"); await waitFor("document.body.innerText.includes('Buscar atividades')");
      await evaluate("adminTest.click('Buscar atividades')");
      await waitFor("!!document.querySelector('[aria-label^=\"Selecionar capacidade:\"]')");
      await command("Page.bringToFront");
      await evaluate("document.querySelector('[aria-label^=\"Selecionar capacidade:\"]').focus()");
      await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" });
      await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await waitFor("document.querySelector('[aria-label^=\"Selecionar capacidade:\"]')?.getAttribute('aria-pressed') === 'true'");
      assert.equal(await evaluate("document.querySelector('[aria-label^=\"Selecionar capacidade:\"][aria-pressed=true]').textContent.includes('Selecionada')"), true);
      await waitFor("document.querySelector('[aria-label=\"Matriz de compatibilidade técnica\"]')?.textContent.includes('Validade não comprovada')");
      assert.equal(await evaluate("document.querySelector('[aria-label=\"Matriz de compatibilidade técnica\"]').querySelectorAll('article').length"), 3);
      for (const classification of ["Compatível", "Parcialmente compatível", "Incompatível"])
        assert.equal(await evaluate(`document.querySelector('[aria-label="Matriz de compatibilidade técnica"]').textContent.includes(${JSON.stringify(classification)})`), true);
      assert.equal(await evaluate("document.body.innerText.includes('A disponibilidade no semestre exige a análise de períodos')"), true);
      await evaluate("document.querySelector('[aria-label=\"Matriz de compatibilidade técnica\"]').scrollIntoView({block:'center'})");
      await capture("oportunidades-matriz-desktop");
      await evaluate("adminTest.select('Turno', '1'); adminTest.click('Analisar período')");
      await waitFor("document.body.innerText.includes('Disponibilidade indeterminada')");
      assert.equal(await evaluate("document.body.innerText.includes('disponibilidade do instrutor e da turma não foi verificada')"), true);
      await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), true);
      await evaluate("document.querySelector('[aria-label=\"Matriz de compatibilidade técnica\"]').scrollIntoView({block:'start'})");
      await capture("oportunidades-matriz-mobile");
      await evaluate("window.scrollTo(0, document.body.scrollHeight)");
      await capture("oportunidades-periodo-mobile");
      await evaluate("window.scrollTo(0, 0)");
      await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    });
    await t.test("agenda busca docentes e diferencia horas semanais das semestrais", async () => {
      await reset("instructor"); await waitFor("!!document.querySelector('table')");
      assert.equal(await evaluate("document.querySelector('table').textContent.includes('Carga semanal') && document.querySelector('table').textContent.includes('Carga semestral')"), true);
      await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), true);
      await capture("instrutores-mobile-lista");
      await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      await evaluate("adminTest.input('Buscar instrutor', 'Docente 0'); adminTest.select('Instrutor', 't0')");
      await waitFor("document.body.innerText.includes('de ocupações efetivas no semestre')");
      assert.equal(await evaluate("document.body.innerText.includes('na semana de')"), true);
      assert.equal(await evaluate("[...document.querySelectorAll('.card')].some(card => card.textContent.includes('Carga semestral') && card.textContent.includes('8 h'))"), true);
      assert.equal(await evaluate("[...document.querySelectorAll('.card')].some(card => card.textContent.includes('Carga semanal') && card.textContent.includes('4 h'))"), true);
      assert.equal(await evaluate("document.body.innerText.includes('800 h')"), false);
      await capture("instrutores-desktop-semana");
      await command("Emulation.setDeviceMetricsOverride", { width: 768, height: 1024, deviceScaleFactor: 1, mobile: false });
      assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), true);
      await capture("instrutores-tablet-semana");
      await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), true);
      await evaluate("window.scrollTo(0, document.body.scrollHeight)");
      await capture("instrutores-mobile-semana");
      await evaluate("window.scrollTo(0, 0)");
      await evaluate("adminTest.click('Mês')");
      await waitFor("document.body.innerText.includes('Agenda do mês')");
      assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), true);
      await capture("instrutores-mobile-mes");
      await evaluate("window.scrollTo(0, document.body.scrollHeight)");
      await capture("instrutores-mobile-mes-grade");
      await evaluate("window.scrollTo(0, 0)");
      await evaluate("adminTest.click('Semestre')");
      await waitFor("document.body.innerText.includes('Distribuição no semestre')");
      await reset("instructor", "Professor");
      await waitFor("document.body.textContent.includes('Minha Agenda') && document.body.textContent.includes('Carga semestral')");
      assert.equal(await evaluate("[...document.querySelectorAll('label span')].some(span => span.textContent === 'Instrutor')"), false);
      assert.equal(await evaluate("adminTest.calls.filter(r => r.path.startsWith('/api/agenda?')).every(r => r.path.includes('teacherId=t0'))"), true);
      assert.equal(await evaluate("document.body.innerText.includes('Gerenciar esta ocupação')"), false);
    });
    await t.test("Importação e Exportação usam os campos do design system em mobile", async () => {
      for (const mode of ["import", "export"]) {
        await reset(mode);
        await waitFor("!!document.querySelector('select.field')");
        assert.equal(await evaluate("document.querySelectorAll('.input').length"), 0);
        if (mode === "export") assert.equal(await evaluate("[...document.querySelectorAll('label span')].some(l => l.textContent === 'Semestre')"), true);
        assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), true);
        await capture(`${mode}-mobile`);
      }
    });
    await t.test("importação de docentes abre no tipo correto e distingue criados, ignorados e erros", async () => {
      await reset("import-docentes");
      await waitFor("document.querySelector('select.field')?.value === 'Docentes'");
      await evaluate("(() => { const input = document.querySelector('input[type=file]'); const transfer = new DataTransfer(); transfer.items.add(new File(['Nome,CPF'], 'docentes.csv', {type:'text/csv'})); input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles:true})); })()");
      await evaluate("adminTest.click('Analisar arquivo')");
      await waitFor("adminTest.pending.some(r => r.path === '/api/imports/preview')");
      const row = { line: 2, identifier: "***.***.***-00", status: "Invalido", changes: [], errors: ["Campo obrigatório ausente"] };
      await reply("/api/imports/preview", { kind: "Docentes", fileName: "docentes.csv", total: 2, newCount: 1,
        updateCount: 0, unchangedCount: 0, invalidCount: 1, duplicateCount: 0, token: "sintetico", rows: [row] });
      await waitFor("document.body.innerText.includes('Prévia da importação')");
      await evaluate("[...document.querySelectorAll('label')].find(l => l.textContent.includes('Ignorar 1 linha')).querySelector('input').click()");
      await evaluate("adminTest.click('Confirmar importação')");
      await waitFor("adminTest.pending.some(r => r.path === '/api/imports/confirm')");
      await reply("/api/imports/confirm", { kind: "Docentes", total: 2, created: 1, updated: 0,
        unchanged: 0, skipped: 1, errors: [row] });
      await waitFor("document.body.innerText.includes('Importação concluída')");
      assert.equal(await evaluate("document.querySelector('[aria-label=\"Erros de validação\"]')?.textContent.includes('Campo obrigatório ausente')"), true);
      assert.equal(await evaluate("[...document.querySelectorAll('.card')].some(c => c.textContent.includes('Criados') && c.textContent.includes('Ignorados'))"), true);
      assert.equal(await evaluate("document.body.innerText.includes('A importação foi parcial')"), true);
    });
    console.log(`Capturas sintéticas: ${screenshotDir}`);
  } finally { await close(); }
});
