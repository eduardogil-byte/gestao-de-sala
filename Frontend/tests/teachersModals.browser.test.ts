import assert from "node:assert/strict";
import test from "node:test";
import { chromePath, openAdminFixture } from "./helpers/browser.ts";

test("instrutores abrem perfil e cadastro em modais com permissões preservadas", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture('adminIntegrations');
  try {
    await evaluate("adminTest.reset('teachers')");
    await waitFor("!!document.querySelector('button[aria-label=\"Abrir perfil de Docente 0\"]')");
    assert.equal(await evaluate("document.body.innerText.includes('Ver perfil') || !!document.querySelector('[role=dialog]')"), false);
    await evaluate("document.querySelector('button[aria-label=\"Informações sobre os instrutores\"]').click()");
    await waitFor("document.querySelector('[role=tooltip]')?.textContent.includes('Selecione um instrutor')");
    await evaluate("adminTest.input('Buscar docente', 'Docente 0')");
    await waitFor("document.querySelector('table tbody').children.length === 1");
    await evaluate("document.querySelector('table tbody tr td:nth-child(2)').click()");
    await waitFor("[...document.querySelectorAll('textarea')].some(item => item.value === 'Formação registrada')");
    await evaluate("document.querySelector('button[aria-label=\"Terça · Manhã\"]').click(); adminTest.click('Salvar disponibilidade')");
    await waitFor("adminTest.pending.some(item => item.path === '/api/teachers/t0/availability')");
    await evaluate("adminTest.reply('/api/teachers/t0/availability', null, 204)");
    await waitFor("document.querySelector('[role=dialog]')?.textContent.includes('Disponibilidade atualizada')");
    for (const theme of ['light', 'dark']) for (const width of [360, 1366]) {
      await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
      await command('Emulation.setDeviceMetricsOverride', { width, height: 850, deviceScaleFactor: 1, mobile: width === 360 });
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
    }
    await evaluate("document.querySelector('[role=dialog] button[aria-label=Fechar]').click()");
    await waitFor("!document.querySelector('[role=dialog]')");
    await evaluate("adminTest.click('Cadastrar instrutor')");
    await waitFor("!!document.querySelector('[role=dialog] input[type=password]')");
    await evaluate("adminTest.input('Nome', 'Instrutor de teste'); adminTest.input('E-mail', 'instrutor@example.test'); adminTest.input('Senha inicial', 'Example123!'); adminTest.click('Criar instrutor')");
    await waitFor("adminTest.pending.some(item => item.path === '/api/auth/register')");
    await evaluate("adminTest.reply('/api/auth/register', {role: 'Professor'}, 201)");
    await waitFor("!document.querySelector('[role=dialog]') && document.body.innerText.includes('Instrutor cadastrado')");
    await evaluate("adminTest.reset('teachers', 'Professor')");
    await waitFor("!!document.querySelector('button[aria-label=\"Abrir perfil de Docente 0\"]')");
    assert.equal(await evaluate("document.body.innerText.includes('Cadastrar instrutor') || !!document.querySelector('input[type=search]')"), false);
    await evaluate("document.querySelector('button[aria-label=\"Abrir perfil de Docente 0\"]').click()");
    await waitFor("[...document.querySelectorAll('textarea')].some(item => item.value === 'Formação registrada')");
    assert.equal(await evaluate("[...document.querySelectorAll('textarea')].every(item => item.readOnly)"), true);
  } finally { await close(); }
});
