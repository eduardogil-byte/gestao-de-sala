import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("recorrência começa na data escolhida e propõe apenas os dias selecionados", async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { firstSelected, actualDates } = await server.ssrLoadModule("/src/components/BookingForm.tsx");
    assert.equal(firstSelected("2026-11-04", [1, 3]), "2026-11-04");
    assert.deepEqual(actualDates("2026-11-04", "2026-11-11", [1, 3]), ["2026-11-04", "2026-11-09", "2026-11-11"]);
    assert.deepEqual(actualDates("2026-11-04", "2026-11-03", [3]), []);
    const { uniqueShift } = await server.ssrLoadModule("/src/components/BookingForm.tsx");
    assert.equal(uniqueShift([1, 1]), 1);
    assert.equal(uniqueShift([1, 2]), null);
    assert.equal(uniqueShift([]), null);
    const { weekDates, recurrenceLimit, WeeklyCalendar, RepeatUntilCalendar } = await server.ssrLoadModule("/src/components/BookingCalendars.tsx");
    assert.deepEqual(weekDates("2026-11-11"), ["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"]);
    assert.equal(recurrenceLimit("2026-11-11"), "2027-11-11");
    const week = renderToStaticMarkup(createElement(WeeklyCalendar, { date: "2026-11-11", weekdays: [3], recurring: false, today: "2026-11-11", onSelect: () => {} }));
    assert.match(week, /Semana anterior/);
    assert.match(week, /Próxima semana/);
    assert.match(week, /Hoje/);
    assert.equal((week.match(/aria-pressed=/g) ?? []).length, 7);
    const month = renderToStaticMarkup(createElement(RepeatUntilCalendar, { start: "2026-11-11", value: "2026-11-11", weekdays: [3], today: "2026-11-11", onClose: () => {}, onConfirm: () => {} }));
    assert.match(month, /Cancelar/);
    assert.match(month, />OK<\/button>/);
    assert.match(month, /disabled=""/);
    const { defaultNeed, NeedFields } = await server.ssrLoadModule("/src/components/NeedFields.tsx");
    assert.equal(defaultNeed.minRamGb, 0);
    const resources = renderToStaticMarkup(createElement(NeedFields, { value: { ...defaultNeed, minRamGb: 8 }, onChange: () => {}, software: [{ id: 1, name: "CAD" }], resourcePicker: true }));
    assert.match(resources, /Adicionar recurso/);
    assert.match(resources, /Nenhum software selecionado/);
    const { ConfirmationProvider } = await server.ssrLoadModule("/src/components/UI.tsx");
    const markup = renderToStaticMarkup(createElement(ConfirmationProvider, null,
      createElement((await server.ssrLoadModule("/src/components/BookingForm.tsx")).BookingForm,
        { user: { id: "p", displayName: "Professor", email: "", roles: ["Professor"] }, onCreated: () => {} })));
    assert.match(markup, /Turma \(opcional\)/);
    assert.match(markup, /Atividade \/ justificativa \(obrigatória\)/);
    assert.match(markup, /Continuar para escolha da sala/);
  } finally { await server.close(); }
});
