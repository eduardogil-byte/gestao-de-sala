import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { capabilitiesPath, periodsPath, validCapabilities, validPeriods } from "../src/lib/roomOpportunities.ts";
import type { SemesterIndicators } from "../src/lib/occupancyIndicators.ts";

test("consulta administrativa mantém semestre, ambiente, alunos, capacidade e período", () => {
  assert.equal(capabilitiesPath(2, 3, 25),
    "/opportunities/semesters/2/rooms/3/capabilities?students=25");
  assert.equal(capabilitiesPath(2, 3, 25, 7),
    "/opportunities/semesters/2/rooms/3/capabilities?students=25&courseId=7");
  assert.equal(periodsPath(2, 3, 11, 4, 25, "2027-03-01", "2027-03-31", 62),
    "/opportunities/semesters/2/rooms/3/capabilities/11/periods?shiftId=4&students=25&from=2027-03-01&to=2027-03-31&weekdaysMask=62");
});

test("respostas incompletas não viram oportunidades ou datas livres", () => {
  const capability = { capabilityId: 1, courseName: "Curso", unitName: "UC", description: "Atividade",
    requiredHours: 10, classification: "Partial", findings: [{ requirement: "software", status: "Unknown", detail: "Licenças não informadas" }] };
  assert.equal(validCapabilities([capability]), true);
  assert.equal(validCapabilities([{ ...capability, findings: null }]), false);
  assert.equal(validCapabilities([{ ...capability, classification: "Compatible", requiredHours: undefined }]), false);
  const periods = { semesterId: 2, roomId: 3, capabilityId: 1, shiftId: 4,
    pedagogicalHours: 10, shiftHours: 4, requiredMeetings: 3, physicalHours: 12, potentiallyFreeMeetings: 1,
    suitableMeetings: 0, compatibility: "Partial", availability: "Known", findings: capability.findings,
    dates: [{ date: "2027-03-01", status: "Potential", detail: "Revalidar" }] };
  assert.equal(validPeriods(periods), true);
  assert.equal(validPeriods({ ...periods, dates: null }), false);
  assert.equal(validPeriods({ ...periods, dates: [{ date: "2027-03-01", status: "Available", detail: "Garantido" }] }), false);
});

test("tela de análise mantém estados vazios e acesso ao cronograma; dashboard oferece entrada", async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { RoomOpportunities } = await server.ssrLoadModule("/src/pages/RoomOpportunities.tsx");
    const page = renderToStaticMarkup(createElement(RoomOpportunities, { onTimeline: () => {} }));
    assert.match(page, /Oportunidades de Ambientes/);
    assert.match(page, /Nenhum semestre cadastrado/);
    assert.match(page, /Nenhuma consulta cria reserva/);
    const { OccupancyView } = await server.ssrLoadModule("/src/components/ManagerDashboard.tsx");
    const report: SemesterIndicators = {
      semesterId: 2, from: "2027-03-01", to: "2027-07-31",
      thresholds: { bottleneckPercent: 85, opportunityPercent: 40 },
      physicalOccupiedHours: 10, capacityHours: 100, availableHours: 90,
      occupancyPercent: 10, outsideCapacityHours: 0, roomsWithUnknownCapacity: 0,
      conflictPairs: 0, classification: "Opportunity", warnings: [], months: [],
      rooms: [{ roomId: 3, roomName: "Laboratório", kind: "Laboratorio",
        physicalOccupiedHours: 10, capacityHours: 100, availableHours: 90,
        occupancyPercent: 10, outsideCapacityHours: 0, conflictPairs: 0,
        unclassifiedOccupations: 0, classification: "Opportunity", warnings: [], shifts: [] }],
    };
    const dashboard = renderToStaticMarkup(createElement(OccupancyView, {
      report, onTimeline: () => {}, onOpportunity: () => {},
    }));
    assert.match(dashboard, /Analisar oportunidades/);
    assert.match(dashboard, /Ver cronograma/);
  } finally { await server.close(); }
});
