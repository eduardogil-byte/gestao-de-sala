import assert from "node:assert/strict";
import test from "node:test";
import { chromePath, openAdminFixture } from "./helpers/browser.ts";

test("catálogo administrativo mostra softwares cadastrados e confirma inclusão", { skip: !chromePath }, async () => {
  const browser = await openAdminFixture("adminCritical");
  const { evaluate, waitFor } = browser;
  try {
    await evaluate("adminTest.reset('rooms')");
    await waitFor("document.body.innerText.includes('Catálogo de softwares') && document.body.innerText.includes('1 software(s) cadastrado(s)')");
    const section = await evaluate<string>("[...document.querySelectorAll('h2')].find(x => x.textContent === 'Catálogo de softwares')?.closest('.card')?.innerText ?? ''");
    assert.match(section, /CAD/);
    assert.match(section, /Cadastrado/);
    assert.doesNotMatch(section, /Licenças:/);
    await evaluate("const input = document.querySelector('input[aria-label=\"Nome do software\"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Simulador'); input.dispatchEvent(new Event('input', { bubbles: true }))");
    await evaluate("adminTest.click('Adicionar')");
    await waitFor("adminTest.pending.some(x => x.path === '/api/software')");
    await evaluate("adminTest.catalog['/api/software'] = [{ id: 1, name: 'CAD' }, { id: 2, name: 'Simulador' }]; adminTest.reply('/api/software', { id: 2, name: 'Simulador' }, 201)");
    await waitFor("document.body.innerText.includes('Software adicionado ao catálogo.') && document.body.innerText.includes('2 software(s) cadastrado(s)')");
  } finally { await browser.close(); }
});
