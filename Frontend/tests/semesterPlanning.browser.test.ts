import assert from "node:assert/strict";
import test from "node:test";
import { chromePath, openAdminFixture } from "./helpers/browser.ts";

test("planejamento isola semestres, respostas atrasadas e operações em navegador", { skip: !chromePath, timeout: 60000 }, async (t) => {
  const browser = await openAdminFixture();
  const { evaluate, waitFor } = browser;
  const select = async (id: number) => {
    await evaluate(`adminTest.select('Semestre', '${id}')`);
    await waitFor(`adminTest.pending.some(r => r.path === '/api/semester-plans?semesterId=${id}')`);
  };
  const reply = async (path: string, body: unknown, status = 200) => {
    await evaluate(`adminTest.reply(${JSON.stringify(path)}, ${JSON.stringify(body)}, ${status})`);
  };
  const load = async (id: number, marker = `Proposta ${id}`) => {
    await reply(`/api/semester-plans?semesterId=${id}`, [{ id }]);
    await waitFor(`adminTest.pending.some(r => r.path === '/api/semester-plans/${id}')`);
    await reply(`/api/semester-plans/${id}`, { id, semesterId: id, published: false, revision: 1, proposals: [
      { id: id * 10, roomName: marker, status: "Enviada", startDate: "2027-01-01", endDate: "2027-01-02", roomId: 10, shiftName: "Manhã" },
    ] });
    await waitFor(`adminTest.pending.some(r => r.path === '/api/semester-plans/${id}/history')`);
    await reply(`/api/semester-plans/${id}/history`, []);
    await waitFor(`document.body.innerText.includes(${JSON.stringify(marker)})`);
  };
  const reset = async () => {
    await evaluate("adminTest.reset()");
    await waitFor("document.querySelector('select')?.options.length === 3");
  };
  try {
    await waitFor("document.querySelector('select')?.options.length === 3");
    await t.test("A → B invalida A imediatamente e limpa filtros", async () => {
      await select(1); await load(1);
      await evaluate("document.querySelector('[aria-label=\"Filtrar situação\"]').value = 'Publicada'; document.querySelector('[aria-label=\"Filtrar situação\"]').dispatchEvent(new Event('change', {bubbles:true}))");
      await select(2);
      assert.equal(await evaluate("document.body.innerText.includes('Proposta 1')"), false);
      assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b => b.textContent === 'Aprovar')"), false);
      await load(2);
      assert.equal(await evaluate("document.querySelector('[aria-label=\"Filtrar situação\"]').value"), "");
    });
    await t.test("A → B → A ignora detalhe antigo de A e resposta antiga de B", async () => {
      await reset(); await select(1);
      await reply('/api/semester-plans?semesterId=1', [{ id: 101 }]);
      await waitFor("adminTest.pending.some(r => r.path === '/api/semester-plans/101')");
      await select(2); await select(1); await load(1, "A atual");
      await reply('/api/semester-plans/101', { id: 101, semesterId: 1, proposals: [], revision: 1 });
      await reply('/api/semester-plans?semesterId=2', [{ id: 2 }]);
      await evaluate("new Promise(r => setTimeout(r, 50))");
      assert.equal(await evaluate("document.body.innerText.includes('A atual')"), true);
      assert.equal(await evaluate("adminTest.pending.some(r => r.path === '/api/semester-plans/101/history' || r.path === '/api/semester-plans/2')"), false);
    });
    await t.test("falha em B não reaproveita A nem oferece criação indevida", async () => {
      await reset(); await select(1); await load(1); await select(2);
      await reply('/api/semester-plans?semesterId=2', { error: "Falha sintética B" }, 500);
      await waitFor("document.body.innerText.includes('Falha sintética B')");
      assert.equal(await evaluate("document.body.innerText.includes('Proposta 1') || document.body.innerText.includes('Criar planejamento')"), false);
    });
    await t.test("troca durante aprovação não recarrega A nem contamina B", async () => {
      await reset(); await select(1); await load(1);
      await evaluate("adminTest.click('Aprovar')");
      await waitFor("adminTest.pending.some(r => r.path.includes('/decision?'))");
      await select(2); await load(2);
      const before = await evaluate<number>("adminTest.calls.filter(r => r.path === '/api/semester-plans?semesterId=1').length");
      await reply('/api/semester-plans/1/proposals/10/decision?decision=approve', {}, 200);
      await evaluate("new Promise(r => setTimeout(r, 50))");
      assert.equal(await evaluate("document.body.innerText.includes('Proposta 2')"), true);
      assert.equal(await evaluate("document.body.innerText.includes('Proposta aprovada.')"), false);
      assert.equal(await evaluate("adminTest.calls.filter(r => r.path === '/api/semester-plans?semesterId=1').length"), before);
    });
    await t.test("plano de outro semestre é rejeitado antes de exibir ações", async () => {
      await reset(); await select(2);
      await reply('/api/semester-plans?semesterId=2', [{ id: 1 }]);
      await waitFor("adminTest.pending.some(r => r.path === '/api/semester-plans/1')");
      await reply('/api/semester-plans/1', { id: 1, semesterId: 1, proposals: [] });
      await waitFor("document.body.innerText.includes('não corresponde')");
      assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b => ['Aprovar', 'Criar planejamento', 'Consultar prévia'].includes(b.textContent.trim()))"), false);
    });
    await t.test("prévia de publicação antiga não habilita publicação no novo semestre", async () => {
      await reset(); await select(1); await load(1);
      await evaluate("adminTest.click('Consultar prévia')");
      await waitFor("adminTest.pending.some(r => r.path === '/api/semester-plans/1/publish-preview')");
      await select(2); await load(2);
      await reply('/api/semester-plans/1/publish-preview', { allowed: true, revision: 1, proposalCount: 1,
        approved: 1, toCreate: 1, existing: 0, blocks: [], warnings: [], checks: [], signature: "assinatura-A" });
      await evaluate("new Promise(r => setTimeout(r, 50))");
      assert.equal(await evaluate("document.body.innerText.includes('Confirmar publicação')"), false);
      assert.equal(await evaluate("adminTest.calls.some(r => r.path.endsWith('/publish'))"), false);
    });
  } finally { await browser.close(); }
});
