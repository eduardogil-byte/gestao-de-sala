import { useEffect, useMemo, useState } from "react";
import { ApiError, read } from "../lib/api";
import { useData } from "../lib/data";
import { agendaPath, datesBetween, indexOccupations, isAgendaOccupation, movePeriod, period, summarize, weekStart, type TimelineView } from "../lib/roomTimeline";
import { dateBR, localDate, nextDate, resultMessage } from "../lib/utils";
import { Busy, Card, Field, Modal, Notice, Title } from "../components/UI";
import type { AgendaOccupation, User } from "../types";

const calendarLabels: Record<string, string> = {
  Presential: "Presencial", Ead: "EAD", Holiday: "Feriado", Recess: "Recesso",
  Planning: "Planejamento", NonTeaching: "Não letivo", NaoLetivo: "Não letivo",
};
const conflictLabels: Record<string, string> = {
  Room: "Ambiente", Teacher: "Professor", ClassGroup: "Turma",
  Loan: "Empréstimo", BookingStatus: "Estado da reserva",
};
const sourceLabels: Record<string, string> = {
  Booking: "Reserva", Schedule: "Grade", Block: "Bloqueio", Manual: "Registro manual",
};
const dayLabels: Record<string, string> = { Letivo: "Letivo", Ead: "EAD", NaoLetivo: "Não letivo" };

function occupationLabel(item: AgendaOccupation) {
  return item.kind === "Bloqueio" ? "Bloqueio" :
    [item.actualTeacherName, item.actualClassGroupName].filter(Boolean).join(" · ") || "Ocupação registrada";
}

function OccupationButton({ item, onSelect }: { item: AgendaOccupation; onSelect: (item: AgendaOccupation) => void }) {
  return <button type="button" onClick={() => onSelect(item)}
    className={`block w-full text-left rounded-lg border p-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-600 ${item.conflicts.length ? "border-rose-300 bg-rose-50 text-rose-900" : "border-sky-200 bg-sky-50 text-sky-900"}`}>
    <span className="font-semibold">{item.conflicts.length ? "Conflito · " : "Ocupado · "}{occupationLabel(item)}</span>
    {item.curricularUnitName && <span className="block mt-1 text-slate-600">{item.curricularUnitName}</span>}
    {item.calendarKind && item.calendarKind !== "Presential" && <span className="block mt-1 text-amber-800">Dia especial · {calendarLabels[item.calendarKind] ?? "Calendário"}</span>}
    {item.dayStatus && item.dayStatus !== "Letivo" && <span className="block mt-1 text-amber-800">{dayLabels[item.dayStatus] ?? "Situação especial"}</span>}
  </button>;
}

export function RoomTimeline({ user, openBookings }: { user: User; openBookings: () => void }) {
  const { data, error: catalogError } = useData();
  const admin = user.roles.includes("Admin");
  const [view, setView] = useState<TimelineView>("week");
  const [anchor, setAnchor] = useState(localDate(new Date()));
  const [semesterId, setSemesterId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [classGroupId, setClassGroupId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [kind, setKind] = useState("");
  const [items, setItems] = useState<AgendaOccupation[] | null>(null);
  const [loadedQuery, setLoadedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AgendaOccupation | null>(null);
  const [selectedDay, setSelectedDay] = useState("");
  const semester = data.semesters.find((s) => String(s.id) === semesterId);
  const range = period(view, anchor, semester);
  const rangeKey = range ? `${range.from}|${range.to}` : "";
  const classOptions = admin ? data.classes : data.classes.filter((c) => data.assignments.some((a) => a.classGroupId === c.id && a.teacherId === user.id));
  const query = range && (view !== "semester" || datesBetween(range.from, range.to).length <= 371)
    ? agendaPath(range, { semesterId, roomId, teacherId: admin ? teacherId : "", classGroupId, shiftId, kind }) : "";

  useEffect(() => {
    let current = true;
    setItems(null);
    setLoadedQuery("");
    setError("");
    setSelectedDay("");
    setSelected(null);
    if (!query) { setLoading(false); return () => { current = false; }; }
    setLoading(true);
    read<unknown>(query).then((rows) => {
      if (current) {
        if (!Array.isArray(rows) || !rows.every(isAgendaOccupation))
          throw new Error("A API retornou dados incompletos. A ocupação não pode ser apresentada com segurança.");
        setItems(rows);
        setLoadedQuery(query);
      }
    }).catch((reason: unknown) => {
      if (!current) return;
      const message = reason instanceof ApiError && reason.status === 403
        ? "Você não tem permissão para consultar este filtro."
        : resultMessage(reason);
      setError(message);
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [query]);

  const { slots: bySlot, days: byDay } = useMemo(() => indexOccupations(items ?? []), [items]);
  const busiestMonth = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items ?? []) counts.set(item.date.slice(0, 7), (counts.get(item.date.slice(0, 7)) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  }, [items]);
  const rooms = roomId ? data.rooms.filter((r) => String(r.id) === roomId) : data.rooms;
  const shifts = shiftId ? data.shifts.filter((s) => String(s.id) === shiftId) : data.shifts;
  const visibleDates = view === "week" ? datesBetween(weekStart(anchor), nextDate(weekStart(anchor), 7)) :
    view === "month" ? datesBetween(`${anchor.slice(0, 7)}-01`, nextDate(`${anchor.slice(0, 7)}-01`, 32).slice(0, 7) + "-01") : [];
  const monthStart = `${anchor.slice(0, 7)}-01`;
  const monthDates = view === "month" ? datesBetween(weekStart(monthStart), nextDate(visibleDates[visibleDates.length - 1] ?? monthStart, 1)) : [];
  const rangeValid = Boolean(query);
  const periodName = view === "semester" ? semester?.name ?? "Selecione um semestre" :
    view === "week" ? `${dateBR(visibleDates[0])} a ${dateBR(visibleDates[6])}` :
      new Date(`${monthStart}T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  function navigate(direction: number) {
    if (view === "semester") {
      const index = data.semesters.findIndex((s) => String(s.id) === semesterId);
      const next = data.semesters[index - direction];
      if (next) setSemesterId(String(next.id));
    } else setAnchor(movePeriod(view, anchor, direction));
  }
  function changeView(next: TimelineView) {
    if (next === "semester" && !semesterId) {
      const matching = data.semesters.find((s) => s.startDate <= anchor && s.endDate >= anchor);
      setSemesterId(String((matching ?? data.semesters[0])?.id ?? ""));
    }
    setView(next);
  }
  function clearFilters() {
    setSemesterId(""); setRoomId(""); setTeacherId(""); setClassGroupId(""); setShiftId(""); setKind("");
  }
  function daySummary(date: string) {
    const rows = byDay.get(date) ?? [];
    const summary = summarize(rows);
    return { rows, conflicts: summary.conflicts, specials: summary.specialDays };
  }
  function dailyDetails(date: string) {
    const summary = daySummary(date);
    return <div className="space-y-3">
      <h2 className="font-semibold text-slate-800">{dateBR(date)} · {summary.rows.length} ocupação(ões)</h2>
      {summary.rows.length ? summary.rows.map((item) => <OccupationButton key={item.id} item={item} onSelect={setSelected} />) :
        <p className="text-sm text-slate-600">Sem ocupação registrada neste filtro. Disponibilidade não confirmada.</p>}
    </div>;
  }

  return <>
    <Title title="Cronograma de Ambientes" subtitle={`Consulta institucional · ${periodName}`}
      action={<button type="button" className="btn-secondary" onClick={openBookings}>Abrir reservas</button>} />
    <Card className="p-4 mb-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["week", "month", "semester"] as TimelineView[]).map((choice) => <button key={choice} type="button"
          aria-pressed={view === choice} onClick={() => changeView(choice)}
          className={view === choice ? "btn-primary" : "btn-secondary"}>
          {{ week: "Semana", month: "Mês", semester: "Semestre" }[choice]}
        </button>)}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)} aria-label="Período anterior">‹</button>
          <span className="text-sm font-semibold text-slate-700 min-w-40 text-center capitalize">{periodName}</span>
          <button type="button" className="btn-secondary" onClick={() => navigate(1)} aria-label="Próximo período">›</button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        <Field label="Semestre"><select className="field" value={semesterId} onChange={(e) => { setSemesterId(e.target.value); setClassGroupId(""); }}>
          <option value="">Todos</option>{data.semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></Field>
        <Field label="Ambiente"><select className="field" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="">Todos</option>{data.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select></Field>
        {admin && <Field label="Professor"><select className="field" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
          <option value="">Todos</option>{data.teachers.map((t) => <option key={t.id} value={t.id}>{t.displayName}</option>)}
        </select></Field>}
        <Field label="Turma"><select className="field" value={classGroupId} onChange={(e) => setClassGroupId(e.target.value)}>
          <option value="">Todas</option>{classOptions.filter((c) => !semesterId || String(c.semesterId) === semesterId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></Field>
        <Field label="Turno"><select className="field" value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
          <option value="">Todos</option>{data.shifts.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.startsAt.slice(0, 5)}–{s.endsAt.slice(0, 5)}</option>)}
        </select></Field>
        <Field label="Tipo"><select className="field" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Todos</option><option value="Aula">Aula</option><option value="Avulsa">Avulsa</option><option value="Bloqueio">Bloqueio</option>
        </select></Field>
      </div>
      <button type="button" className="btn-quiet" onClick={clearFilters}>Limpar filtros</button>
    </Card>
    <p className="text-xs text-slate-600 mb-4">Legenda: <strong>Ocupado</strong> · <strong>Conflito</strong> · <strong>Sem registro</strong> (disponibilidade desconhecida) · <strong>Dia especial</strong>. Dias especiais aparecem quando vinculados a ocupações retornadas pela API. A confirmação de uma nova reserva ocorre na tela Reservas.</p>
    {catalogError && <div className="mb-4"><Notice message={`Não foi possível carregar os cadastros: ${catalogError}. A grade não pode identificar períodos sem registro.`} /></div>}
    {!rangeValid && <Notice message={view === "semester" && semester && datesBetween(semester.startDate, nextDate(semester.endDate, 1)).length > 371
      ? "Este semestre excede 371 dias; consulte semanas ou meses. Nenhum resultado parcial é exibido."
      : view === "semester" ? "Selecione um semestre cadastrado." : "O período está fora do semestre selecionado."} />}
    {error && <Notice message={error} />}
    {loading && <Busy />}
    {!loading && !error && items && loadedQuery === query && !catalogError && <>
      {items.length === 0 && <div className="mb-4"><Notice type="info" message="Nenhuma ocupação registrada no período e filtros selecionados. Isso não confirma disponibilidade para novas reservas." /></div>}
      {view === "week" && <Card className="overflow-x-auto mb-5">
        <table className="w-full min-w-[930px] text-sm border-collapse">
          <thead><tr><th className="sticky left-0 z-10 bg-white p-3 text-left border-b border-r border-slate-200 min-w-44">Ambiente / turno</th>
            {visibleDates.map((date) => <th key={date} className="p-3 border-b border-slate-200 text-left min-w-36">{new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}</th>)}</tr></thead>
          <tbody>{rooms.flatMap((room) => shifts.map((shift) => <tr key={`${room.id}-${shift.id}`}>
            <th scope="row" className="sticky left-0 bg-white p-3 border-b border-r border-slate-200 text-left align-top font-semibold">{room.name}<span className="block text-xs font-normal text-slate-500">{shift.name}</span></th>
            {visibleDates.map((date) => {
              const rows = bySlot.get(`${room.id}|${date}|${shift.id}`) ?? [];
              return <td key={date} className="border-b border-slate-100 p-2 align-top">
                {range && date >= range.from && date < range.to ? rows.length ? <div className="space-y-1">{rows.length > 1 && <p className="text-xs font-bold text-rose-700">{rows.length} ocupações simultâneas</p>}{rows.map((item) => <OccupationButton key={item.id} item={item} onSelect={setSelected} />)}</div> :
                  <span className="text-xs text-slate-500">Sem registro · aplicabilidade do turno desconhecida</span> : <span className="text-xs text-slate-500">Fora do semestre</span>}
              </td>;
            })}</tr>))}</tbody>
        </table>
        {!rooms.length || !shifts.length ? <p className="p-4 text-sm text-slate-600">Cadastre ambientes e turnos para visualizar a grade.</p> : null}
      </Card>}
      {view === "week" && items.some((item) => item.shiftId === null || !rooms.some((room) => room.id === item.roomId) || !shifts.some((shift) => shift.id === item.shiftId)) && <Card className="p-4 mb-5 space-y-2"><h2 className="font-semibold">Ocupações fora da grade visível</h2>
        {items.filter((item) => item.shiftId === null || !rooms.some((room) => room.id === item.roomId) || !shifts.some((shift) => shift.id === item.shiftId)).map((item) => <div key={item.id}><span className="text-xs text-slate-500">{dateBR(item.date)} · {item.roomName || "Ambiente não identificado"} · {item.startsAt.slice(11, 16)}–{item.endsAt.slice(11, 16)}</span><OccupationButton item={item} onSelect={setSelected} /></div>)}
      </Card>}
      {view === "month" && <Card className="p-3 mb-5"><div className="grid grid-cols-7 text-xs sm:text-sm">
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((label) => <div key={label} className="p-2 font-semibold text-slate-600">{label}</div>)}
        {monthDates.map((date) => {
          const summary = daySummary(date);
          const inside = range && date >= range.from && date < range.to;
          return <button type="button" key={date} disabled={!inside} onClick={() => setSelectedDay(date)}
            className={`min-h-24 p-2 border border-slate-100 text-left align-top focus:ring-2 focus:ring-sky-600 ${inside ? "hover:bg-sky-50" : "bg-slate-50 text-slate-400"}`}>
            <span className="font-semibold">{date.slice(8)}</span>
            {inside && <><span className="block mt-1">{summary.rows.length} ocupação(ões)</span>
              {summary.conflicts > 0 && <span className="block text-rose-700 font-semibold">{summary.conflicts} conflito(s)</span>}
              {summary.specials.map((kind) => <span key={kind} className="block text-amber-800">{calendarLabels[kind] ?? "Dia especial"}</span>)}
              {!summary.rows.length && <span className="block text-slate-500">Sem registro</span>}</>}
          </button>;
        })}</div></Card>}
      {view === "month" && selectedDay && <Card className="p-4 mb-5">{dailyDetails(selectedDay)}</Card>}
      {view === "semester" && semester && <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-5">
        {datesBetween(semester.startDate, nextDate(semester.endDate, 1)).filter((date, index, dates) => index === 0 || date.slice(0, 7) !== dates[index - 1].slice(0, 7)).map((date) => {
          const end = nextDate(`${date.slice(0, 7)}-01`, 32).slice(0, 7) + "-01";
          const dates = datesBetween(date, end < nextDate(semester.endDate, 1) ? end : nextDate(semester.endDate, 1));
          const rows = dates.flatMap((day) => byDay.get(day) ?? []);
          const conflicts = summarize(rows).conflicts;
          return <Card key={date} className="p-4"><h2 className="capitalize font-semibold">{new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h2>
            <p className="text-sm mt-2">{rows.length} ocupação(ões)</p><p className="text-sm text-rose-700">{conflicts} conflito(s)</p>
            {busiestMonth === date.slice(0, 7) && <p className="text-xs font-semibold text-sky-700 mt-1">Maior número de ocupações no semestre</p>}
            <button type="button" className="btn-quiet mt-2" onClick={() => { setAnchor(date); setView("month"); }}>Ver mês</button>
          </Card>;
        })}
      </div>}
    </>}
    {selected && <Modal title="Detalhes da ocupação" onClose={() => setSelected(null)}><dl className="grid sm:grid-cols-2 gap-3 text-sm">
      {([[
        "Ambiente", selected.roomName], ["Data", dateBR(selected.date)], ["Turno", selected.shiftName ?? `${selected.startsAt.slice(11, 16)}–${selected.endsAt.slice(11, 16)} (sem turno correspondente)`],
        ["Professor efetivo", selected.actualTeacherName ?? "Não informado ou não autorizado"], ["Turma", selected.actualClassGroupName ?? "Não informada ou não autorizada"],
        ["Curso", selected.courseName ?? "Não vinculado ou não autorizado"], ["UC", selected.curricularUnitName ?? "Não vinculada ou não autorizada"],
        ["Capacidade", selected.curricularCapabilityDescription ?? "Não vinculada ou não autorizada"], ["Situação", selected.bookingStatus ?? ({ Confirmed: "Confirmada", Blocked: "Bloqueada" }[selected.status] ?? "Não informada")],
        ["Origem", sourceLabels[selected.source] ?? "Não informada"], ["Dia letivo", dayLabels[selected.dayStatus ?? ""] ?? "Não informado"],
        ["Calendário", selected.calendarKind ? calendarLabels[selected.calendarKind] ?? "Dia especial" : "Não informado"],
        ["Motivo do calendário", selected.calendarReason ?? "Não informado"],
        ["Conflitos", selected.conflicts.length ? selected.conflicts.map((reason) => conflictLabels[reason] ?? "Inconsistência sinalizada").join(", ") : "Nenhum sinalizado"]
      ] as [string, string][]).map(([label, value]) => <div key={label}><dt className="font-semibold text-slate-600">{label}</dt><dd className="text-slate-800">{value}</dd></div>)}</dl></Modal>}
  </>;
}
