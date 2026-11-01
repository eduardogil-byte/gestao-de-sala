import assert from "node:assert/strict";
import test from "node:test";
import {
  canEditCatalog, catalogErrorMessage, catalogPath, parseHours, parseOrder,
  shiftHours, workloadText,
} from "../src/lib/pedagogicalCatalog.ts";

test("caminhos mantêm curso, módulo e UC no contexto selecionado", () => {
  assert.equal(catalogPath(), "/courses");
  assert.equal(catalogPath(2), "/courses/2/modules");
  assert.equal(catalogPath(2, 5), "/courses/2/modules/5/curricular-units");
  assert.equal(catalogPath(2, 5, 8), "/courses/2/modules/5/curricular-units/8");
});

test("formulários preservam horas fracionárias e CH indefinida", () => {
  assert.equal(parseHours("12,50"), 12.5);
  assert.equal(parseHours(" 1.25 "), 1.25);
  assert.equal(parseHours("", true), null);
  assert.throws(() => parseHours(""));
  assert.throws(() => parseHours("0", true));
  assert.throws(() => parseHours("1,234"));
  assert.throws(() => parseHours("24.01", false, 24));
  assert.equal(parseOrder(" 3 "), 3);
  assert.throws(() => parseOrder("0"));
  assert.throws(() => parseOrder("1.5"));
});

test("duração do turno cadastrado não é arredondada", () => {
  const shift = { id: 1, name: "Manhã", startsAt: "08:00:00", endsAt: "12:00:00" };
  assert.equal(shiftHours(shift), "4");
  assert.equal(shiftHours({ ...shift, endsAt: "09:15:00" }), "1.25");
  assert.equal(shiftHours({ ...shift, endsAt: "09:01:00" }), null);
});

test("resumo traduz os estados recebidos da API sem recalcular o estado", () => {
  const base = {
    curricularUnitId: 8, plannedHours: 4, capabilityHours: 2, hoursPerShift: 4,
    missingHours: 2, excessHours: 0, requiredMeetings: 1,
  };
  assert.equal(workloadText({ ...base, status: "Undefined" }), "CH não definida");
  assert.equal(workloadText({ ...base, status: "Balanced" }), "Carga horária completa");
  assert.equal(workloadText({ ...base, status: "MissingHours" }), "Faltam 2 horas");
  assert.equal(workloadText({ ...base, status: "ExcessHours", excessHours: 1.25 }), "Excedem 1,25 horas");
});

test("escrita é mostrada só ao administrador e erros comuns têm mensagem clara", () => {
  assert.equal(canEditCatalog(["Professor"]), false);
  assert.equal(canEditCatalog(["Professor", "Admin"]), true);
  assert.match(catalogErrorMessage({ status: 403 }), /permissão/);
  assert.match(catalogErrorMessage({ status: 404 }), /não encontrado/);
  assert.equal(catalogErrorMessage(Object.assign(new Error("Código repetido"), { status: 409 })),
    "Código repetido");
  assert.equal(catalogErrorMessage(Object.assign(new Error("Campo inválido"), { status: 400 })),
    "Campo inválido");
});
