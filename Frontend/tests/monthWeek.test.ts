import assert from "node:assert/strict";
import test from "node:test";
import { formatMonthWeek } from "../src/lib/utils.ts";
import { movePeriod } from "../src/lib/roomTimeline.ts";

test("semanas de domingo a sábado contam meses com quatro, cinco e seis semanas", () => {
  assert.equal(formatMonthWeek("2026-02-08"), "Fevereiro · Semana 2/4");
  assert.equal(formatMonthWeek("2026-11-15"), "Novembro · Semana 3/5");
  assert.equal(formatMonthWeek("2026-11-21"), "Novembro · Semana 3/5");
  assert.equal(formatMonthWeek("2026-08-02"), "Agosto · Semana 2/6");
  assert.equal(formatMonthWeek("2028-02-20"), "Fevereiro · Semana 4/5");
});

test("semanas compartilhadas identificam os dois meses, inclusive no ano bissexto", () => {
  assert.equal(formatMonthWeek("2026-08-01"), "Julho · Semana 5/5 / Agosto · Semana 1/6");
  assert.equal(formatMonthWeek("2026-08-31"), "Agosto · Semana 6/6 / Setembro · Semana 1/5");
  assert.equal(formatMonthWeek("2028-02-29"), "Fevereiro · Semana 5/5 / Março · Semana 1/5");
});

test("navegação semanal atualiza o rótulo e distingue anos na semana compartilhada", () => {
  const date = "2027-01-03";
  const previous = movePeriod("week", date, -1);
  assert.equal(formatMonthWeek(previous), "Dezembro de 2026 · Semana 5/5 / Janeiro de 2027 · Semana 1/6");
  assert.equal(formatMonthWeek(movePeriod("week", previous, 1)), "Janeiro · Semana 2/6");
  assert.equal(formatMonthWeek(movePeriod("week", "2026-11-15", 1)), "Novembro · Semana 4/5");
});

test("data inválida não gera rótulos numéricos enganosos", () => {
  assert.equal(formatMonthWeek(""), "—");
  assert.equal(formatMonthWeek("inválida"), "—");
});
