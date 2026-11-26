// Origem: features/reservations/ManagerPlanning.tsx (aba Grade semestral)
import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useData } from "../../lib/data";
import { hour, localDate, nextDate } from "../../lib/utils";
import type { AgendaOccupation, ScheduleDetails, Semester, User } from "../../types";
import { dateLabel, formatNumber, isEad, mondayOf } from "./data";

type Lesson = { key: string; date: string; start: string; end: string; unit: string; classId: number | null; teacherId: string | null;
  roomId: number | null; room: string | null; ead: boolean; note?: string };
const weekdays = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

export function GradeTab({ semester, user, occupations, loading, error, versions, versionId, onVersion, grade, children }: {
  semester: Semester; user: User; occupations: AgendaOccupation[]; loading: boolean; error: string;
  versions: { id: number; status: string }[]; versionId: string; onVersion: (value: string) => void; grade: ScheduleDetails | null; children: ReactNode;
}) {
  const { data } = useData();
  const admin = user.roles.includes("Admin");
  const [filters, setFilters] = useState({ classId: "", teacherId: "", roomId: "", modality: "" });
  const [week, setWeek] = useState("");
  const showingVersion = admin && versionId !== "";
  const agendaLessons: Lesson[] = occupations.map((item) => ({ key: `o${item.id}`, date: item.date.slice(0, 10), start: item.startsAt.slice(11, 16), end: item.endsAt.slice(11, 16),
    unit: item.curricularUnitName ?? item.description ?? "Ocupação de ambiente", classId: item.actualClassGroupId, teacherId: item.actualTeacherId, roomId: item.roomId, room: item.roomName, ead: isEad(item),
    note: isEad(item) ? "Dia EAD com sala reservada" : undefined }));
  const versionLessons: Lesson[] = (grade?.unitPlans ?? []).flatMap((plan) => plan.meetings.filter((meeting) => meeting.date).map((meeting) => ({ key: `m${meeting.id}`, date: meeting.date!.slice(0, 10),
    start: meeting.start ? hour(meeting.start) : "", end: meeting.end ? hour(meeting.end) : "", unit: plan.unitName, classId: plan.classGroupId, teacherId: plan.teacherId, roomId: meeting.roomId, room: meeting.room, ead: plan.deliveryMode === "Ead" })));
  // Aulas anteriores sem oferta de UC repetem-se semanalmente (1 = segunda).
  const weekly = grade?.lessons ?? [];
  const firstDate = (showingVersion ? versionLessons : agendaLessons).map((item) => item.date).sort()[0];
  const selectedWeek = week || mondayOf(firstDate ?? semester.startDate.slice(0, 10));
  useEffect(() => { setWeek(""); }, [versionId]);
  const weekLessons = [...(showingVersion ? versionLessons : agendaLessons),
    ...(showingVersion ? weekly.map((item) => ({ key: `l${item.id}-${selectedWeek}`, date: nextDate(selectedWeek, item.weekday - 1), start: hour(item.start), end: hour(item.end), unit: item.disciplineName,
      classId: item.classGroupId, teacherId: item.teacherId, roomId: item.roomId, room: item.room, ead: false, note: "Grade semanal" }))
      .filter((item) => item.date >= semester.startDate.slice(0, 10) && item.date <= semester.endDate.slice(0, 10)) : [])]
    .filter((item) => mondayOf(item.date) === selectedWeek);
  const visible = weekLessons.filter((item) => (!filters.classId || String(item.classId) === filters.classId) && (!filters.teacherId || item.teacherId === filters.teacherId) &&
    (!filters.roomId || String(item.roomId) === filters.roomId) && (!filters.modality || (filters.modality === "ead") === item.ead));
  const columns = weekdays.slice(0, weekLessons.some((item) => [0, 6].includes(new Date(`${item.date}T12:00:00Z`).getUTCDay())) ? 7 : 5).map((name, index) => ({ name, date: nextDate(selectedWeek, index) }));
  const flexible = showingVersion ? (grade?.unitPlans ?? []).filter((plan) => plan.meetings.some((meeting) => !meeting.date)) : [];
  const offers = (grade?.unitPlans ?? []).filter((plan) => plan.deliveryMode === "Presencial");
  const conflicts = occupations.filter((item) => item.conflicts.length > 0);
  const classLabel = (id: number | null) => { const item = data.classes.find((row) => row.id === id); return item?.code || item?.name || "Turma não informada"; };
  const teacherLabel = (id: string | null) => data.teachers.find((item) => item.id === id)?.displayName ?? "Instrutor não informado";
  const filtered = !!(filters.classId || filters.teacherId || filters.roomId || filters.modality);
  const select = (label: string, key: keyof typeof filters, all: string, options: [string, string][]) =>
    <label><span>{label}</span><select aria-label={`${label} na grade`} value={filters[key]} onChange={(event) => setFilters({ ...filters, [key]: event.target.value })}><option value="">{all}</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>;

  return <>
    <section className="courses-panel planning-section grade-section" id="planning-grade">
      <div className="curriculum-section-head">
        <div><h3>Grade semestral</h3><p>{showingVersion ? `Encontros da grade #${versionId}, semana a semana.` : "Reservas e aulas confirmadas na agenda, semana a semana."}</p></div>
        <div className="sgp-head-tools">
          {admin && versions.length > 0 && <label className="grade-date-field">Exibir<select aria-label="Origem da grade exibida" value={versionId} onChange={(event) => onVersion(event.target.value)}><option value="">Agenda confirmada</option>{versions.map((item) => <option key={item.id} value={item.id}>Grade #{item.id} · {item.status}</option>)}</select></label>}
          <label className="grade-date-field">Ir para a data<input type="date" className="grade-date" aria-label="Escolher data no calendário" value={selectedWeek} min={semester.startDate.slice(0, 10)} max={semester.endDate.slice(0, 10)} onChange={(event) => event.target.value && setWeek(mondayOf(event.target.value))} /></label>
        </div>
      </div>
      <div className="grade-filters" role="group" aria-label="Filtros da grade">
        {select("Turma", "classId", "Todas", data.classes.filter((item) => item.semesterId === semester.id).map((item) => [String(item.id), item.code || item.name]))}
        {admin && select("Instrutor", "teacherId", "Todos", data.teachers.map((item) => [item.id, item.displayName]))}
        {select("Ambiente", "roomId", "Todos", data.rooms.map((item) => [String(item.id), item.code || item.name]))}
        {select("Modalidade", "modality", "Todas", [["presencial", "Presencial"], ["ead", "EAD"]])}
        {filtered && <button type="button" className="planning-text-button" onClick={() => setFilters({ classId: "", teacherId: "", roomId: "", modality: "" })}>Limpar</button>}
      </div>
      <div className="planning-section-body">
        {error && !showingVersion && <p className="course-error" role="alert">{error}</p>}
        {loading && !showingVersion && <p role="status" className="planning-empty">Consultando a agenda…</p>}
        <div className="grade-week-bar">
          <button type="button" aria-label="Semana anterior" disabled={selectedWeek <= mondayOf(semester.startDate.slice(0, 10))} onClick={() => setWeek(nextDate(selectedWeek, -7))}><ChevronLeft size={18} /></button>
          <div><strong>{dateLabel(selectedWeek)} a {dateLabel(nextDate(selectedWeek, columns.length - 1))}</strong><small>{weekLessons.length ? "Semana com aulas" : "Semana sem aulas"}</small></div>
          <button type="button" aria-label="Próxima semana" disabled={selectedWeek >= mondayOf(semester.endDate.slice(0, 10))} onClick={() => setWeek(nextDate(selectedWeek, 7))}><ChevronRight size={18} /></button>
        </div>
        <div className="grade-week">{columns.map((day) => {
          const lessons = visible.filter((item) => item.date === day.date).sort((a, b) => a.start.localeCompare(b.start));
          return <div className={`grade-day${day.date === localDate(new Date()) ? " is-today" : ""}${lessons.length ? "" : " is-empty"}`} key={day.date}>
            <header><span className="grade-day-name">{day.name}</span><strong>{day.date.slice(8, 10)}<small>/{day.date.slice(5, 7)}</small></strong></header>
            {lessons.length ? lessons.map((item) => <article className={`grade-lesson ${item.ead ? "is-ead" : "is-presential"}`} key={item.key} title={`${teacherLabel(item.teacherId)} · ${item.note ?? ""}`}>
              <span className="grade-lesson-time">{item.start} – {item.end}{item.ead && <em>EAD</em>}</span>
              <strong>{item.unit}</strong>
              <small>{classLabel(item.classId)} · {item.room ?? "Sem sala"}</small>
              <small className="grade-lesson-teacher">{teacherLabel(item.teacherId)}</small>
              {item.note && <small>{item.note}</small>}
            </article>) : <p className="grade-day-empty">Sem aulas</p>}
          </div>;
        })}</div>
        {!!flexible.length && <div className="sgp-flexible"><h4>EAD sem horário fixo</h4>{flexible.map((plan) => <article className="grade-lesson is-ead" key={plan.id}><span className="grade-lesson-time">Sem horário fixo<em>EAD</em></span><strong>{plan.unitName}</strong><small>{plan.className} · Sem sala</small><small className="grade-lesson-teacher">{teacherLabel(plan.teacherId)}</small></article>)}</div>}
        {!!offers.length && <details className="planning-reference-more"><summary>Carga por oferta presencial · grade #{grade!.id}</summary><div className="grade-offers">{offers.map((plan) => { const percent = plan.plannedHours ? Math.min(100, Math.round(plan.allocatedHours / plan.plannedHours * 100)) : 0; return <div className="grade-offer" key={plan.id}><strong>{plan.className} · {plan.unitName}</strong><div className="grade-progress-bar" aria-hidden="true"><i style={{ width: `${percent}%` }} /></div><span>{formatNumber(plan.allocatedHours)} de {plan.plannedHours ?? "—"} h · {plan.unallocatedHours ?? "—"} h pendentes</span></div>; })}</div></details>}
        {!!conflicts.length && <div className="planning-schedule-conflicts"><h4>Conflitos da agenda</h4>{conflicts.slice(0, 20).map((item) => <p key={item.id}>{dateLabel(item.date)} · {item.roomName} · conflito registrado</p>)}</div>}
      </div>
    </section>
    {children}
  </>;
}
