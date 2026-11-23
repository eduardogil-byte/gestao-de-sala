import assert from "node:assert/strict";
import test from "node:test";
import { chromePath, openAdminFixture } from "./helpers/browser.ts";

function contrast(first: string, second: string) {
  const luminance = (color: string) => color.match(/\d+/g)!.slice(0, 3)
    .map(value => Number(value) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("temas preservam contraste e layout nas telas prioritárias", { skip: !chromePath, timeout: 90000 }, async () => {
  const { evaluate, waitFor, command, close } = await openAdminFixture("adminIntegrations");
  try {
    for (const theme of ["dark", "light", "dark"]) {
      await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
      for (const mode of ["dashboard-full", "dashboard", "bookings", "instructor", "timeline", "academic"]) {
        await evaluate(`adminTest.reset(${JSON.stringify(mode)}, ${JSON.stringify(mode === "instructor" ? "Teacher" : "Admin")})`);
        await waitFor("!!document.querySelector('main h1, main h2')");
        for (const width of [360, 1366]) {
          await command("Emulation.setDeviceMetricsOverride", { width, height: 850, deviceScaleFactor: 1, mobile: width === 360 });
          assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, `${theme}/${mode}/${width}`);
        }
      }
      const colors = await evaluate<Record<string, string>>(`(() => {
        const host = document.createElement('div'); host.setAttribute('role', 'dialog');
        host.innerHTML = '<div class="table-head">Título</div><input class="field" disabled placeholder="Exemplo"><button class="bg-sky-950 text-sky-100">Selecionado</button><span class="text-slate-400">Ajuda</span>';
        document.body.append(host);
        const style = selector => getComputedStyle(host.querySelector(selector));
        const result = { table: style('.table-head').backgroundColor, selected: style('button').backgroundColor,
          text: style('button').color, muted: style('span').color, field: style('input').backgroundColor,
          ink: getComputedStyle(document.documentElement).color };
        host.remove(); return result;
      })()`);
      assert.equal(colors.table, theme === "light" ? "rgb(238, 242, 247)" : "rgb(18, 34, 56)");
      assert.equal(colors.field, theme === "light" ? "rgb(238, 242, 247)" : "rgb(23, 36, 58)");
      assert.equal(colors.selected, theme === "light" ? "rgb(220, 238, 254)" : "rgb(8, 47, 73)");
      assert.equal(colors.ink, theme === "light" ? "rgb(23, 36, 58)" : "rgb(242, 246, 255)");
      if (theme === "light") {
        assert.equal(colors.text, "rgb(25, 90, 162)");
        assert.equal(colors.muted, "rgb(82, 100, 125)");
        assert.ok(contrast(colors.text, colors.selected) >= 4.5, "seleção legível no calendário");
        assert.ok(contrast(colors.muted, colors.table) >= 4.5, "texto secundário legível nas superfícies claras");
      }
    }
  } finally { await close(); }
});
