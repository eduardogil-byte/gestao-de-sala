import assert from "node:assert/strict";
import test from "node:test";
import { agendaErrorMessage, assignmentConflicts, loadSemesterAgenda, semesterChunks, teacherActivities, teacherWorkload } from "../src/lib/instructorAgenda.ts";
import type { AgendaOccupation, Assignment, Semester, Shift } from "../src/types.ts";

const semester: Semester = { id: 1, name: "2026/1", startDate: "2026-01-01", endDate: "2026-06-30" };
const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });
const shifts: Shift[] = [
  { id: 1, name: "Manhã", startsAt: "08:00:00", endsAt: "12:00:00" },
  { id: 2, name: "Tarde", startsAt: "10:00:00", endsAt: "14:00:00" },
];
const occupation = (id: number, overrides: Partial<AgendaOccupation> = {}): AgendaOccupation => ({
  id, roomId: 1, roomName: "Laboratório 1", date: "2026-03-10", startsAt: "2026-03-10T08:00:00",
  endsAt: "2026-03-10T12:00:00", kind: "Aula", dayStatus: "Letivo", description: null,
  originalTeacherId: "t1", actualTeacherId: "t1", isBorrowed: false, originalClassGroupId: 1,
  actualClassGroupId: 1, weeklyClassId: null, bookingRequestId: 1, loanId: null,
  shiftId: 1, shiftName: "Manhã", calendarKind: "Presential", calendarReason: null,
  status: "Ativa", source: "Booking", actualTeacherName: "João", actualClassGroupName: "M1",
  courseName: "Curso", curricularUnitId: 1, curricularUnitName: "Desenho", curricularCapabilityDescription: null,
  bookingStatus: "Aprovada", conflicts: [], ...overrides,
});

test("consulta o semestre pela API existente com filtro de professor", async () => {
  const paths: string[] = [];
  const rows = await loadSemesterAgenda(semester, "t1", undefined, async (path) => {
    paths.push(path); return [occupation(1)];
  });
  assert.equal(rows.length, 1);
  assert.equal(paths.length, 1);
  assert.match(paths[0], /^\/agenda\?/);
  assert.match(paths[0], /semesterId=1/);
  assert.match(paths[0], /teacherId=t1/);
});

test("divide semestre longo e só entrega lista completa, sem duplicar IDs", async () => {
  const long: Semester = { ...semester, endDate: "2027-02-01" };
  const chunks = semesterChunks(long);
  assert.equal(chunks[0].from, long.startDate);
  assert.equal(chunks.at(-1)?.to, "2027-02-02");
  let calls = 0;
  const rows = await loadSemesterAgenda(long, null, undefined, async () => {
    calls++; return [occupation(1)];
  });
  assert.equal(calls, chunks.length);
  assert.equal(rows.length, 1);
});

test("limite de 10000 tenta meses e falha de um mês rejeita sem parcial", async () => {
  let calls = 0;
  await assert.rejects(loadSemesterAgenda(semester, null, undefined, async () => {
    calls++;
    if (calls === 1) throw httpError("mais de 10000 ocupações", 400);
    if (calls === 3) throw httpError("falha na consulta", 503);
    return [occupation(1)];
  }), /falha na consulta/);
  assert.equal(calls, 3);
});

test("rejeita resposta incompleta em vez de calcular carga menor", async () => {
  await assert.rejects(loadSemesterAgenda(semester, "t1", undefined, async () => [{ id: 1 }]), /incompletas/);
});

test("horas usam duração cadastrada, união de intervalos e professor efetivo", () => {
  const items = [occupation(1), occupation(1), occupation(2, { shiftId: 2, shiftName: "Tarde", conflicts: ["Teacher"] }),
    occupation(3, { actualTeacherId: "t2", originalTeacherId: "t1", isBorrowed: true }),
    occupation(4, { kind: "Bloqueio" })];
  assert.equal(teacherWorkload(items, shifts, "t1").hours, 6);
  assert.equal(teacherWorkload(items, shifts, "t1").activities, 2);
  assert.equal(teacherWorkload(items, shifts, "t1").conflicts, 1);
  assert.equal(teacherWorkload(items, shifts, "t2").hours, 4);
  assert.deepEqual(teacherActivities(items, "t2").map((row) => row.id), [3]);
  assert.equal(teacherWorkload(items, shifts, "sem-aulas").hours, 0);
});

test("ocupação movimentada aparece uma vez na posição atual, e turno desconhecido não soma", () => {
  const moved = occupation(1, { roomId: 2, roomName: "Laboratório 2", date: "2026-03-11" });
  const unknown = occupation(2, { shiftId: null, shiftName: null });
  const total = teacherWorkload([moved, unknown], shifts, "t1");
  assert.equal(total.hours, 4);
  assert.equal(total.withoutRegisteredShift, 1);
  assert.equal(teacherActivities([moved], "t1")[0].roomName, "Laboratório 2");
});

test("reserva pendente inconsistente permanece visível, mas não acrescenta horas confirmadas", () => {
  const pending = occupation(1, { bookingStatus: "Pendente", conflicts: ["BookingStatus"] });
  const workload = teacherWorkload([pending], shifts, "t1");
  assert.equal(workload.activities, 1);
  assert.equal(workload.hours, 0);
  assert.equal(workload.withoutApprovedBooking, 1);
  assert.equal(workload.conflicts, 1);
});

test("conflito pedagógico preserva ambas atribuições", () => {
  const base = { id: 1, teacherId: "t1", semesterId: 1, weekday: 1, preferredShiftId: 1,
    endedAtUtc: null } as Assignment;
  const conflicts = assignmentConflicts([base, { ...base, id: 2 }, { ...base, id: 3, weekday: 2 }]);
  assert.deepEqual([...conflicts], [1, 2]);
});

test("erros de autorização e de limite não expõem dados parciais", () => {
  assert.match(agendaErrorMessage(httpError("detalhe restrito", 403)), /não tem permissão/);
  assert.doesNotMatch(agendaErrorMessage(httpError("detalhe restrito", 403)), /detalhe restrito/);
  assert.match(agendaErrorMessage(httpError("mais de 10000 ocupações", 400)), /limite de ocupações/);
  assert.equal(agendaErrorMessage(httpError("Falha de conexão", 0)), "Falha de conexão");
});
