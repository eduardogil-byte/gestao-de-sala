import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useData } from "../lib/data";
import { agendaErrorMessage, assignmentConflicts, loadSemesterAgenda, teacherActivities, teacherWorkload } from "../lib/instructorAgenda";
import { movePeriod, weekStart, type TimelineView } from "../lib/roomTimeline";
import { dateBR, localDate, nextDate, statusText } from "../lib/utils";
import { Busy, Card, Field, Modal, Notice, Title } from "../components/UI";
import type { AgendaOccupation, User } from "../types";

const viewNames: Record<TimelineView, string> = { week: "Semana", month: "Mês", semester: "Semestre" };
const calendarNames: Record<string, string> = {
  Presential: "Presencial", Ead: "EAD", Holiday: "Feriado", Recess: "Recesso",
  Planning: "Planejamento", NonTeaching: "Não letivo", NaoLetivo: "Não letivo",
};
const conflictNames: Record<string, string> = {
  Room: "Ambiente", Teacher: "Professor", ClassGroup: "Turma", Loan: "Empréstimo",
  BookingStatus: "Estado da reserva",
};
const sourceNames: Record<string, string> = {
  Booking: "Reserva", Schedule: "Grade publicada", Planning: "Planejamento publicado", Manual: "Registro manual", Block: "Bloqueio",
};
const occupationStatusNames: Record<string, string> = { Confirmed: "Confirmada", Blocked: "Bloqueada" };
const weekDays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function formatHours(hours: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(hours) + " h";
}
function monthTitle(date: string) {
  return new Date(date.slice(0, 7) + "-15T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}
function special(item: AgendaOccupation) {
  const marks = [item.calendarKind && item.calendarKind !== "Presential" ? calendarNames[item.calendarKind] ?? "Dia especial" : null,
    item.dayStatus && item.dayStatus !== "Letivo" ? calendarNames[item.dayStatus] ?? "Dia especial" : null];
  return [...new Set(marks.filter((value): value is string => Boolean(value)))].join(" · ");
}
function Activity({ item, onSelect }: { item: AgendaOccupation; onSelect: (item: AgendaOccupation) => void }) {
  return <button type="button" onClick={() => onSelect(item)}
    className={(item.conflicts.length ? "border-rose-300 bg-rose-50 text-rose-900" : "border-sky-200 bg-sky-50 text-sky-900") +
      " block w-full rounded-lg border p-2 text-left text-xs focus:ring-2 focus:ring-sky-600"}>
    <strong>{item.conflicts.length ? "Conflito · " : "Aula registrada · "}{item.actualClassGroupName ?? "Turma não informada"}</strong>
    <span className="block">{item.roomName}</span>
    {item.curricularUnitName && <span className="block">{item.curricularUnitName}</span>}
    {special(item) && <span className="block font-medium text-amber-800">{special(item)}</span>}
  </button>;
}

export function InstructorAgenda({ user }: { user: User }) {
  const { data, loading: catalogLoading, error: catalogError } = useData();
  const admin = user.roles.includes("Admin");
  const [semesterId, setSemesterId] = useState("");
  const [teacherId, setTeacherId] = useState(admin ? "" : user.id);
  const [view, setView] = useState<TimelineView>("week");
  const [anchor, setAnchor] = useState(localDate(new Date()));
  const [items, setItems] = useState<AgendaOccupation[] | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<AgendaOccupation | null>(null);
  const [selectedDay, setSelectedDay] = useState("");
  const semester = data.semesters.find((s) => String(s.id) === semesterId);
  const queryKey = semesterId + "|" + revision;

  useEffect(() => {
    if (semesterId || !data.semesters.length) return;
    const today = localDate(new Date());
    const initial = data.semesters.find((s) => s.startDate <= today && today <= s.endDate) ?? data.semesters[0];
    setSemesterId(String(initial.id));
    setAnchor(today >= initial.startDate && today <= initial.endDate ? today : initial.startDate);
  }, [data.semesters, semesterId]);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setItems(null);
    setLoadedKey("");
    setError("");
    setSelected(null);
    setSelectedDay("");
    if (!semester || catalogError) { setLoading(false); return () => { current = false; controller.abort(); }; }
    setLoading(true);
    loadSemesterAgenda(semester, admin ? null : user.id, controller.signal,
      (path, signal) => api<unknown>(path, { signal }))
      .then((rows) => { if (current) { setItems(rows); setLoadedKey(queryKey); } })
      .catch((reason: unknown) => {
        if (!current) return;
        setError(agendaErrorMessage(reason));
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [semester, queryKey, admin, user.id, catalogError]);

  const ready = !catalogError && !loading && !error && items !== null && loadedKey === queryKey;
  const teacher = admin ? data.teachers.find((entry) => entry.id === teacherId) : user;
  const activities = useMemo(() => ready && teacherId ? teacherActivities(items, teacherId) : [], [ready, items, teacherId]);
  const byDay = useMemo(() => {
    const days = new Map<string, AgendaOccupation[]>();
    for (const item of activities) days.set(item.date, [...(days.get(item.date) ?? []), item]);
    return days;
  }, [activities]);
  const workload = useMemo(() => teacherWorkload(activities, data.shifts, teacherId), [activities, data.shifts, teacherId]);
  const overview = useMemo(() => ready && admin && items ? data.teachers.map((entry) => ({
    teacher: entry, total: teacherWorkload(items, data.shifts, entry.id),
  })) : [], [ready, admin, items, data.teachers, data.shifts]);
  const assignments = useMemo(() => data.assignments.filter((item) => item.teacherId === teacherId &&
    item.semesterId === semester?.id && !item.endedAtUtc), [data.assignments, teacherId, semester]);
  const pedagogicalConflicts = useMemo(() => assignmentConflicts(assignments), [assignments]);
  const week = weekStart(anchor);
  const weekDates = Array.from({ length: 7 }, (_, index) => nextDate(week, index));
  const monthStart = anchor.slice(0, 7) + "-01";
  const monthEnd = movePeriod("month", monthStart, 1).slice(0, 7) + "-01";
  const monthDates: string[] = [];
  for (let date = monthStart; date < monthEnd; date = nextDate(date, 1)) monthDates.push(date);
  const firstDayOffset = (new Date(monthStart + "T12:00:00").getDay() + 6) % 7;
  const periodLabel = view === "week" ? dateBR(week) + " a " + dateBR(nextDate(week, 6)) :
    view === "month" ? monthTitle(anchor) : semester?.name ?? "Selecione um semestre";

  function selectSemester(id: string) {
    setSemesterId(id);
    const selectedSemester = data.semesters.find((item) => String(item.id) === id);
    if (selectedSemester) setAnchor(selectedSemester.startDate);
  }
  function navigate(direction: number) {
    if (!semester) return;
    if (view === "semester") {
      const index = data.semesters.findIndex((item) => item.id === semester.id);
      const next = data.semesters[index + direction];
      if (next) selectSemester(String(next.id));
    } else setAnchor(movePeriod(view, anchor, direction));
  }
  function changeView(next: TimelineView) {
    setView(next);
    setSelectedDay("");
  }
  const withinSemester = (date: string) => Boolean(semester && date >= semester.startDate && date <= semester.endDate);

  return <>
    <Title title={admin ? "Agenda dos Instrutores" : "Minha Agenda"} subtitle={periodLabel}
      action={<button type="button" className="btn-secondary" onClick={() => setRevision((value) => value + 1)}>Atualizar agenda</button>} />
    <Card className="p-4 mb-5 space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {(["week", "month", "semester"] as TimelineView[]).map((choice) => <button key={choice} type="button"
          aria-pressed={view === choice} onClick={() => changeView(choice)} className={view === choice ? "btn-primary" : "btn-secondary"}>{viewNames[choice]}</button>)}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)} aria-label="Período anterior">‹</button>
          <span className="text-sm font-semibold text-slate-700 min-w-40 text-center capitalize">{periodLabel}</span>
          <button type="button" className="btn-secondary" onClick={() => navigate(1)} aria-label="Próximo período">›</button>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Semestre"><select className="field" value={semesterId} onChange={(event) => selectSemester(event.target.value)}>
          <option value="">Selecione</option>{data.semesters.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select></Field>
        {admin && <Field label="Instrutor"><select className="field" value={teacherId} onChange={(event) => { setTeacherId(event.target.value); setSelectedDay(""); }}>
          <option value="">Visão geral dos instrutores</option>{data.teachers.map((entry) => <option key={entry.id} value={entry.id}>{entry.displayName}</option>)}
        </select></Field>}
      </div>
    </Card>
    {catalogError && <Notice message={"Não foi possível carregar os cadastros: " + catalogError} />}
    {!catalogLoading && !catalogError && !semester && <Notice message="Selecione um semestre cadastrado para consultar a agenda." />}
    {error && <Notice message={error} />}
    {(catalogLoading || loading) && <Busy />}
    {ready && admin && !teacherId && <Card className="p-4 mb-5">
      <h2 className="font-semibold text-slate-800 mb-3">Carga horária por instrutor</h2>
      <p className="text-sm text-slate-600 mb-4">Horas de ocupações efetivas com turno cadastrado. Sem limite institucional configurado.</p>
      {!data.teachers.length ? <p className="text-sm text-slate-600">Nenhum instrutor cadastrado para consulta.</p> :
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b"><th className="p-2">Instrutor</th><th className="p-2">Horas</th><th className="p-2">Atividades</th><th className="p-2">Situação</th></tr></thead>
          <tbody>{overview.map(({ teacher: entry, total }) => <tr key={entry.id} className="border-b">
            <td className="p-2"><button type="button" className="text-sky-700 font-medium underline" onClick={() => setTeacherId(entry.id)}>{entry.displayName}</button></td>
            <td className="p-2">{formatHours(total.hours)}{(total.withoutRegisteredShift > 0 || total.withoutApprovedBooking > 0) && " + horas não contabilizadas"}</td><td className="p-2">{total.activities}</td>
            <td className="p-2">{total.activities === 0 ? "Sem atividades registradas no período" : total.conflicts > 0 ? total.conflicts + " com conflito" : "Sem conflito indicado"}</td>
          </tr>)}</tbody></table></div>}
      <p className="text-xs text-slate-500 mt-4">A ausência de atividades no SalaGest não confirma disponibilidade contratual.</p>
    </Card>}
    {ready && teacherId && <>
      <Card className="p-4 mb-5">
        <h2 className="font-semibold text-slate-800">{teacher?.displayName ?? "Instrutor selecionado"}</h2>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm text-slate-700">
          <span><strong>{formatHours(workload.hours)}</strong> de ocupações efetivas no semestre</span>
          <span>{workload.activities} atividades registradas</span>
          <span>{workload.conflicts} atividades com conflito</span>
        </div>
        {workload.withoutRegisteredShift > 0 && <p className="text-sm text-amber-800 mt-2">{workload.withoutRegisteredShift} atividade(s) sem turno válido não entram na soma de horas.</p>}
        {workload.withoutApprovedBooking > 0 && <p className="text-sm text-amber-800 mt-2">{workload.withoutApprovedBooking} ocupação(ões) vinculada(s) a reserva não aprovada não entram na soma de horas confirmadas.</p>}
        <p className="text-xs text-slate-600 mt-2">Horas calculadas pelos turnos cadastrados, sem dupla contagem de intervalos simultâneos. Atribuições pedagógicas sem ocupação não entram na soma. Sem limite institucional de carga configurado.</p>
        {!workload.activities && <p className="text-sm text-slate-600 mt-3">Sem atividades registradas no período. Isso não confirma disponibilidade contratual.</p>}
      </Card>
      {view === "week" && <Card className="overflow-x-auto mb-5"><table className="w-full min-w-[900px] text-sm">
        <thead><tr><th className="sticky left-0 bg-white p-3 text-left border-b min-w-32">Turno</th>{weekDates.map((date) => <th key={date} className="p-3 text-left border-b min-w-32">{weekDays[new Date(date + "T12:00:00").getDay()]}<span className="block text-xs font-normal">{dateBR(date)}</span></th>)}</tr></thead>
        <tbody>{data.shifts.map((shift) => <tr key={shift.id}><th scope="row" className="sticky left-0 bg-white p-3 border-b text-left align-top">{shift.name}<span className="block text-xs font-normal text-slate-500">{shift.startsAt.slice(0, 5)}–{shift.endsAt.slice(0, 5)}</span></th>
          {weekDates.map((date) => { const rows = (byDay.get(date) ?? []).filter((item) => item.shiftId === shift.id); return <td key={date} className="p-2 border-b align-top">{!withinSemester(date) ? <span className="text-xs text-slate-500">Fora do semestre</span> : rows.length ? <div className="space-y-1">{rows.length > 1 && <p className="text-xs font-bold text-rose-800">{rows.length} atividades simultâneas</p>}{rows.map((item) => <Activity key={item.id} item={item} onSelect={setSelected} />)}</div> : <span className="text-xs text-slate-500">Sem aula registrada</span>}</td>; })}</tr>)}</tbody>
      </table>{!data.shifts.length && <p className="p-4 text-sm">Não há turnos cadastrados para montar a grade.</p>}
      {(weekDates.flatMap((date) => byDay.get(date) ?? []).filter((item) => item.shiftId === null)).length > 0 && <div className="p-4"><h3 className="font-semibold text-sm mb-2">Atividades sem turno identificado</h3><div className="space-y-2">{weekDates.flatMap((date) => byDay.get(date) ?? []).filter((item) => item.shiftId === null).map((item) => <Activity key={item.id} item={item} onSelect={setSelected} />)}</div></div>}</Card>}
      {view === "month" && <><Card className="p-4 mb-5"><div className="grid grid-cols-7 gap-1 text-xs text-center font-semibold text-slate-600 mb-2">{["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((name) => <span key={name}>{name}</span>)}</div>
        <div className="grid grid-cols-7 gap-1">{Array.from({ length: firstDayOffset }, (_, index) => <span key={"blank-" + index} />)}{monthDates.map((date) => { const rows = byDay.get(date) ?? []; const count = rows.filter((item) => item.conflicts.length).length; return <button key={date} type="button" onClick={() => setSelectedDay(date)} disabled={!withinSemester(date)} aria-pressed={selectedDay === date}
          className="min-h-24 rounded-lg border border-slate-200 p-2 text-left text-xs hover:bg-sky-50 focus:ring-2 focus:ring-sky-600 disabled:opacity-40">
          <strong className="block">{date.slice(8)}</strong><span className="block mt-1">{rows.length} atividade(s)</span>
          {rows.length > 0 && <span className="block text-slate-600">{[...new Set(rows.map((item) => item.shiftName).filter(Boolean))].join(", ")}</span>}
          {count > 0 && <span className="block font-semibold text-rose-800">{count} conflito(s)</span>}
          {[...new Set(rows.map(special).filter(Boolean))].map((label) => <span key={label} className="block text-amber-800">{label}</span>)}
        </button>; })}</div></Card>
        {selectedDay && <Card className="p-4 mb-5"><h2 className="font-semibold mb-3">{dateBR(selectedDay)}</h2><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{(byDay.get(selectedDay) ?? []).length ? (byDay.get(selectedDay) ?? []).map((item) => <Activity key={item.id} item={item} onSelect={setSelected} />) : <p className="text-sm text-slate-600">Sem aula registrada.</p>}</div></Card>}</>}
      {view === "semester" && <><Card className="p-4 mb-5"><h2 className="font-semibold mb-3">Distribuição no semestre</h2><div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {semester && (() => { const months: string[] = []; for (let date = semester.startDate.slice(0, 7) + "-01"; date <= semester.endDate; date = movePeriod("month", date, 1).slice(0, 7) + "-01") months.push(date);
          return months.map((month) => { const rows = activities.filter((item) => item.date.slice(0, 7) === month.slice(0, 7)); const total = teacherWorkload(rows, data.shifts, teacherId); return <button key={month} type="button" className="rounded-xl border border-slate-200 p-4 text-left hover:bg-sky-50 focus:ring-2 focus:ring-sky-600" onClick={() => { setAnchor(month); changeView("month"); }}>
            <strong className="block capitalize">{monthTitle(month)}</strong><span className="block text-sm mt-2">{total.activities} atividade(s) · {formatHours(total.hours)}</span><span className="block text-xs text-slate-600">{total.activities ? total.conflicts + " com conflito" : "Sem atividades registradas"}</span>
          </button>; }); })()}
      </div></Card><Card className="p-4 mb-5"><h2 className="font-semibold mb-2">Turmas e UCs com ocupação registrada</h2><p className="text-sm text-slate-700">Turmas: {[...new Set(activities.map((item) => item.actualClassGroupName).filter(Boolean))].join(", ") || "Nenhuma registrada"}</p><p className="text-sm text-slate-700 mt-1">UCs: {[...new Set(activities.map((item) => item.curricularUnitName).filter(Boolean))].join(", ") || "Nenhuma vinculada"}</p></Card></>}
      <Card className="p-4 mb-5"><h2 className="font-semibold mb-2">Atribuições pedagógicas</h2><p className="text-xs text-slate-600 mb-3">Atribuição indica planejamento; não equivale a reserva efetiva de ambiente nem acrescenta horas à soma acima.</p>
        {!assignments.length ? <p className="text-sm text-slate-600">Sem atribuições registradas no semestre.</p> : <ul className="space-y-2 text-sm">{assignments.map((item) => <li key={item.id} className="rounded-lg border border-slate-200 p-3">
          <strong>{data.classes.find((entry) => entry.id === item.classGroupId)?.name ?? "Turma não identificada"}</strong> · {item.disciplineName || "UC não informada"}
          <span className="block text-slate-600">{item.weekday === null ? "Dia não definido" : weekDays[item.weekday] ?? "Dia não identificado"} · {data.shifts.find((entry) => entry.id === item.preferredShiftId)?.name ?? "Turno não definido"} · {item.meetingsPerWeek} encontro(s)/semana previstos</span>
          <span className="block text-slate-600">{item.curricularUnitId !== null && activities.some((entry) => entry.actualClassGroupId === item.classGroupId && entry.curricularUnitId === item.curricularUnitId) ? "Há ocupação registrada para esta turma e UC" : "Sem vínculo de ambiente confirmado nesta atribuição"}</span>
          {pedagogicalConflicts.has(item.id) && <strong className="block text-rose-800">Possível conflito pedagógico: outra atribuição no mesmo dia e turno</strong>}
        </li>)}</ul>}
      </Card>
    </>}
    {selected && <Modal title="Detalhes da atividade" onClose={() => setSelected(null)}><dl className="grid sm:grid-cols-2 gap-3 text-sm">
      {[["Professor efetivo", selected.actualTeacherName], ["Turma", selected.actualClassGroupName], ["Ambiente", selected.roomName], ["Data", dateBR(selected.date)],
        ["Turno", selected.shiftName ? selected.shiftName + " · " + selected.startsAt.slice(11, 16) + "–" + selected.endsAt.slice(11, 16) : "Não identificado"],
        ["Curso", selected.courseName], ["UC", selected.curricularUnitName], ["Capacidade", selected.curricularCapabilityDescription],
        ["Estado", occupationStatusNames[selected.status] ?? statusText(selected.status)], ["Reserva", selected.bookingStatus ? statusText(selected.bookingStatus) : null],
        ["Origem", sourceNames[selected.source] ?? "Registro de ocupação"], ["Calendário", special(selected) || "Sem situação especial informada"],
        ["Empréstimo", selected.isBorrowed ? "Professor efetivo de empréstimo aprovado" : null],
        ["Conflitos", selected.conflicts.length ? selected.conflicts.map((entry) => conflictNames[entry] ?? "Inconsistência").join(", ") : "Nenhum indicado"]]
        .filter((pair) => pair[1]).map(([label, value]) => <div key={label}><dt className="font-semibold text-slate-700">{label}</dt><dd>{value}</dd></div>)}
    </dl></Modal>}
  </>;
}
