import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, downloadFile, post, read } from "../lib/api";
import { useData } from "../lib/data";
import { agendaPath, datesBetween, indexOccupations, isAgendaOccupation, movePeriod, period, summarize, weekStart, type TimelineView } from "../lib/roomTimeline";
import { dateBR, localDate, nextDate, resultMessage } from "../lib/utils";
import { Busy, Card, Field, Modal, Notice, Title } from "../components/UI";
import { AuditHistory } from "../components/AuditHistory";
import type { AgendaOccupation, OccupationMovePreview, User } from "../types";

const calendarLabels: Record<string, string> = {
  Presential: "Presencial", Ead: "EAD", Holiday: "Feriado", Recess: "Recesso",
  Planning: "Planejamento", NonTeaching: "Não letivo", NaoLetivo: "Não letivo",
};
const conflictLabels: Record<string, string> = {
  Room: "Ambiente", Teacher: "Professor", ClassGroup: "Turma",
  Loan: "Empréstimo", BookingStatus: "Estado da reserva",
};
const sourceLabels: Record<string, string> = {
  Booking: "Reserva", Schedule: "Grade", Planning: "Planejamento publicado", Block: "Bloqueio", Manual: "Registro manual",
};
const dayLabels: Record<string, string> = { Letivo: "Letivo", Ead: "EAD", NaoLetivo: "Não letivo" };
type ReversalPreview = OccupationMovePreview & { expectedLastChangeId: number; referenceChangeId: number };

function occupationLabel(item: AgendaOccupation) {
  return item.kind === "Bloqueio" ? "Bloqueio" :
    [item.actualTeacherName, item.actualClassGroupName].filter(Boolean).join(" · ") || "Ocupação registrada";
}

function OccupationButton({ item, onSelect, onDragStart, onDragEnd, dragging }: {
  item: AgendaOccupation; onSelect: (item: AgendaOccupation) => void;
  onDragStart?: (item: AgendaOccupation, event: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: () => void; dragging?: boolean;
}) {
  return <button type="button" onClick={() => onSelect(item)} draggable={Boolean(onDragStart)}
    onDragStart={(event) => onDragStart?.(item, event)} onDragEnd={onDragEnd}
    aria-label={`Detalhes: ${occupationLabel(item)}${onDragStart ? ". Arraste para remanejar." : ""}`}
    className={`block w-full text-left rounded-lg border p-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-600 ${item.conflicts.length ? "border-rose-300 bg-rose-50 text-rose-900" : "border-sky-200 bg-sky-50 text-sky-900"}`}>
    {dragging && <span className="block font-semibold mb-1">Movendo esta ocupação</span>}
    <span className="font-semibold">{item.conflicts.length ? "Conflito · " : "Ocupado · "}{occupationLabel(item)}</span>
    {item.curricularUnitName && <span className="block mt-1 text-slate-600">{item.curricularUnitName}</span>}
    {item.calendarKind && item.calendarKind !== "Presential" && <span className="block mt-1 text-amber-800">Dia especial · {calendarLabels[item.calendarKind] ?? "Calendário"}</span>}
    {item.dayStatus && item.dayStatus !== "Letivo" && <span className="block mt-1 text-amber-800">{dayLabels[item.dayStatus] ?? "Situação especial"}</span>}
  </button>;
}

export function RoomTimeline({ user, openBookings, initialFilter }: { user: User; openBookings: () => void; initialFilter?: { semesterId: number; roomId: number; anchor: string; shiftId?: number } | null }) {
  const { data, error: catalogError } = useData();
  const admin = user.roles.includes("Admin");
  const [view, setView] = useState<TimelineView>(initialFilter?.shiftId ? "month" : initialFilter ? "semester" : "week");
  const [anchor, setAnchor] = useState(initialFilter?.anchor ?? localDate(new Date()));
  const [semesterId, setSemesterId] = useState(initialFilter ? String(initialFilter.semesterId) : "");
  const [roomId, setRoomId] = useState(initialFilter ? String(initialFilter.roomId) : "");
  const [teacherId, setTeacherId] = useState("");
  const [classGroupId, setClassGroupId] = useState("");
  const [shiftId, setShiftId] = useState(initialFilter?.shiftId ? String(initialFilter.shiftId) : "");
  const [kind, setKind] = useState("");
  const [items, setItems] = useState<AgendaOccupation[] | null>(null);
  const [loadedQuery, setLoadedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const [selected, setSelected] = useState<AgendaOccupation | null>(null);
  const [selectedDay, setSelectedDay] = useState("");
  const [revision, setRevision] = useState(0);
  const [moveItem, setMoveItem] = useState<AgendaOccupation | null>(null);
  const [moveRoomId, setMoveRoomId] = useState("");
  const [moveDate, setMoveDate] = useState("");
  const [moveShiftId, setMoveShiftId] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [movePreview, setMovePreview] = useState<OccupationMovePreview | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState("");
  const [moveSuccess, setMoveSuccess] = useState("");
  const [reversal, setReversal] = useState<{ item: AgendaOccupation; changeId: number; action: "undo" | "redo" } | null>(null);
  const [reversalPreview, setReversalPreview] = useState<ReversalPreview | null>(null);
  const [reversalBusy, setReversalBusy] = useState(false);
  const [reversalError, setReversalError] = useState("");
  const [operationError, setOperationError] = useState("");
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragTarget, setDragTarget] = useState("");
  const previewRequest = useRef(0);
  const semester = data.semesters.find((s) => String(s.id) === semesterId);
  const range = period(view, anchor, semester);
  const rangeKey = range ? `${range.from}|${range.to}` : "";
  const classOptions = admin ? data.classes : data.classes.filter((c) => data.assignments.some((a) => a.classGroupId === c.id && a.teacherId === user.id));
  const query = range && (view !== "semester" || datesBetween(range.from, range.to).length <= 371)
    ? agendaPath(range, { semesterId, roomId, teacherId: admin ? teacherId : "", classGroupId, shiftId, kind }) : "";
  const queryKey = `${query}|${revision}`;

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
        setLoadedQuery(queryKey);
      }
    }).catch((reason: unknown) => {
      if (!current) return;
      const message = reason instanceof ApiError && reason.status === 403
        ? "Você não tem permissão para consultar este filtro."
        : resultMessage(reason);
      setError(message);
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [query, revision]);

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

  function beginMove(item: AgendaOccupation, target?: { roomId: number; date: string; shiftId: number }) {
    if (!admin || item.kind === "Bloqueio") return;
    previewRequest.current++;
    setSelected(null);
    setMoveItem(item);
    setMoveRoomId(String(target?.roomId ?? item.roomId));
    setMoveDate(target?.date ?? item.date);
    setMoveShiftId(String(target?.shiftId ?? item.shiftId ?? ""));
    setMoveReason("");
    setMovePreview(null);
    setMoveError("");
    setOperationError("");
    setMoveSuccess("");
    if (target) void requestMovePreview(item, target.roomId, target.date, target.shiftId);
  }
  function updateMove(setter: (value: string) => void, value: string) {
    previewRequest.current++;
    setter(value);
    setMovePreview(null);
    setMoveError("");
  }
  async function requestMovePreview(item: AgendaOccupation, room: number, date: string, shift: number) {
    const requestId = ++previewRequest.current;
    setMoveBusy(true);
    setMoveError("");
    setMovePreview(null);
    try {
      const result = await post<OccupationMovePreview>(`/occupations/${item.id}/move-preview`,
        { roomId: room, date, shiftId: shift });
      if (requestId === previewRequest.current) setMovePreview(result);
    } catch (reason) {
      if (requestId === previewRequest.current) setMoveError(resultMessage(reason));
    } finally {
      if (requestId === previewRequest.current) setMoveBusy(false);
    }
  }
  async function confirmMove() {
    if (!moveItem || !movePreview?.allowed || moveBusy) return;
    setMoveBusy(true);
    setMoveError("");
    try {
      await post(`/occupations/${moveItem.id}/move`, {
        roomId: Number(moveRoomId), date: moveDate, shiftId: Number(moveShiftId),
        expectedRoomId: movePreview.origin.roomId,
        expectedStartsAt: movePreview.origin.startsAt,
        expectedEndsAt: movePreview.origin.endsAt,
        confirm: true, reason: moveReason.trim() || null,
      });
      setMoveItem(null);
      setOperationError("");
      setMoveSuccess("Ocupação remanejada. O cronograma foi atualizado.");
      setRevision((value) => value + 1);
    } catch (reason) {
      setMoveItem(null);
      setOperationError(resultMessage(reason));
      setRevision((value) => value + 1);
    } finally {
      setMoveBusy(false);
    }
  }
  async function beginReversal(item: AgendaOccupation, changeId: number, action: "undo" | "redo") {
    if (!admin) return;
    setSelected(null);
    setReversal({ item, changeId, action });
    setReversalPreview(null);
    setReversalError("");
    setReversalBusy(true);
    try {
      const preview = await read<ReversalPreview>(`/occupations/${item.id}/moves/${changeId}/${action}/preview`);
      setReversalPreview(preview);
    } catch (reason) { setReversalError(resultMessage(reason)); }
    finally { setReversalBusy(false); }
  }
  async function confirmReversal() {
    if (!reversal || !reversalPreview?.allowed || reversalBusy) return;
    setReversalBusy(true);
    setReversalError("");
    try {
      await post(`/occupations/${reversal.item.id}/moves/${reversal.changeId}/${reversal.action}`, {
        confirm: true, expectedLastChangeId: reversalPreview.expectedLastChangeId,
        expectedRoomId: reversalPreview.origin.roomId,
        expectedStartsAt: reversalPreview.origin.startsAt,
        expectedEndsAt: reversalPreview.origin.endsAt,
      });
      setMoveSuccess(reversal.action === "undo" ? "Movimentação desfeita." : "Movimentação refeita.");
      setReversal(null);
      setRevision((value) => value + 1);
    } catch (reason) { setReversalError(resultMessage(reason)); }
    finally { setReversalBusy(false); }
  }
  const previewMatches = movePreview?.destination.roomId === Number(moveRoomId) &&
    movePreview.destination.date === moveDate && movePreview.destination.shiftId === Number(moveShiftId);
  function startDrag(item: AgendaOccupation, event: React.DragEvent<HTMLButtonElement>) {
    event.dataTransfer.setData("text/plain", String(item.id));
    event.dataTransfer.effectAllowed = "move";
    setDraggingId(item.id);
  }
  function dropOn(roomId: number, date: string, shiftId: number, event: React.DragEvent<HTMLTableCellElement>) {
    event.preventDefault();
    const id = Number(event.dataTransfer.getData("text/plain"));
    const item = items?.find((row) => row.id === id);
    setDraggingId(null);
    setDragTarget("");
    if (item) beginMove(item, { roomId, date, shiftId });
  }
  async function exportCurrentPeriod() {
    if (!admin || !range || exportBusy) return;
    const params = new URLSearchParams();
    if (view === "semester" && semesterId) params.set("semesterId", semesterId);
    else {
      params.set("from", range.from);
      params.set("to", nextDate(range.to, -1));
    }
    if (roomId) params.set("roomId", roomId);
    if (shiftId) params.set("shiftId", shiftId);
    setExportBusy(true); setExportError("");
    try { await downloadFile(`/exports/Ocupacoes?${params.toString()}`); }
    catch (reason) { setExportError(resultMessage(reason)); }
    finally { setExportBusy(false); }
  }

  return <>
    <Title title="Cronograma de Ambientes" subtitle={`Consulta institucional · ${periodName}`}
      action={<div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={openBookings}>Abrir reservas</button>
        {admin && <button type="button" className="btn-secondary" disabled={!range || exportBusy} onClick={() => void exportCurrentPeriod()}>{exportBusy ? "Gerando Excel..." : "Exportar ocupações"}</button>}</div>} />
    {exportError && <div className="mb-4"><Notice type="error" message={exportError} onClose={() => setExportError("")} /></div>}
    {admin && (teacherId || classGroupId || kind) && <p className="mb-4 text-sm text-amber-800" role="status">A exportação preserva período, ambiente e turno. Os filtros de professor, turma e tipo não são aplicados ao arquivo.</p>}
    {moveSuccess && <div className="mb-4"><Notice type="success" message={moveSuccess} onClose={() => setMoveSuccess("")} /></div>}
    {operationError && <div className="mb-4"><Notice message={operationError} onClose={() => setOperationError("")} /></div>}
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
    {!loading && !error && items && loadedQuery === queryKey && !catalogError && <>
      {items.length === 0 && <div className="mb-4"><Notice type="info" message="Nenhuma ocupação registrada no período e filtros selecionados. Isso não confirma disponibilidade para novas reservas." /></div>}
      {view === "week" && <Card className="overflow-x-auto mb-5">
        <table className="w-full min-w-[930px] text-sm border-collapse">
          <thead><tr><th className="sticky left-0 z-10 bg-white p-3 text-left border-b border-r border-slate-200 min-w-44">Ambiente / turno</th>
            {visibleDates.map((date) => <th key={date} className="p-3 border-b border-slate-200 text-left min-w-36">{new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}</th>)}</tr></thead>
          <tbody>{rooms.flatMap((room) => shifts.map((shift) => <tr key={`${room.id}-${shift.id}`}>
            <th scope="row" className="sticky left-0 bg-white p-3 border-b border-r border-slate-200 text-left align-top font-semibold">{room.name}<span className="block text-xs font-normal text-slate-500">{shift.name}</span></th>
            {visibleDates.map((date) => {
              const rows = bySlot.get(`${room.id}|${date}|${shift.id}`) ?? [];
              const slotKey = `${room.id}|${date}|${shift.id}`;
              return <td key={date} onDragOver={(event) => { if (admin && draggingId !== null && range && date >= range.from && date < range.to) { event.preventDefault(); setDragTarget(slotKey); } }}
                onDragLeave={() => { if (dragTarget === slotKey) setDragTarget(""); }}
                onDrop={(event) => { if (admin && range && date >= range.from && date < range.to) dropOn(room.id, date, shift.id, event); }}
                className={`border-b border-slate-100 p-2 align-top ${dragTarget === slotKey ? "bg-sky-100 ring-2 ring-inset ring-sky-500" : ""}`}>
                {range && date >= range.from && date < range.to ? rows.length ? <div className="space-y-1">{rows.length > 1 && <p className="text-xs font-bold text-rose-700">{rows.length} ocupações simultâneas</p>}{rows.map((item) => <OccupationButton key={item.id} item={item} onSelect={setSelected} onDragStart={admin && item.kind !== "Bloqueio" ? startDrag : undefined} onDragEnd={() => { setDraggingId(null); setDragTarget(""); }} dragging={draggingId === item.id} />)}</div> :
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
      ] as [string, string][]).map(([label, value]) => <div key={label}><dt className="font-semibold text-slate-600">{label}</dt><dd className="text-slate-800">{value}</dd></div>)}</dl>
      {(admin || selected.originalTeacherId === user.id) && <div className="mt-5 border-t border-slate-200 pt-4"><h3 className="font-semibold mb-2">Histórico de alterações</h3><AuditHistory type="Occupation" id={selected.id} onReverse={admin ? (changeId, action) => void beginReversal(selected, changeId, action) : undefined} /></div>}
      {admin && selected.kind !== "Bloqueio" && <button type="button" className="btn-primary mt-5" onClick={() => beginMove(selected)}>Mover ocupação</button>}
    </Modal>}
    {reversal && <Modal title={reversal.action === "undo" ? "Desfazer movimentação" : "Refazer movimentação"} onClose={() => { if (!reversalBusy) setReversal(null); }}>
      <div className="space-y-3 text-sm">
        <p>Ocupação {reversal.item.id} · movimentação {reversal.changeId}</p>
        {reversalBusy && <p role="status">Processando...</p>}
        {reversalError && <Notice message={reversalError} />}
        {reversalPreview && <>
          <p>Atual: {reversalPreview.origin.roomName} · {dateBR(reversalPreview.origin.date)} · {reversalPreview.origin.shiftName}</p>
          <p>Destino: {reversalPreview.destination.roomName} · {dateBR(reversalPreview.destination.date)} · {reversalPreview.destination.shiftName}</p>
          <p>{reversalPreview.allowed ? "Movimentação permitida" : "Movimentação impedida"}</p>
          {reversalPreview.blocks.map((block) => <p key={block} className="text-rose-700">{block}</p>)}
          {reversalPreview.warnings.map((warning) => <p key={warning} className="text-amber-800">{warning}</p>)}
        </>}
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-secondary" disabled={reversalBusy} onClick={() => setReversal(null)}>Cancelar</button>
          <button type="button" className="btn-primary" disabled={reversalBusy || !reversalPreview?.allowed} onClick={() => void confirmReversal()}>
            {reversal.action === "undo" ? "Confirmar desfazer" : "Confirmar refazer"}
          </button>
        </div>
      </div>
    </Modal>}
    {moveItem && <Modal title="Remanejar ocupação" onClose={() => { if (!moveBusy) { previewRequest.current++; setMoveItem(null); } }}>
      <div className="space-y-4 text-sm">
        <p><strong>{moveItem.actualTeacherName ?? "Professor não informado"}</strong>{moveItem.actualClassGroupName ? ` · ${moveItem.actualClassGroupName}` : ""}</p>
        <p><strong>Origem:</strong> {moveItem.roomName} · {dateBR(moveItem.date)} · {moveItem.shiftName ?? "Turno não identificado"}</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Novo ambiente"><select className="field" value={moveRoomId} disabled={moveBusy} onChange={(event) => updateMove(setMoveRoomId, event.target.value)}>
            {data.rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
          </select></Field>
          <Field label="Nova data"><input type="date" className="field" value={moveDate} disabled={moveBusy} onChange={(event) => updateMove(setMoveDate, event.target.value)} /></Field>
          <Field label="Novo turno"><select className="field" value={moveShiftId} disabled={moveBusy} onChange={(event) => updateMove(setMoveShiftId, event.target.value)}>
            <option value="">Selecione</option>{data.shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name}</option>)}
          </select></Field>
        </div>
        <Field label="Motivo (opcional)"><input className="field" maxLength={500} value={moveReason} disabled={moveBusy} onChange={(event) => setMoveReason(event.target.value)} /></Field>
        {moveError && <Notice message={moveError} />}
        {moveBusy && <p role="status">Processando...</p>}
        {movePreview && previewMatches && <div className="rounded-xl border border-slate-200 p-4 space-y-2">
          <p className="font-semibold">Prévia · {movePreview.allowed ? "Movimentação permitida" : "Movimentação impedida"}</p>
          <p>Destino: {movePreview.destination.roomName} · {dateBR(movePreview.destination.date)} · {movePreview.destination.shiftName}</p>
          <p>Registros afetados: somente esta ocupação.</p>
          {movePreview.technicalClassification === "Compatible" && <p>Compatibilidade técnica comprovada.</p>}
          {movePreview.technicalClassification === "Unknown" && <p>Compatibilidade técnica detalhada não comprovada.</p>}
          {movePreview.blocks.map((block) => <p key={block} className="text-rose-700">Impedimento: {block}</p>)}
          {movePreview.warnings.map((warning) => <p key={warning} className="text-amber-800">Atenção: {warning}</p>)}
          {movePreview.technicalFindings.filter((finding) => finding.status !== "Met").map((finding) => <p key={finding.requirement} className="text-slate-600">{finding.detail}</p>)}
        </div>}
        <div className="flex flex-wrap gap-2 justify-end">
          <button type="button" className="btn-secondary" disabled={moveBusy} onClick={() => { previewRequest.current++; setMoveItem(null); }}>Cancelar</button>
          <button type="button" className="btn-secondary" disabled={moveBusy || !moveRoomId || !moveDate || !moveShiftId} onClick={() => void requestMovePreview(moveItem, Number(moveRoomId), moveDate, Number(moveShiftId))}>Consultar prévia</button>
          <button type="button" className="btn-primary" disabled={moveBusy || !movePreview?.allowed || !previewMatches} onClick={() => void confirmMove()}>Confirmar movimentação</button>
        </div>
      </div>
    </Modal>}
  </>;
}
