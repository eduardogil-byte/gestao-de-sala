import { agendaPath, datesBetween, isAgendaOccupation } from "./roomTimeline.ts";
import { nextDate, resultMessage } from "./utils.ts";
import type { AgendaOccupation, Assignment, Semester, Shift } from "../types";

type Reader = (path: string, signal?: AbortSignal) => Promise<unknown>;

export function agendaErrorMessage(reason: unknown) {
  if (reason instanceof Error && "status" in reason && reason.status === 403)
    return "Você não tem permissão para consultar esta agenda.";
  if (reason instanceof Error && "status" in reason && reason.status === 400)
    return "Não foi possível carregar todo o semestre: intervalo inválido ou limite de ocupações excedido. Consulte um período menor no Cronograma de Ambientes. " + reason.message;
  return resultMessage(reason);
}

function checkRows(value: unknown): AgendaOccupation[] {
  if (!Array.isArray(value) || !value.every((item) => isAgendaOccupation(item) &&
    (typeof item.actualTeacherId === "string" || item.actualTeacherId === null) &&
    typeof item.roomName === "string"))
    throw new Error("A API retornou atividades incompletas. A carga horária não pode ser calculada com segurança.");
  return value;
}

export function semesterChunks(semester: Semester) {
  const result: { from: string; to: string }[] = [];
  const end = nextDate(semester.endDate, 1);
  for (let from = semester.startDate; from < end;) {
    const nextMonth = nextDate(`${from.slice(0, 7)}-01`, 32).slice(0, 7) + "-01";
    const to = nextMonth < end ? nextMonth : end;
    result.push({ from, to });
    from = to;
  }
  return result;
}

export async function loadSemesterAgenda(semester: Semester, teacherId: string | null,
  signal: AbortSignal | undefined, reader: Reader) {
  const filters = { semesterId: String(semester.id), teacherId: teacherId ?? "" };
  const whole = { from: semester.startDate, to: nextDate(semester.endDate, 1) };
  const query = (range: typeof whole) => reader(agendaPath(range, filters), signal).then(checkRows);
  if (datesBetween(whole.from, whole.to).length <= 371) {
    try { return await query(whole); }
    catch (error) {
      if (!(error instanceof Error && "status" in error && error.status === 400 && /10[.,]?000|371/.test(error.message)))
        throw error;
    }
  }
  const unique = new Map<number, AgendaOccupation>();
  for (const chunk of semesterChunks(semester))
    for (const item of await query(chunk)) unique.set(item.id, item);
  return [...unique.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id - b.id);
}

function minute(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

export function teacherActivities(items: AgendaOccupation[], teacherId: string) {
  return [...new Map(items.filter((item) => item.actualTeacherId === teacherId && item.kind !== "Bloqueio")
    .map((item) => [item.id, item])).values()];
}

export function teacherWorkload(items: AgendaOccupation[], shifts: Shift[], teacherId: string) {
  const activities = teacherActivities(items, teacherId);
  const confirmed = activities.filter((item) => item.bookingStatus === null || item.bookingStatus === "Aprovada");
  const intervals = new Map<string, { from: number; to: number }[]>();
  let withoutRegisteredShift = 0;
  for (const item of confirmed) {
    const shift = shifts.find((candidate) => candidate.id === item.shiftId);
    if (!shift || minute(shift.endsAt) <= minute(shift.startsAt)) {
      withoutRegisteredShift++;
      continue;
    }
    const day = intervals.get(item.date) ?? [];
    day.push({ from: minute(shift.startsAt), to: minute(shift.endsAt) });
    intervals.set(item.date, day);
  }
  let minutes = 0;
  for (const day of intervals.values()) {
    day.sort((a, b) => a.from - b.from);
    let end = -1;
    for (const interval of day) {
      minutes += Math.max(0, interval.to - Math.max(interval.from, end));
      end = Math.max(end, interval.to);
    }
  }
  return { hours: minutes / 60, activities: activities.length,
    conflicts: activities.filter((item) => item.conflicts.length > 0).length,
    withoutRegisteredShift, withoutApprovedBooking: activities.length - confirmed.length };
}

export function assignmentConflicts(assignments: Assignment[]) {
  const groups = new Map<string, number[]>();
  for (const item of assignments.filter((assignment) => assignment.endedAtUtc === null &&
    assignment.weekday !== null && assignment.preferredShiftId !== null)) {
    const key = `${item.teacherId}|${item.semesterId}|${item.weekday}|${item.preferredShiftId}`;
    groups.set(key, [...(groups.get(key) ?? []), item.id]);
  }
  return new Set([...groups.values()].filter((ids) => ids.length > 1).flat());
}
