import assert from "node:assert/strict";
import test from "node:test";
import { chromePath, openAdminFixture } from "./helpers/browser.ts";

test("cadastros distinguem bloqueio de carregamento e confirmam descarte", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, close } = await openAdminFixture('adminIntegrations');
  const confirmButton = (text: string) => evaluate(`(() => { const dialogs = [...document.querySelectorAll('[role=dialog]')]; [...dialogs.at(-1).querySelectorAll('button')].find(item => item.textContent.trim() === ${JSON.stringify(text)}).click(); })()`);
  try {
    await evaluate("adminTest.reset('academic')");
    await waitFor("!!document.querySelector('[role=tab]')");
    await evaluate("adminTest.click('Nova turma')");
    await waitFor("!!document.querySelector('[role=dialog]')");
    assert.deepEqual(await evaluate("(() => { const b = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === 'Adicionar turma'); return {disabled:b.disabled, busy:b.getAttribute('aria-busy')}; })()"), {disabled: true, busy: 'false'});
    await evaluate("adminTest.input('Turma', 'Rascunho'); adminTest.click('Cancelar')");
    await waitFor("document.querySelectorAll('[role=dialog]').length === 2");
    await confirmButton('Cancelar');
    await waitFor("document.querySelectorAll('[role=dialog]').length === 1");
    assert.equal(await evaluate("[...document.querySelectorAll('label')].find(item => item.querySelector('span')?.textContent === 'Turma').querySelector('input').value"), 'Rascunho');
    await evaluate("adminTest.click('Cancelar')");
    await waitFor("document.querySelectorAll('[role=dialog]').length === 2");
    await confirmButton('Descartar');
    await waitFor("!document.querySelector('[role=dialog]')");
    await evaluate("adminTest.click('Nova turma')");
    await waitFor("!!document.querySelector('[role=dialog]')");
    assert.equal(await evaluate("[...document.querySelectorAll('label')].find(item => item.querySelector('span')?.textContent === 'Turma').querySelector('input').value"), '');
    await evaluate("document.querySelector('[role=dialog] button[aria-label=Fechar]').click()");
    await waitFor("!document.querySelector('[role=dialog]')");
    await evaluate("adminTest.click('Semestres'); adminTest.click('Novo semestre')");
    await waitFor("!!document.querySelector('[role=dialog]')");
    assert.equal(await evaluate("document.querySelector('[role=dialog] details').open"), false);
    await evaluate("adminTest.click('Cancelar')");
    await waitFor("!document.querySelector('[role=dialog]')");
    await evaluate("adminTest.catalog['/api/semesters/1/calendar']={events:[]}; adminTest.click('Calendário')");
    await waitFor("!!document.querySelector('[aria-label=\"Calendário do semestre\"]')");
    assert.equal(await evaluate("!!document.querySelector('[role=dialog] form')"), false);
    await evaluate("document.querySelector('button[data-date=\"2027-03-10\"]').click()");
    await waitFor("!!document.querySelector('[role=dialog] input')");
    await evaluate("adminTest.input('Descrição da ocorrência', 'Feriado'); document.querySelector('[role=dialog] button[aria-label=Fechar]').click()");
    await waitFor("document.querySelectorAll('[role=dialog]').length === 2");
    await confirmButton('Cancelar');
    await waitFor("document.querySelectorAll('[role=dialog]').length === 1");
    await evaluate("adminTest.click('Cancelar')");
    await waitFor("document.querySelectorAll('[role=dialog]').length === 2");
    await confirmButton('Descartar');
    await waitFor("!document.querySelector('[role=dialog] form')");
    assert.equal(await evaluate("adminTest.pending.length"), 0);
  } finally { await close(); }
});
