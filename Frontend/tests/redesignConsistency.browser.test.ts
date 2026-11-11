import assert from "node:assert/strict";
import test from "node:test";
import { chromePath, openAdminFixture } from "./helpers/browser.ts";

const widths = [360, 768, 1366];

test("telas administrativas mantêm conteúdo no viewport em celular, tablet e desktop", { skip: !chromePath, timeout: 90000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture("adminIntegrations");
  try {
    for (const mode of ["dashboard-full", "dashboard", "timeline", "instructor", "opportunities", "bookings", "catalog", "teachers", "import", "export"]) {
      await evaluate(`adminTest.reset(${JSON.stringify(mode)})`);
      await waitFor("!!document.querySelector('main h1, main h2')");
      for (const width of widths) {
        await command("Emulation.setDeviceMetricsOverride", { width, height: 850, deviceScaleFactor: 1, mobile: width === 360 });
        const dimensions = await evaluate<{ viewport: number; document: number }>(
          "({ viewport: innerWidth, document: document.documentElement.scrollWidth })",
        );
        assert.ok(dimensions.document <= dimensions.viewport + 1,
          `${mode} em ${width}px: conteúdo ${dimensions.document}px para viewport ${dimensions.viewport}px`);
      }
    }
  } finally { await close(); }
});

test("ambientes e planejamento preservam a largura da página nos três tamanhos", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture();
  try {
    for (const mode of ["rooms", "planning"]) {
      await evaluate(`adminTest.reset(${JSON.stringify(mode)})`);
      await waitFor("!!document.querySelector('h1')");
      for (const width of widths) {
        await command("Emulation.setDeviceMetricsOverride", { width, height: 850, deviceScaleFactor: 1, mobile: width === 360 });
        const dimensions = await evaluate<{ viewport: number; document: number }>(
          "({ viewport: innerWidth, document: document.documentElement.scrollWidth })",
        );
        assert.ok(dimensions.document <= dimensions.viewport + 1,
          `${mode} em ${width}px: conteúdo ${dimensions.document}px para viewport ${dimensions.viewport}px`);
      }
    }
  } finally { await close(); }
});

test("controles visíveis possuem nome acessível nos fluxos administrativos", { skip: !chromePath, timeout: 90000 }, async () => {
  const { evaluate, waitFor, close } = await openAdminFixture("adminIntegrations");
  try {
    for (const mode of ["dashboard-full", "dashboard", "timeline", "instructor", "opportunities", "bookings", "catalog", "teachers", "import", "export"]) {
      await evaluate(`adminTest.reset(${JSON.stringify(mode)})`);
      await waitFor("!!document.querySelector('main h1, main h2')");
      const unnamed = await evaluate<string[]>(`[...document.querySelectorAll('button, input, select, textarea')]
        .filter(el => el.getClientRects().length && el.type !== 'hidden')
        .filter(el => !((el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.textContent || el.getAttribute('title') ||
          el.closest('label')?.textContent || (el.id && document.querySelector('label[for="' + el.id + '"]')?.textContent))?.trim()))
        .map(el => el.outerHTML.slice(0, 180))`);
      assert.deepEqual(unnamed, [], `${mode}: controles sem nome acessível`);
    }
  } finally { await close(); }
});

test("modal de ambiente mantém foco, fecha por Escape e devolve foco ao acionador", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture();
  try {
    await evaluate("adminTest.reset('rooms')");
    await waitFor("[...document.querySelectorAll('button')].some(button => button.textContent?.includes('Novo ambiente'))");
    await command("Emulation.setDeviceMetricsOverride", { width: 360, height: 640, deviceScaleFactor: 1, mobile: true });
    await evaluate("adminTest.click('Novo ambiente')");
    await waitFor("!!document.querySelector('[role=dialog]')");
    assert.equal(await evaluate("document.querySelector('[role=dialog]')?.contains(document.activeElement)"), true);
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
    await evaluate(`(() => { const dialog = document.querySelector('[role=dialog]');
      const items = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')]
        .filter(element => element.getClientRects().length); items.at(-1).focus(); })()`);
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" });
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab" });
    assert.equal(await evaluate(`(() => { const dialog = document.querySelector('[role=dialog]');
      const items = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')]
        .filter(element => element.getClientRects().length); return document.activeElement === items[0]; })()`), true);
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
    await waitFor("!document.querySelector('[role=dialog]')");
    assert.equal(await evaluate("document.activeElement?.textContent?.includes('Novo ambiente')"), true);
  } finally { await close(); }
});

test("ação principal e links do Dashboard mantêm contraste no tema escuro", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, close } = await openAdminFixture("adminIntegrations");
  try {
    await evaluate("adminTest.reset('dashboard-full')");
    await waitFor("[...document.querySelectorAll('button')].some(button => button.textContent?.includes('Reservar uma sala'))");
    const ratios = await evaluate<number[]>(`(() => {
      const linear = (value) => { value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; };
      const luminance = (color) => { const [red, green, blue] = color.match(/\\d+/g).slice(0, 3).map(Number); return .2126 * linear(red) + .7152 * linear(green) + .0722 * linear(blue); };
      const ratio = (foreground, background) => { const a = luminance(foreground), b = luminance(background); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
      const cta = [...document.querySelectorAll('button')].find(button => button.textContent?.includes('Reservar uma sala'));
      const link = document.querySelector('.text-skybrand-700');
      return [ratio(getComputedStyle(cta).color, getComputedStyle(cta).backgroundColor),
        ratio(getComputedStyle(link).color, getComputedStyle(link.closest('.card')).backgroundColor)];
    })()`);
    assert.ok(ratios.every((value) => value >= 4.5), `Contraste insuficiente: ${ratios.join(", ")}`);
  } finally { await close(); }
});

test("menu móvel e sidebar recolhível preservam teclado e navegação por perfil", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture("appShell");
  try {
    await waitFor("!!document.querySelector('main h1')");
    await command("Emulation.setDeviceMetricsOverride", { width: 360, height: 640, deviceScaleFactor: 1, mobile: true });
    await evaluate("document.querySelector('button[aria-label=\"Abrir menu\"]').click()");
    await waitFor("document.querySelector('button[aria-label=\"Abrir menu\"]')?.getAttribute('aria-expanded') === 'true'");
    assert.equal(await evaluate("document.querySelector('aside[aria-label=\"Menu principal\"]')?.contains(document.activeElement)"), true);
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
    await waitFor("document.querySelector('button[aria-label=\"Abrir menu\"]')?.getAttribute('aria-expanded') === 'false'");
    assert.equal(await evaluate("document.activeElement?.getAttribute('aria-label')"), "Abrir menu");
    await command("Emulation.setDeviceMetricsOverride", { width: 1366, height: 850, deviceScaleFactor: 1, mobile: false });
    await evaluate("document.querySelector('button[aria-label=\"Recolher menu lateral\"]').click()");
    await waitFor("!!document.querySelector('button[aria-label=\"Expandir menu lateral\"]')");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
    await evaluate("shellTest.reset('Professor')");
    await waitFor("document.querySelector('main h1')?.textContent?.includes('Professor')");
    assert.equal(await evaluate("[...document.querySelectorAll('nav button')].some(button => button.textContent?.includes('Exportar'))"), false);
  } finally { await close(); }
});

test("formulário de reserva permanece utilizável no celular sem rolagem lateral", { skip: !chromePath, timeout: 60000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture("adminIntegrations");
  try {
    await evaluate("adminTest.reset('bookings')");
    await waitFor("[...document.querySelectorAll('button')].some(button => button.textContent?.includes('Nova reserva'))");
    await command("Emulation.setDeviceMetricsOverride", { width: 360, height: 640, deviceScaleFactor: 1, mobile: true });
    await evaluate("adminTest.click('Nova reserva')");
    await waitFor("!!document.querySelector('[role=dialog]')");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
    assert.equal(await evaluate("document.querySelector('[role=dialog]')?.contains(document.activeElement)"), true);
    const unnamed = await evaluate<string[]>(`[...document.querySelectorAll('[role=dialog] input, [role=dialog] select, [role=dialog] textarea')]
      .filter(el => el.getClientRects().length && el.type !== 'hidden')
      .filter(el => !((el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') ||
        el.closest('label')?.textContent || (el.id && document.querySelector('label[for="' + el.id + '"]')?.textContent))?.trim()))
      .map(el => el.outerHTML.slice(0, 180))`);
    assert.deepEqual(unnamed, []);
  } finally { await close(); }
});
