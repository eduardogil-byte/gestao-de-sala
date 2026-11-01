import assert from "node:assert/strict";
import test from "node:test";
import { agendaPath, datesBetween, indexOccupations, isAgendaOccupation, movePeriod, period, summarize, weekStart } from "../src/lib/roomTimeline.ts";
import type { AgendaOccupation, Semester } from "../src/types.ts";

const semester: Semester = { id: 4, name: "2027/1", startDate: "2027-02-03", endDate: "2027-07-17" };
const occupation = (id: number, changes: Partial<AgendaOccupation> = {}) => ({
  id, roomId: 1, date: "2027-03-01", shiftId: 2, conflicts: [], calendarKind: null,
  ...changes,
}) as AgendaOccupation;

test("semana começa na segunda, inclusive quando a âncora é domingo", () => {
  assert.equal(weekStart("2027-03-07"), "2027-03-01");
  assert.equal(weekStart("2027-03-01"), "2027-03-01");
});

test("períodos usam limite exclusivo e respeitam as datas cadastradas do semestre", () => {
  assert.deepEqual(period("week", "2027-02-04", semester), { from: "2027-02-03", to: "2027-02-08" });
  assert.deepEqual(period("month", "2027-07-10", semester), { from: "2027-07-01", to: "2027-07-18" });
  assert.deepEqual(period("semester", "2027-01-01", semester), { from: "2027-02-03", to: "2027-07-18" });
  assert.equal(period("month", "2027-08-01", semester), null);
  assert.equal(period("semester", "2027-01-01"), null);
});

test("navegação atravessa anos e mantém dias válidos", () => {
  assert.equal(movePeriod("week", "2027-01-03", -1), "2026-12-27");
  assert.equal(movePeriod("month", "2027-01-31", -1), "2026-12-15");
  assert.deepEqual(datesBetween("2028-02-28", "2028-03-02"), ["2028-02-28", "2028-02-29", "2028-03-01"]);
});

test("consulta usa a API existente, período e filtros informados", () => {
  const path = agendaPath({ from: "2027-03-01", to: "2027-03-08" }, {
    semesterId: "4", roomId: "2", teacherId: "teacher 1", classGroupId: "3", shiftId: "", kind: "Aula",
  });
  const url = new URL(path, "http://localhost");
  assert.equal(url.pathname, "/agenda");
  assert.equal(url.searchParams.get("to"), "2027-03-08T00:00:00");
  assert.equal(url.searchParams.get("teacherId"), "teacher 1");
  assert.equal(url.searchParams.get("classGroupId"), "3");
  assert.equal(url.searchParams.has("shiftId"), false);
});

test("ocupações simultâneas permanecem na mesma célula e ocupações sem turno não desaparecem", () => {
  const items = [occupation(1), occupation(2, { conflicts: ["Room"] }), occupation(3, { shiftId: null })];
  const index = indexOccupations(items);
  assert.deepEqual(index.slots.get("1|2027-03-01|2")?.map((item) => item.id), [1, 2]);
  assert.deepEqual(index.slots.get("1|2027-03-01|other")?.map((item) => item.id), [3]);
  assert.equal(index.days.get("2027-03-01")?.length, 3);
  assert.equal(index.slots.has("1|2027-03-02|2"), false);
});

test("resumo conta conflitos e dias especiais sem transformar EAD em período livre", () => {
  assert.deepEqual(summarize([occupation(1, { conflicts: ["Room"], calendarKind: "Ead" }),
    occupation(2, { calendarKind: "Ead" }), occupation(3, { calendarKind: "Presential", dayStatus: "NaoLetivo" })]),
  { count: 3, conflicts: 1, specialDays: ["Ead", "NaoLetivo"] });
  assert.deepEqual(summarize([]), { count: 0, conflicts: 0, specialDays: [] });
});

test("dados incompletos ou malformados impedem a apresentação de uma grade enganosa", () => {
  const valid = { ...occupation(1), startsAt: "2027-03-01T08:00:00", endsAt: "2027-03-01T12:00:00", kind: "Aula" };
  assert.equal(isAgendaOccupation(valid), true);
  assert.equal(isAgendaOccupation({ ...valid, date: undefined }), false);
  assert.equal(isAgendaOccupation({ ...valid, shiftId: undefined }), false);
  assert.equal(isAgendaOccupation({ ...valid, conflicts: null }), false);
  assert.equal(isAgendaOccupation({ ...valid, roomId: "1" }), false);
});
