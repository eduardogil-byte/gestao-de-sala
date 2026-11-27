import assert from "node:assert/strict";
import test from "node:test";
import { chromePath, openAdminFixture } from "./helpers/browser.ts";

test("incompatibilidade usa motivos do servidor e só confirma por ação explícita", { skip: !chromePath }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture("bookingConfirmation");
  const click = async (text: string) => evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}).click()`);
  try {
    for (const compatible of [false, true]) {
      await evaluate(`confirmationTest.reset(${compatible})`);
      await waitFor("[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Escolher sala')");
      await click("Escolher sala");
      await waitFor("!!document.querySelector('[aria-label=\"Ambientes sugeridos para a reserva\"] button')");
      await evaluate("document.querySelector('[aria-label=\"Ambientes sugeridos para a reserva\"] button').click()");
      await waitFor("[...document.querySelectorAll('button')].some(b => b.textContent.includes('Revisar 1 data'))");
      await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Revisar 1 data')).click()");
      await waitFor("document.querySelectorAll('[role=dialog]').length === 2");
      await click("Confirmar 1 data");
      if (!compatible) {
        await waitFor("document.body.textContent.includes('Este ambiente não atende a todos os requisitos')");
        assert.equal(await evaluate("confirmationTest.state.saved"), false);
        for (const theme of ["light", "dark"]) {
          await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
          await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
          assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
        }
        assert.match(await evaluate<string>("[...document.querySelectorAll('[role=dialog]')].at(-1).textContent"), /16 GB.*8 GB/);
        await click("Cancelar");
        assert.equal(await evaluate("confirmationTest.state.saved"), false);
        await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Revisar 1 data')).click()");
        await click("Confirmar 1 data");
        await waitFor("document.body.textContent.includes('Confirmar mesmo assim')");
        await click("Confirmar mesmo assim");
      }
      await waitFor("confirmationTest.state.saved");
      assert.equal(await evaluate("confirmationTest.state.requests.filter(r => r.acceptedTechnicalReasons).length"), compatible ? 0 : 1);
    }
  } finally { await close(); }
});
