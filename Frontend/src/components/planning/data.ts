// Adaptadores entre a interface do Planejamento e os contratos reais da API.
import { useEffect, useState } from "react";
import { api, read } from "../../lib/api";
import { useData } from "../../lib/data";
import { agendaErrorMessage, loadSemesterAgenda } from "../../lib/instructorAgenda";
import { nextDate, resultMessage } from "../../lib/utils";
import type { AgendaOccupation, Booking, ScheduleDetails, Semester, User } from "../../types";

export type PlanningTab = "overview" | "preparation" | "reservations" | "grade";
export type PlanningTarget = "academic" | "teachers" | "rooms" | "pedagogical-catalog" | "bookings";
export type OfferedUnit = { curricularUnitId: number; code: string; name: string; plannedHours: number | null;
  deliveryMode: "Presencial" | "Ead"; eadScheduleMode: string | null; teacherId: string | null };
export type ClassUnits = { legacyWithoutModule: boolean; units: OfferedUnit[] };
export type IssueSeverity = "Informativo" | "Atenção" | "Impedimento" | "Verificação indisponível";
export type IssueOccurrence = { id: string; record: string; location: string; facts: { label: string; value: string }[]; impact: string; target: PlanningTarget };
export type Issue = { id: string; title: string; description: string; severity: IssueSeverity; location: string; impact: string; target: PlanningTarget | "shifts"; occurrences: IssueOccurrence[] };

export const dateLabel = (date: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${date.slice(0, 10)}T12:00:00Z`));
export const weekdayShort = (date: string) => ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][new Date(`${date.slice(0, 10)}T12:00:00Z`).getUTCDay()];
export const isWeekend = (date: string) => [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay());
/** Segunda-feira da semana da data informada. */
export const mondayOf = (date: string) => nextDate(date, -((new Date(`${date}T12:00:00`).getDay() + 6) % 7));
export const formatNumber = (value: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);

export const bookingStatus = (status: string) => status === "Aprovada" ? { label: "Confirmada", tone: "is-confirmed" }
  : status === "Pendente" ? { label: "Aguardando sala", tone: "is-pending" } : { label: "Descartada", tone: "is-warning" };
export const proposalStatus = (status: string) => ({ label: status,
  tone: status === "Aprovada" || status === "Publicada" ? "is-confirmed" : status === "Rejeitada" ? "is-warning" : "is-pending" });
export const isEad = (item: AgendaOccupation) => item.dayStatus === "Ead" || item.calendarKind === "Ead";

/** Reservas cujo período (data inicial até o fim da recorrência) cruza o semestre. */
export const semesterBookings = (bookings: Booking[], semester: Semester) => bookings.filter((item) =>
  item.startsAt.slice(0, 10) <= semester.endDate.slice(0, 10) &&
  (item.repeatUntil ?? item.startsAt).slice(0, 10) >= semester.startDate.slice(0, 10));

/** Ocupações efetivas do semestre (o Professor consulta somente as próprias). */
export function useSemesterAgenda(semester: Semester, user: User) {
  const { revision } = useData();
  const admin = user.roles.includes("Admin");
  const [items, setItems] = useState<AgendaOccupation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    loadSemesterAgenda(semester, admin ? null : user.id, controller.signal, (path, signal) => api<unknown>(path, { signal }))
      .then((rows) => { if (!controller.signal.aborted) setItems(rows.filter((item) => item.kind !== "Bloqueio")); })
      .catch((cause) => { if (!controller.signal.aborted) { setItems([]); setError(agendaErrorMessage(cause)); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [semester.id, semester.startDate, semester.endDate, user.id, admin, revision]);
  return { items, loading, error };
}

/** UCs ofertadas por turma, consultadas em pequenos lotes somente quando solicitadas. */
export function useClassUnits(semester: Semester, enabled: boolean) {
  const { data, revision } = useData();
  const classes = data.classes.filter((item) => item.semesterId === semester.id);
  const [units, setUnits] = useState<Record<number, ClassUnits | null>>({});
  const ids = classes.map((item) => item.id).join(",");
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void (async () => {
      for (let start = 0; start < classes.length && active; start += 6) {
        const batch = await Promise.all(classes.slice(start, start + 6).map(async (item) => {
          try {
            const value = await read<ClassUnits>(`/classes/${item.id}/units`);
            return [item.id, Array.isArray(value?.units) ? value : null] as const;
          } catch { return [item.id, null] as const; }
        }));
        if (active) setUnits((current) => ({ ...current, ...Object.fromEntries(batch) }));
      }
    })();
    return () => { active = false; };
  }, [ids, enabled, revision]);
  return units;
}

/** Grade de referência do Admin: a publicada ou a versão mais recente do semestre. */
export function useGrade(scheduleId: number | undefined) {
  const { data, revision } = useData();
  const summary = data.schedules.find((item) => item.id === scheduleId);
  const [grade, setGrade] = useState<ScheduleDetails | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setError("");
    if (!scheduleId) { setGrade(null); return; }
    let active = true;
    setGrade((current) => current?.id === scheduleId ? current : null);
    read<ScheduleDetails>(`/schedules/${scheduleId}`)
      .then((value) => { if (active && value?.id === scheduleId) setGrade(value); })
      .catch((cause) => { if (active) setError(resultMessage(cause)); });
    return () => { active = false; };
  }, [scheduleId, summary?.status, summary?.unallocatedMeetings, summary?.allocatedMeetings, revision]);
  return { grade, error };
}

/** Pendências comprováveis com os cadastros; calendário, disponibilidade e compatibilidade são validados pela API. */
export function preparationIssues(data: ReturnType<typeof useData>["data"], semester: Semester, units: Record<number, ClassUnits | null>): Issue[] {
  const classes = data.classes.filter((item) => item.semesterId === semester.id);
  const active = data.assignments.filter((item) => item.semesterId === semester.id && !item.endedAtUtc);
  const issues: Issue[] = [];
  const add = (issue: Omit<Issue, "occurrences">, occurrences: Omit<IssueOccurrence, "impact" | "target">[]) => {
    if (occurrences.length) issues.push({ ...issue, occurrences: occurrences.map((row) => ({ ...row, impact: issue.impact, target: issue.target === "shifts" ? "academic" : issue.target })) });
  };
  const classRow = (item: typeof classes[number], facts: { label: string; value: string }[]) =>
    ({ id: String(item.id), record: item.code || item.name, location: item.name, facts });
  add({ id: "class-shift", title: "Turma sem turno oficial", description: "Há turmas sem turno institucional definido.", severity: "Impedimento", location: "Turmas e semestres", impact: "A grade não distribui encontros para a turma.", target: "academic" },
    classes.filter((item) => !data.shifts.some((shift) => shift.id === item.shiftId)).map((item) => classRow(item, [{ label: "Turno", value: "Não definido" }])));
  add({ id: "class-module", title: "Turma sem curso ou módulo", description: "Há turmas sem vínculo curricular completo.", severity: "Impedimento", location: "Turmas e semestres", impact: "Não há UCs ofertadas para planejar.", target: "academic" },
    classes.filter((item) => !item.courseId || !item.courseModuleId).map((item) => classRow(item, [{ label: "Vínculo", value: "Curso ou módulo ausente" }])));
  add({ id: "class-assignment", title: "Turma sem atribuição ativa", description: "Há turmas sem instrutor atribuído no semestre.", severity: "Atenção", location: "Turmas e semestres", impact: "Não é possível criar propostas para a turma.", target: "academic" },
    classes.filter((item) => !active.some((row) => row.classGroupId === item.id)).map((item) => classRow(item, [{ label: "Atribuições ativas", value: "0" }])));
  const offers = classes.flatMap((item) => (units[item.id]?.units ?? []).map((unit) => ({ item, unit })));
  const offerRow = ({ item, unit }: typeof offers[number], label: string, value: string) =>
    ({ id: `${item.id}-${unit.curricularUnitId}`, record: `${item.code || item.name} · ${unit.code}`, location: unit.name, facts: [{ label, value }] });
  add({ id: "unit-teacher", title: "UC sem instrutor responsável", description: "Há UCs ofertadas sem responsável.", severity: "Atenção", location: "Turmas e semestres", impact: "A grade registra a oferta como pendente.", target: "academic" },
    offers.filter((row) => !row.unit.teacherId).map((row) => offerRow(row, "Instrutor", "Não definido")));
  add({ id: "unit-hours", title: "UC sem carga horária", description: "Há UCs ofertadas sem carga horária prevista.", severity: "Impedimento", location: "Cursos", impact: "A distribuição da carga não pode ser calculada.", target: "pedagogical-catalog" },
    offers.filter((row) => row.unit.plannedHours == null).map((row) => offerRow(row, "Carga prevista", "Não informada")));
  add({ id: "shift-hours", title: "Turno sem horas pedagógicas", description: "Há turnos sem equivalência pedagógica.", severity: "Impedimento", location: "Preparação · Turnos", impact: "A geração da grade exige a equivalência por turno.", target: "shifts" },
    data.shifts.filter((item) => !item.pedagogicalHours).map((item) => ({ id: String(item.id), record: item.name, location: "Turnos", facts: [{ label: "Horas pedagógicas", value: "Não definidas" }] })));
  add({ id: "units-unavailable", title: "UCs não consultadas", description: "A API não retornou as UCs de algumas turmas.", severity: "Verificação indisponível", location: "Turmas e semestres", impact: "A preparação destas turmas não foi comprovada.", target: "academic" },
    classes.filter((item) => units[item.id] === null).map((item) => classRow(item, [{ label: "UCs", value: "Não informadas" }])));
  return issues;
}
