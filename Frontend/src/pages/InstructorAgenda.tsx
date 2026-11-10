import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useData } from "../lib/data";
import { agendaErrorMessage, assignmentConflicts, loadSemesterAgenda, teacherActivities, teacherWorkload } from "../lib/instructorAgenda";
import { movePeriod, type TimelineView } from "../lib/roomTimeline";
import { dateBR, localDate, nextDate, statusText } from "../lib/utils";
import { Busy, Card, Field, FilterBar, MetricCard, Modal, Notice, SearchableSelect, SectionHeading, Title } from "../components/UI";
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
    aria-label={`Detalhes: ${item.actualClassGroupName ?? "Turma não informada"}, ${item.roomName}, ${dateBR(item.date)}${item.conflicts.length ? ", com conflito" : ""}`}
    className={(item.conflicts.length ? "border-rose-300 bg-rose-50 text-rose-900" : "border-sky-200 bg-sky-50 text-sky-900") +
      " block w-full rounded-lg border border-l-4 p-2.5 text-left text-xs leading-5 transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"}>
    <strong>{item.conflicts.length ? "Conflito" : item.bookingStatus && item.bookingStatus !== "Aprovada" ? statusText(item.bookingStatus) : item.isBorrowed ? "Empréstimo" : occupationStatusNames[item.status] ?? statusText(item.status)} · {item.actualClassGroupName ?? "Turma não informada"}</strong>
    <span className="block">{item.roomName}{item.shiftName ? ` · ${item.shiftName}` : ""}</span>
    {(item.courseName || item.curricularUnitName) && <span className="block">{[item.courseName, item.curricularUnitName].filter(Boolean).join(" · ")}</span>}
    {special(item) && <span className="block font-medium text-amber-800">{special(item)}</span>}
  </button>;
}

export function InstructorAgenda({ user, onOpenRelated, onManage }: { user: User; onOpenRelated?: (type: "Booking" | "Loan", id: number) => void; onManage?: (date: string, roomId: number, occupationId: number) => void }) {
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
  const week = nextDate(anchor, -new Date(anchor + "T12:00:00").getDay());
  const overview = useMemo(() => ready && admin && items ? data.teachers.map((entry) => ({
    teacher: entry, total: teacherWorkload(items, data.shifts, entry.id),
    weekly: teacherWorkload(items.filter((item) => item.date >= week && item.date < nextDate(week, 7)), data.shifts, entry.id),
  })) : [], [ready, admin, items, data.teachers, data.shifts, week]);
  const assignments = useMemo(() => data.assignments.filter((item) => item.teacherId === teacherId &&
    item.semesterId === semester?.id && !item.endedAtUtc), [data.assignments, teacherId, semester]);
  const pedagogicalConflicts = useMemo(() => assignmentConflicts(assignments), [assignments]);
  const weekDates = Array.from({ length: 7 }, (_, index) => nextDate(week, index));
  const weeklyWorkload = useMemo(() => teacherWorkload(activities.filter((item) => item.date >= week && item.date < nextDate(week, 7)),
    data.shifts, teacherId), [activities, data.shifts, teacherId, week]);
  const monthStart = anchor.slice(0, 7) + "-01";
  const monthEnd = movePeriod("month", monthStart, 1).slice(0, 7) + "-01";
  const monthDates: string[] = [];
  for (let date = monthStart; date < monthEnd; date = nextDate(date, 1)) monthDates.push(date);
  const firstDayOffset = new Date(monthStart + "T12:00:00").getDay();
  const periodLabel = view === "week" ? dateBR(week) + " a " + dateBR(nextDate(week, 6)) :
    view === "month" ? monthTitle(anchor) : semester?.name ?? "Selecione um semestre";

  function selectSemester(id: string) {
    setSemesterId(id);
    const selectedSemester = data.semesters.find((item) => String(item.id) === id);
    if (selectedSemester) setAnchor(selectedSemester.startDate);
  }
  function navigate(direction: number) {
    if (!semester) return;
    setSelectedDay("");
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
    <Title title={admin ? "Agenda dos Instrutores" : "Minha Agenda"} subtitle="Consulte ocupações por docente e turno. A carga semanal e a semestral são calculadas separadamente a partir dos registros efetivos."
      action={<button type="button" className="btn-secondary" onClick={() => setRevision((value) => value + 1)}>Atualizar agenda</button>} />
    <Card className="p-4 sm:p-5 mb-5 space-y-5">
      <SectionHeading title="Período da agenda" subtitle="Consulte semana, mês ou semestre mantendo o instrutor e o contexto selecionados." />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Visualização da agenda">{(["week", "month", "semester"] as TimelineView[]).map((choice) => <button key={choice} type="button"
          aria-pressed={view === choice} onClick={() => changeView(choice)} className={view === choice ? "btn-primary" : "btn-secondary"}>{viewNames[choice]}</button>)}
        </div>
        <div className="flex items-center gap-2 min-w-0 rounded-xl border border-line bg-canvas/40 p-1" aria-label="Navegação entre períodos">
          <button type="button" className="btn-secondary shrink-0" onClick={() => navigate(-1)} aria-label="Período anterior">‹</button>
          <span className="text-sm font-semibold text-ink flex-1 min-w-0 px-1 text-center capitalize" aria-live="polite">{periodLabel}</span>
          <button type="button" className="btn-secondary shrink-0" onClick={() => navigate(1)} aria-label="Próximo período">›</button>
        </div>
      </div>
      <FilterBar embedded>
        <Field label="Semestre"><select className="field" value={semesterId} onChange={(event) => selectSemester(event.target.value)}>
          <option value="">Selecione</option>{data.semesters.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select></Field>
        {admin && <SearchableSelect label="Instrutor" value={teacherId} onChange={(value) => { setTeacherId(value); setSelectedDay(""); }}
          options={[{ value: "", label: "Visão geral dos instrutores" }, ...data.teachers.map((entry) => ({ value: entry.id, label: entry.displayName }))]} />}
      </FilterBar>
    </Card>
    {catalogError && <Notice message={"Não foi possível carregar os cadastros: " + catalogError} />}
    {!catalogLoading && !catalogError && !semester && <Notice message="Selecione um semestre cadastrado para consultar a agenda." />}
    {error && <Notice message={error} />}
    {(catalogLoading || loading) && <Busy />}
    {ready && admin && !teacherId && <Card className="p-4 sm:p-5 mb-5">
      <SectionHeading title="Carga horária por instrutor" subtitle={`Semana de ${dateBR(week)} a ${dateBR(nextDate(week, 6))} e semestre ${semester?.name ?? "selecionado"}. Horas de ocupações efetivas; sem limite institucional configurado.`} />
      {!data.teachers.length ? <p className="text-sm text-slate-600">Nenhum instrutor cadastrado para consulta.</p> :
        <><div className="hidden md:block data-table-wrap mt-4"><table className="w-full text-sm"><thead><tr className="table-head"><th className="p-3 text-left">Instrutor</th><th className="p-3 text-left">Carga semanal</th><th className="p-3 text-left">Carga semestral</th><th className="p-3 text-left">Ocupações</th><th className="p-3 text-left">Situação</th></tr></thead>
          <tbody>{overview.map(({ teacher: entry, total, weekly }) => <tr key={entry.id} className="border-b border-line">
            <td className="p-3"><button type="button" className="text-sky-700 font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400" onClick={() => setTeacherId(entry.id)}>{entry.displayName}</button></td>
            <td className="p-3 tabular-nums">{formatHours(weekly.hours)}</td>
            <td className="p-3 tabular-nums">{formatHours(total.hours)}{(total.withoutRegisteredShift > 0 || total.withoutApprovedBooking > 0) && <span className="block text-xs text-amber-800">Há horas não contabilizadas</span>}</td><td className="p-3">{total.activities}</td>
            <td className="p-3">{total.activities === 0 ? "Sem aulas registradas · disponibilidade não confirmada" : total.conflicts > 0 ? total.conflicts + " com conflito" : "Sem conflito indicado"}</td>
          </tr>)}</tbody></table></div>
        <div className="md:hidden mt-4 space-y-3">{overview.map(({ teacher: entry, total, weekly }) => <div key={entry.id} className="rounded-xl border border-line p-4 space-y-2">
          <button type="button" className="text-sky-700 font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400" onClick={() => setTeacherId(entry.id)}>{entry.displayName}</button>
          <p className="text-sm">Semana: <strong>{formatHours(weekly.hours)}</strong> · Semestre: <strong>{formatHours(total.hours)}</strong></p>
          <p className="text-xs text-muted-ink">{total.activities} ocupação(ões) · {total.activities === 0 ? "Sem aulas registradas; disponibilidade não confirmada" : total.conflicts > 0 ? `${total.conflicts} com conflito` : "Sem conflito indicado"}</p>
          {(total.withoutRegisteredShift > 0 || total.withoutApprovedBooking > 0) && <p className="text-xs text-amber-800">Há horas não contabilizadas.</p>}
        </div>)}</div></>}
      <p className="text-xs text-muted-ink mt-4">A ausência de atividades no SalaGest não confirma disponibilidade contratual.</p>
    </Card>}
    {ready && teacherId && <>
      <Card className="p-4 sm:p-5 mb-5">
        <SectionHeading title={teacher?.displayName ?? "Instrutor selecionado"} subtitle={`Ocupações efetivas de ${semester?.name ?? "semestre selecionado"}. A semana exibida é ${dateBR(week)} a ${dateBR(nextDate(week, 6))}.`} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Carga semestral" value={formatHours(workload.hours)} detail="de ocupações efetivas no semestre" tone="blue" />
          <MetricCard label="Carga semanal" value={formatHours(weeklyWorkload.hours)} detail={`na semana de ${dateBR(week)} a ${dateBR(nextDate(week, 6))}`} tone="violet" />
          <MetricCard label="Ocupações no semestre" value={workload.activities} detail="Registros, não horas pedagógicas" tone="slate" />
          <MetricCard label="Com conflito" value={workload.conflicts} detail="Conforme sinalização da API" tone={workload.conflicts ? "rose" : "emerald"} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-ink" aria-label="Legenda da agenda"><span className="font-semibold text-ink">Legenda:</span><span className="rounded-full border-l-4 border-sky-300 bg-sky-50 px-2.5 py-1 text-sky-800">Ocupação</span><span className="rounded-full border-l-4 border-rose-300 bg-rose-50 px-2.5 py-1 text-rose-800">Conflito</span><span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">Dia especial</span><span>Sem aula registrada ≠ disponibilidade confirmada</span></div>
        {workload.withoutRegisteredShift > 0 && <p className="text-sm text-amber-800 mt-2">{workload.withoutRegisteredShift} atividade(s) sem turno válido não entram na soma de horas.</p>}
        {workload.withoutApprovedBooking > 0 && <p className="text-sm text-amber-800 mt-2">{workload.withoutApprovedBooking} ocupação(ões) vinculada(s) a reserva não aprovada não entram na soma de horas confirmadas.</p>}
        <p className="text-xs text-slate-600 mt-2">Horas calculadas pelos turnos cadastrados, sem dupla contagem de intervalos simultâneos. Atribuições pedagógicas sem ocupação não entram na soma. Sem limite institucional de carga configurado.</p>
        {!workload.activities && <p className="text-sm text-slate-600 mt-3">Sem atividades registradas no período. Isso não confirma disponibilidade contratual.</p>}
      </Card>
      {view === "week" && <Card className="overflow-hidden mb-5"><div className="p-4 sm:p-5 border-b border-line"><SectionHeading title="Agenda da semana" subtitle="Ocupações por dia e turno. Selecione um registro para consultar turma, curso, UC, ambiente e conflitos." /></div><div className="hidden lg:block data-table-wrap border-0 rounded-none"><table className="w-full min-w-[900px] text-sm">
        <thead><tr><th className="sticky left-0 bg-surface p-3 text-left border-b border-line min-w-32">Turno</th>{weekDates.map((date) => <th key={date} className={`p-3 text-left border-b border-line min-w-32 ${date === localDate(new Date()) ? "bg-sky-50 text-sky-900" : ""}`} aria-current={date === localDate(new Date()) ? "date" : undefined}>{weekDays[new Date(date + "T12:00:00").getDay()]}<span className="block text-xs font-normal">{dateBR(date)}{date === localDate(new Date()) ? " · Hoje" : ""}</span></th>)}</tr></thead>
        <tbody>{data.shifts.map((shift) => <tr key={shift.id}><th scope="row" className="sticky left-0 bg-surface p-3 border-b border-line text-left align-top">{shift.name}<span className="block text-xs font-normal text-muted-ink">{shift.startsAt.slice(0, 5)}–{shift.endsAt.slice(0, 5)}</span></th>
          {weekDates.map((date) => { const rows = (byDay.get(date) ?? []).filter((item) => item.shiftId === shift.id); return <td key={date} className="p-2 border-b align-top">{!withinSemester(date) ? <span className="text-xs text-slate-500">Fora do semestre</span> : rows.length ? <div className="space-y-1">{rows.length > 1 && <p className="text-xs font-bold text-slate-700">{rows.length} ocupações</p>}{rows.map((item) => <Activity key={item.id} item={item} onSelect={setSelected} />)}</div> : <span className="text-xs text-slate-500">Sem aula registrada</span>}</td>; })}</tr>)}</tbody>
      </table></div><div className="lg:hidden divide-y divide-line">{weekDates.map((date) => <section key={date} className={`p-4 ${date === localDate(new Date()) ? "bg-sky-50" : ""}`} aria-current={date === localDate(new Date()) ? "date" : undefined}>
        <h3 className="text-sm font-semibold">{weekDays[new Date(date + "T12:00:00").getDay()]} · {dateBR(date)}{date === localDate(new Date()) ? " · Hoje" : ""}</h3>
        {!withinSemester(date) ? <p className="text-xs text-muted-ink mt-2">Fora do semestre</p> : (byDay.get(date) ?? []).length ? data.shifts.map((shift) => { const rows = (byDay.get(date) ?? []).filter((item) => item.shiftId === shift.id); return rows.length ? <div key={shift.id} className="mt-3">
          <p className="text-xs font-semibold text-ink mb-1">{shift.name} · {rows.length} ocupação(ões)</p>
          <div className="space-y-1">{rows.map((item) => <Activity key={item.id} item={item} onSelect={setSelected} />)}</div>
        </div> : null; }) : <p className="text-xs text-muted-ink mt-2">Sem aula registrada · disponibilidade não confirmada</p>}
        {withinSemester(date) && (byDay.get(date) ?? []).some((item) => item.shiftId === null) && <p className="text-xs text-amber-800 mt-2">Há atividade sem turno identificado na lista abaixo.</p>}
      </section>)}</div>{!data.shifts.length && <p className="p-4 text-sm">Não há turnos cadastrados para montar a grade.</p>}
      {(weekDates.flatMap((date) => byDay.get(date) ?? []).filter((item) => item.shiftId === null)).length > 0 && <div className="p-4"><h3 className="font-semibold text-sm mb-2">Atividades sem turno identificado</h3><div className="space-y-2">{weekDates.flatMap((date) => byDay.get(date) ?? []).filter((item) => item.shiftId === null).map((item) => <Activity key={item.id} item={item} onSelect={setSelected} />)}</div></div>}</Card>}
      {view === "month" && <><Card className="p-3 sm:p-5 mb-5"><div className="mb-4"><SectionHeading title="Agenda do mês" subtitle="O número sob cada data indica ocupações. Selecione um dia para consultar detalhes e conflitos." /></div><div className="grid grid-cols-7 gap-1 text-xs text-center font-semibold text-muted-ink mb-2">{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((name) => <span key={name}>{name}</span>)}</div>
        <div className="grid grid-cols-7 gap-1">{Array.from({ length: firstDayOffset }, (_, index) => <span key={"blank-" + index} />)}{monthDates.map((date) => { const rows = byDay.get(date) ?? []; const count = rows.filter((item) => item.conflicts.length).length; return <button key={date} type="button" onClick={() => setSelectedDay(date)} disabled={!withinSemester(date)} aria-pressed={selectedDay === date}
          aria-label={`${dateBR(date)}: ${rows.length} atividade(s)${count ? `, ${count} conflito(s)` : ""}`}
          className={`min-h-16 sm:min-h-24 min-w-0 rounded-lg border p-1.5 sm:p-2 text-left text-[11px] sm:text-xs hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-40 ${selectedDay === date ? "border-sky-500 bg-sky-50" : date === localDate(new Date()) ? "border-sky-300 bg-sky-50/50" : "border-line"}`} aria-current={date === localDate(new Date()) ? "date" : undefined}>
          <strong className="block">{date.slice(8)}<span className="hidden sm:inline">{date === localDate(new Date()) ? " · Hoje" : ""}</span></strong><span className="block mt-1">{rows.length}<span className="hidden sm:inline"> atividade(s)</span></span>
          {rows.length > 0 && <span className="hidden sm:block text-muted-ink">{[...new Set(rows.map((item) => item.shiftName).filter(Boolean))].join(", ")}</span>}
          {count > 0 && <span className="block font-semibold text-rose-800">{count}<span className="hidden sm:inline"> conflito(s)</span>!</span>}
          {[...new Set(rows.map(special).filter(Boolean))].map((label) => <span key={label} className="hidden sm:block text-amber-800">{label}</span>)}
        </button>; })}</div></Card>
        {selectedDay && <Card className="p-4 mb-5"><h2 className="font-semibold mb-3">{dateBR(selectedDay)}</h2><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{(byDay.get(selectedDay) ?? []).length ? (byDay.get(selectedDay) ?? []).map((item) => <Activity key={item.id} item={item} onSelect={setSelected} />) : <p className="text-sm text-slate-600">Sem aula registrada.</p>}</div></Card>}</>}
      {view === "semester" && <><Card className="p-4 sm:p-5 mb-5"><div className="mb-4"><SectionHeading title="Distribuição no semestre" subtitle="Ocupações efetivas agrupadas por mês; selecione um mês para consultar os dias." /></div><div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
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
    </dl><div className="flex flex-wrap gap-2 mt-5">
      {selected.bookingRequestId && (admin || selected.originalTeacherId === user.id) && <button type="button" className="btn-secondary" onClick={() => onOpenRelated?.("Booking", selected.bookingRequestId!)}>Abrir reserva</button>}
      {selected.loanId && <button type="button" className="btn-secondary" onClick={() => onOpenRelated?.("Loan", selected.loanId!)}>Abrir empréstimo</button>}
      {(admin || selected.originalTeacherId === user.id) && onManage && <button type="button" className="btn-secondary" onClick={() => onManage(selected.date, selected.roomId, selected.id)}>Gerenciar esta ocupação</button>}
    </div></Modal>}
  </>;
}
