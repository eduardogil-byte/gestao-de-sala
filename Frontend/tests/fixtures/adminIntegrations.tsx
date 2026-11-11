import React from "react";
import { createRoot } from "react-dom/client";
import { DataProvider, useData } from "../../src/lib/data";
import { ConfirmationProvider } from "../../src/components/UI";
import { ManagerDashboard } from "../../src/components/ManagerDashboard";
import { Dashboard } from "../../src/pages/Dashboard";
import { Bookings } from "../../src/pages/Bookings";
import { CapabilityRequirements } from "../../src/components/CapabilityRequirements";
import { PedagogicalCatalog } from "../../src/pages/PedagogicalCatalog";
import { RoomTimeline } from "../../src/pages/RoomTimeline";
import { RoomOpportunities } from "../../src/pages/RoomOpportunities";
import { InstructorAgenda } from "../../src/pages/InstructorAgenda";
import { Teachers } from "../../src/pages/Teachers";
import { InstitutionalImport } from "../../src/pages/InstitutionalImport";
import { ExportData } from "../../src/pages/ExportData";
import "../../src/index.css";

const root = createRoot(document.getElementById("root")!);
const requirementPath = "/api/courses/1/modules/2/curricular-units/3/capabilities/4/environment-requirements";
const room = { id: 10, name: "Laboratório sintético", location: "Bloco A", kind: "Laboratorio", seats: 30, desks: 30,
  hasProjector: false, hasTeacherComputer: false, hasInternet: true, active: true, computerGroups: [] };
const report = { semesterId: 1, from: "2027-03-01", to: "2027-03-31", thresholds: { bottleneckPercent: 85, opportunityPercent: 40 },
  physicalOccupiedHours: 4, capacityHours: null, availableHours: null, occupancyPercent: null, outsideCapacityHours: null,
  roomsWithUnknownCapacity: 1, conflictPairs: 0, classification: "Unknown", months: [], warnings: [],
  rooms: [{ roomId: 10, roomName: room.name, kind: room.kind, physicalOccupiedHours: 4, capacityHours: null,
    availableHours: null, occupancyPercent: null, outsideCapacityHours: null, conflictPairs: 0, unclassifiedOccupations: 0,
    classification: "Unknown", warnings: [], shifts: [] }] };
const occupation = { id: 5, roomId: 10, roomName: room.name, date: "2027-03-01", startsAt: "2027-03-01T08:00:00", endsAt: "2027-03-01T12:00:00",
  shiftId: 1, shiftName: "Manhã", kind: "Aula", conflicts: [], actualTeacherId: "t0", actualTeacherName: "Docente 0", actualClassGroupName: "Turma sintética",
  bookingStatus: null, status: "Confirmed", dayStatus: "Letivo", calendarKind: "Presential", curricularUnitName: "UC sintética" };

function Content({ mode, role }: { mode: string; role: string }) {
  const { reload } = useData();
  const user = { id: role === "Admin" ? "admin" : "t0", displayName: role, email: "", roles: [role] };
  return <main className="app-workspace p-4 max-w-5xl mx-auto"><button className="btn-secondary" aria-label="Atualizar dados" onClick={() => void reload()}>Atualizar dados</button>
    {mode === "dashboard" ? <ManagerDashboard admin={role === "Admin"} onTimeline={() => {}} onOpportunity={() => {}} onExport={() => {}} /> :
      mode === "dashboard-full" ? <Dashboard user={user} occupations={[occupation]} navigate={() => {}} openTimeline={() => {}} openOpportunity={() => {}} onExport={() => {}} unread={0} /> :
      mode === "bookings" ? <Bookings user={user} reloadAgenda={async () => {}} /> :
      mode === "requirements" ? <CapabilityRequirements path="/courses/1/modules/2/curricular-units/3/capabilities/4" admin={role === "Admin"} /> :
      mode === "catalog" ? <PedagogicalCatalog user={user} /> :
      mode === "teachers" ? <Teachers user={user} /> :
      mode === "timeline" ? <RoomTimeline user={user} openBookings={() => {}} initialFilter={{ semesterId: 1, roomId: 10, anchor: "2027-03-01" }} /> :
      mode === "opportunities" ? <RoomOpportunities initial={{ semesterId: 1, roomId: 10 }} onTimeline={() => {}} /> :
      mode === "instructor" ? <InstructorAgenda user={user} /> : mode === "import" ? <InstitutionalImport /> :
        mode === "import-docentes" ? <InstitutionalImport initialKind="Docentes" /> : <ExportData />}
  </main>;
}

const api = {
  generation: 0, calls: [] as { path: string; method: string; body: unknown }[],
  pending: [] as { path: string; method: string; body: unknown; resolve: (response: Response) => void }[],
  catalog: {} as Record<string, unknown>, deferred: [] as string[], report, occupation,
  reset(mode = "dashboard", role = "Admin") {
    api.calls = []; api.pending = []; api.deferred = [];
    api.catalog = {
      "/api/rooms": mode === "opportunities" ? [{ ...room, code: "LAB-10" },
        { ...room, id: 11, code: "LAB-11", name: "Laboratório B", seats: 20 },
        { ...room, id: 12, code: "SALA-12", name: "Sala C", kind: "Sala", seats: 15 }] : [room],
      "/api/software": [{ id: 1, name: "CAD" }],
      "/api/resource-catalog": [{ id: 9, name: "Bancada", category: "Equipamento", description: null, active: true }],
      "/api/shifts": [{ id: 1, name: "Manhã", startsAt: "08:00:00", endsAt: "12:00:00" }],
      "/api/teachers": Array.from({ length: 14 }, (_, i) => ({ id: `t${i}`, displayName: `Docente ${i}`, email: mode === "teachers" && role === "Admin" ? `docente${i}@example.test` : null })),
      "/api/teachers/t0/availability": [{ weekday: 1, shiftId: 1 }],
      "/api/teachers/t0/pedagogical-profile": { teacherId: "t0", displayName: "Docente 0", education: "Formação registrada",
        technicalSkills: "Habilidade registrada", professionalKnowledge: "Conhecimento registrado",
        courses: [{ courseId: 1, courseName: "Curso sintético" }],
        curricularUnits: [{ curricularUnitId: 3, unitName: "UC sintética", courseId: 1, courseName: "Curso sintético" }],
        capabilities: [{ curricularCapabilityId: 4, description: "Capacidade sintética", curricularUnitId: 3 }] },
      "/api/semesters": [{ id: 1, name: "Semestre A", startDate: "2027-03-01", endDate: "2027-03-31" },
        { id: 2, name: "Semestre B", startDate: "2027-07-01", endDate: "2027-12-31" }],
      "/api/occupancy-indicators/semesters/1": structuredClone(report),
      "/api/occupancy-indicators/semesters/1?roomId=10": structuredClone(report),
      "/api/occupancy-indicators/compare?firstSemesterId=1&secondSemesterId=2&roomId=10": { first: structuredClone(report), second: { ...structuredClone(report), semesterId: 2 } },
      "/api/courses": [{ id: 1, name: "Curso sintético", code: "C", active: true }],
      "/api/courses/1/modules": [{ id: 2, courseId: 1, name: "Módulo sintético", order: 1 }],
      "/api/courses/1/modules/2/curricular-units": [{ id: 3, courseModuleId: 2, code: "UC", name: "UC sintética", plannedHours: 8 }],
      "/api/courses/1/modules/2/curricular-units/3/capabilities": [{ id: 4, curricularUnitId: 3, description: "Capacidade sintética", contents: "Conteúdo", requiredHours: 8, order: 1 }],
      "/api/courses/1/modules/2/curricular-units/3/capabilities/4/compatibility/rooms?students=1": [
        { roomId: 10, roomName: room.name, classification: "Compatible", findings: [{ requirement: "Software CAD", status: "Met", detail: "Recurso atendido" }] },
        { roomId: 11, roomName: "Laboratório B", classification: "Partial", findings: [{ requirement: "Licença", status: "Unknown", detail: "Validade não comprovada" }] },
        { roomId: 12, roomName: "Sala C", classification: "Incompatible", findings: [{ requirement: "Computadores", status: "NotMet", detail: "Quantidade insuficiente" }] },
      ],
      "/api/opportunities/semesters/1/rooms/10/capabilities/4/periods?shiftId=1&students=1&from=2027-03-01&to=2027-03-31&weekdaysMask=62": {
        semesterId: 1, roomId: 10, capabilityId: 4, shiftId: 1, pedagogicalHours: 8, shiftHours: 4,
        requiredMeetings: 2, physicalHours: 8, potentiallyFreeMeetings: 0, suitableMeetings: 0,
        compatibility: "Compatible", availability: "UnknownCapacity", findings: [], dates: [],
      },
      "/api/courses/1/modules/2/curricular-units/3/workload-summary?hoursPerShift=4": { curricularUnitId: 3, plannedHours: 8, capabilityHours: 8,
        status: "Balanced", missingHours: 0, excessHours: 0, hoursPerShift: 4, requiredMeetings: 2 },
      [requirementPath]: { registered: false },
    };
    root.render(<DataProvider key={++api.generation}><ConfirmationProvider><Content mode={mode} role={role} /></ConfirmationProvider></DataProvider>);
  },
  reply(path: string, data: unknown, status = 200) {
    const i = api.pending.findIndex((row) => row.path === path);
    if (i < 0) throw new Error(`Missing request: ${path}`);
    api.pending.splice(i, 1)[0].resolve(new Response(status === 204 ? null : JSON.stringify(data), { status }));
  },
  select(label: string, value: string) {
    const element = [...document.querySelectorAll("label")].find((item) => item.querySelector("span")?.textContent === label)?.querySelector("select");
    if (!element) throw new Error(`Missing select: ${label}`);
    element.value = value; element.dispatchEvent(new Event("change", { bubbles: true }));
  },
  input(label: string, value: string) {
    const element = [...document.querySelectorAll("label")].find((item) => item.querySelector("span")?.textContent === label)?.querySelector("input");
    if (!element) throw new Error(`Missing input: ${label}`);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  },
  click(text: string) {
    const element = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === text);
    if (!element || element.disabled) throw new Error(`Missing or disabled button: ${text}`);
    element.click();
  },
};
window.fetch = async (input, init) => {
  const path = String(input), method = init?.method ?? "GET", body = init?.body instanceof FormData ? null : init?.body ? JSON.parse(String(init.body)) : null;
  api.calls.push({ path, method, body });
  if (method !== "GET" || api.deferred.includes(path) || path.endsWith("/operating-shifts"))
    return new Promise<Response>((resolve) => api.pending.push({ path, method, body, resolve }));
  if (path.startsWith("/api/agenda?")) {
    const filters = new URL(path, location.origin).searchParams;
    const rows = [occupation, { ...occupation, id: 6, date: "2027-03-15", startsAt: "2027-03-15T08:00:00", endsAt: "2027-03-15T12:00:00" }];
    return new Response(JSON.stringify(rows.filter((item) => item.date >= (filters.get("from")?.slice(0, 10) ?? "") &&
      item.date < (filters.get("to")?.slice(0, 10) ?? "9999-12-31") &&
      (!filters.get("roomId") || item.roomId === Number(filters.get("roomId"))))));
  }
  if (path.startsWith("/api/opportunities/") && path.includes("/capabilities?"))
    return new Response(JSON.stringify([{ capabilityId: 4, courseId: 1, courseName: "Curso sintético", unitName: "UC sintética",
      description: "Capacidade sintética", requiredHours: 8, classification: "Partial", findings: [] }]));
  return new Response(JSON.stringify(api.catalog[path] ?? []));
};
(window as unknown as { adminTest: typeof api }).adminTest = api;
api.reset();
