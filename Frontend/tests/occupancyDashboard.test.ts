import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { comparisonPath, indicatorErrorMessage, indicatorPath, isSemesterIndicators, orderedRooms, settleCurrent, shiftDistribution, variationPoints,
  type SemesterIndicators } from "../src/lib/occupancyIndicators.ts";

const report: SemesterIndicators = {
  semesterId: 1, from: "2027-02-01", to: "2027-07-31",
  thresholds: { bottleneckPercent: 85, opportunityPercent: 40 },
  physicalOccupiedHours: 94, capacityHours: null, availableHours: null,
  occupancyPercent: null, outsideCapacityHours: null, roomsWithUnknownCapacity: 1,
  conflictPairs: 2, classification: "Unknown", warnings: ["Cobertura parcial"],
  rooms: [
    { roomId: 1, roomName: "Oficina sem configuração", kind: "Laboratorio", physicalOccupiedHours: 4,
      capacityHours: null, availableHours: null, occupancyPercent: null, outsideCapacityHours: null,
      conflictPairs: 0, unclassifiedOccupations: 0, classification: "Unknown", warnings: [],
      shifts: [{ shiftId: 2, shiftName: "Tarde", occupiedHours: 4, capacityHours: null,
        availableHours: null, occupancyPercent: null, classification: "Unknown", warnings: [] }] },
    { roomId: 2, roomName: "Laboratório A", kind: "Laboratorio", physicalOccupiedHours: 90,
      capacityHours: 100, availableHours: 10, occupancyPercent: 90, outsideCapacityHours: 0,
      conflictPairs: 2, unclassifiedOccupations: 0, classification: "Bottleneck", warnings: [],
      shifts: [{ shiftId: 1, shiftName: "Manhã", occupiedHours: 90, capacityHours: 100,
        availableHours: 10, occupancyPercent: 90, classification: "Bottleneck", warnings: [] }] },
    { roomId: 3, roomName: "Laboratório B", kind: "Laboratorio", physicalOccupiedHours: 0,
      capacityHours: 100, availableHours: 100, occupancyPercent: 0, outsideCapacityHours: 0,
      conflictPairs: 0, unclassifiedOccupations: 0, classification: "Opportunity", warnings: [], shifts: [] },
  ],
  months: [{ year: 2027, month: 2, physicalOccupiedHours: 94, daysWithOccupations: 5 }],
};

test("usa as rotas SG-23 e mantém filtro de ambiente no escopo da consulta", () => {
  assert.equal(indicatorPath(1), "/occupancy-indicators/semesters/1");
  assert.equal(indicatorPath(1, 2), "/occupancy-indicators/semesters/1?roomId=2");
  assert.equal(comparisonPath(1, 3, 2), "/occupancy-indicators/compare?firstSemesterId=1&secondSemesterId=3&roomId=2");
});

test("ordena percentuais sem tratar capacidade desconhecida como menor ocupação", () => {
  assert.deepEqual(orderedRooms(report.rooms).map((room) => room.roomId), [2, 3, 1]);
});

test("turnos agregam somente horas fornecidas pelo backend e preservam capacidade desconhecida", () => {
  const shifts = shiftDistribution(report);
  assert.deepEqual(shifts.map((shift) => [shift.name, shift.occupied, shift.known, shift.unknown]),
    [["Tarde", 4, 0, 1], ["Manhã", 90, 1, 0]]);
});

test("variação só aparece quando ambos os percentuais gerais têm base completa", () => {
  const first = { ...report, occupancyPercent: 90, capacityHours: 100, roomsWithUnknownCapacity: 0 };
  const second = { ...first, occupancyPercent: 70, capacityHours: 200 };
  assert.equal(variationPoints(first, second), -20);
  assert.equal(variationPoints(report, second), null);
  assert.equal(variationPoints(first, { ...second, occupancyPercent: null }), null);
  assert.equal(variationPoints({ ...first, capacityHours: null }, second), null);
});

test("rejeita indicadores incompletos antes de apresentar sucesso", () => {
  assert.equal(isSemesterIndicators(report), true);
  assert.equal(isSemesterIndicators({ ...report, rooms: null }), false);
  assert.equal(isSemesterIndicators({ ...report, rooms: [{ ...report.rooms[0], capacityHours: undefined }] }), false);
  assert.equal(isSemesterIndicators({ ...report, occupancyPercent: undefined }), false);
});

test("erros HTTP, conexão e 403 apresentam mensagens sem dados gerenciais", () => {
  assert.match(indicatorErrorMessage(Object.assign(new Error("Acesso negado"), { status: 403 })), /Sem permissão/);
  assert.equal(indicatorErrorMessage(Object.assign(new Error("Erro na solicitação (500)."), { status: 500 })), "Erro na solicitação (500).");
  assert.equal(indicatorErrorMessage(Object.assign(new Error("Não foi possível conectar à API."), { status: 0 })), "Não foi possível conectar à API.");
});

test("resposta antiga não substitui a consulta mais recente", async () => {
  let resolveOld!: (value: string) => void;
  let resolveNew!: (value: string) => void;
  const oldRequest = new Promise<string>((resolve) => { resolveOld = resolve; });
  const newRequest = new Promise<string>((resolve) => { resolveNew = resolve; });
  const shown: string[] = [];
  let oldActive = true;
  const oldSettled = settleCurrent(oldRequest, () => oldActive, (value) => shown.push(value), () => {}, () => {});
  oldActive = false;
  const newSettled = settleCurrent(newRequest, () => true, (value) => shown.push(value), () => {}, () => {});
  resolveNew("filtro novo");
  resolveOld("filtro antigo");
  await Promise.all([oldSettled, newSettled]);
  assert.deepEqual(shown, ["filtro novo"]);
});

test("painel mostra resumo, classificação, distribuição, limiares e limitação de capacidade", async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { OccupancyView, ComparisonView } = await server.ssrLoadModule("/src/components/ManagerDashboard.tsx");
    const markup = renderToStaticMarkup(createElement(OccupancyView, { report, onTimeline: () => {} }));
    assert.match(markup, /Resumo do semestre/);
    assert.match(markup, /94 h/);
    assert.match(markup, /100 h/);
    assert.match(markup, /10 h/);
    assert.match(markup, /percentual geral está indeterminado/);
    assert.doesNotMatch(markup, /45%/);
    assert.match(markup, /Laboratório A/);
    assert.match(markup, /90% · Gargalo/);
    assert.match(markup, /0% · Oportunidade/);
    assert.match(markup, /Oficina sem configuração/);
    assert.match(markup, /Percentual indeterminado/);
    assert.match(markup, /Ocupação por turno/);
    assert.match(markup, /Tarde/);
    assert.match(markup, /fevereiro de 2027/);
    assert.match(markup, /Ver cronograma/);
    const comparison = renderToStaticMarkup(createElement(ComparisonView, {
      first: report, second: { ...report, semesterId: 2, occupancyPercent: 70, capacityHours: 200 },
      firstName: "2027.1", secondName: "2027.2",
    }));
    assert.match(comparison, /2027.1/);
    assert.match(comparison, /2027.2/);
    assert.match(comparison, /falta base comparável completa/);
  } finally { await server.close(); }
});

test("sem ocupações e sem gráficos apresenta estados vazios sem inventar percentual", async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { OccupancyView } = await server.ssrLoadModule("/src/components/ManagerDashboard.tsx");
    const empty = { ...report, physicalOccupiedHours: 0, rooms: [], months: [], roomsWithUnknownCapacity: 0,
      occupancyPercent: null, warnings: [] };
    const markup = renderToStaticMarkup(createElement(OccupancyView, { report: empty, onTimeline: () => {} }));
    assert.match(markup, /Nenhum ambiente cadastrado/);
    assert.match(markup, /Sem distribuição por turno/);
    assert.match(markup, /Sem distribuição mensal/);
    assert.doesNotMatch(markup, /0% · Oportunidade/);
  } finally { await server.close(); }
});

test("dashboard usa dias e turnos reais, identifica código e limita filtro de tipo à lista", async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { OccupancyView } = await server.ssrLoadModule("/src/components/ManagerDashboard.tsx");
    const enriched = { ...report, daysWithOccupations: 5, rooms: report.rooms.map((room) => room.roomId === 2
      ? { ...room, kind: "Sala", daysWithOccupations: 4, unoccupiedSlots: 3,
        shifts: [{ ...room.shifts[0], occupancyPercent: 90 }] } : room) };
    const markup = renderToStaticMarkup(createElement(OccupancyView, { report: enriched,
      roomType: "Sala", roomCodes: { 2: "SALA-02" }, onTimeline: () => {} }));
    assert.match(markup, /SALA-02 · Laboratório A/);
    assert.match(markup, /Dias com ocupações: 4/);
    assert.match(markup, /Turnos livres: 3/);
    assert.match(markup, /Manhã/);
    assert.match(markup, /90% · Gargalo/);
    assert.match(markup, /tipo refina esta lista/);
    assert.match(markup, /Dias disponíveis, total de capacidades/);
    assert.doesNotMatch(markup, /Oficina sem configuração/);
    assert.doesNotMatch(markup, /Laboratório B/);
  } finally { await server.close(); }
});

test("capacidade indefinida impede exibir percentual mesmo se uma resposta inconsistente trouxer um número", async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { OccupancyView } = await server.ssrLoadModule("/src/components/ManagerDashboard.tsx");
    const inconsistent = { ...report, occupancyPercent: 77, rooms: [{ ...report.rooms[0], occupancyPercent: 77,
      shifts: [{ ...report.rooms[0].shifts[0], occupancyPercent: 77 }] }] };
    const markup = renderToStaticMarkup(createElement(OccupancyView, { report: inconsistent, onTimeline: () => {} }));
    assert.match(markup, /Indeterminado/);
    assert.doesNotMatch(markup, /77%/);
  } finally { await server.close(); }
});

test("indicadores gerenciais aparecem só para Admin; visão do professor permanece", async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { Dashboard } = await server.ssrLoadModule("/src/pages/Dashboard.tsx");
    const props = { navigate: () => {}, openTimeline: () => {}, openOpportunity: () => {}, onExport: () => {}, unread: 2, occupations: [] };
    const admin = renderToStaticMarkup(createElement(Dashboard, {
      ...props, user: { id: "a", displayName: "Admin", email: "", roles: ["Admin"] },
    }));
    const teacher = renderToStaticMarkup(createElement(Dashboard, {
      ...props, user: { id: "p", displayName: "Professor", email: "", roles: ["Professor"] },
    }));
    assert.match(admin, /Dashboard gerencial de ocupação/);
    assert.doesNotMatch(teacher, /Dashboard gerencial de ocupação/);
    assert.doesNotMatch(teacher, /Utilização dos ambientes|Ambientes cadastrados|Instrutores<\/span>/);
    assert.match(teacher, /Próximas aulas e reservas/);
    assert.match(teacher, /2 aviso\(s\) não lido\(s\)/);
    assert.match(teacher, /Disponibilidade dos ambientes/);
    const withoutCount = renderToStaticMarkup(createElement(Dashboard, {
      ...props, unread: null, user: { id: "p", displayName: "Professor", email: "", roles: ["Professor"] },
    }));
    assert.match(withoutCount, /Não foi possível consultar avisos agora/);
    assert.doesNotMatch(withoutCount, /Nenhum aviso não lido/);
  } finally { await server.close(); }
});
