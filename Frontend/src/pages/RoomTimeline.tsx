import { WeeklyOccupations } from "../components/WeeklyOccupations";
import { Children, isValidElement, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { ApiError, downloadFile, post, read } from "../lib/api";
import { useData } from "../lib/data";
import { agendaPath, datesBetween, indexOccupations, isAgendaOccupation, movePeriod, period, summarize, weekStart, type TimelineView } from "../lib/roomTimeline";
import { dateBR, formatMonthWeek, localDate, nextDate, resultMessage } from "../lib/utils";
import { Busy, Card, Field, MetricCard, Modal, Notice, SectionHeading, Title } from "../components/UI";
import { AuditHistory } from "../components/AuditHistory";
import type { AgendaOccupation, OccupationBlockMovePreview, OccupationMovePreview, User } from "../types";

const calendarLabels: Record<string, string> = {
  Presential: "Presencial", Ead: "EAD", Holiday: "Feriado", Recess: "Recesso",
  Planning: "Planejamento", NonTeaching: "Não letivo", NaoLetivo: "Não letivo",
};
const conflictLabels: Record<string, string> = {
  Room: "Ambiente", Teacher: "Instrutor", ClassGroup: "Turma",
  Loan: "Empréstimo", BookingStatus: "Estado da reserva",
};
const sourceLabels: Record<string, string> = {
  Booking: "Reserva", Schedule: "Grade", Planning: "Planejamento publicado", Block: "Bloqueio", Manual: "Registro manual",
};
const dayLabels: Record<string, string> = { Letivo: "Letivo", Ead: "EAD", NaoLetivo: "Não letivo" };
type ReversalPreview = OccupationMovePreview & { expectedLastChangeId: number; referenceChangeId: number };

function TimelineFilterField({ label, children }: { label: string; children: React.ReactElement<React.SelectHTMLAttributes<HTMLSelectElement>> }) {
  const selected = Children.toArray(children.props.children).find(child => isValidElement<{ value?: string | number }>(child) && String(child.props.value) === String(children.props.value));
  return <Field label={label}>{children}{children.props.value && isValidElement<{ children?: React.ReactNode }>(selected) && <span className="mt-1 block text-xs text-muted-ink [overflow-wrap:anywhere] sm:hidden">{selected.props.children}</span>}</Field>;
}

function occupationLabel(item: AgendaOccupation) {
  return item.kind === "Bloqueio" ? "Bloqueio" :
    [item.actualTeacherName, item.actualClassGroupName].filter(Boolean).join(" · ") || "Ocupação registrada";
}

function OccupationButton({ item, onSelect, onDragStart, onDragEnd, dragging, compact = false }: {
  item: AgendaOccupation; onSelect: (item: AgendaOccupation) => void;
  onDragStart?: (item: AgendaOccupation, event: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: () => void; dragging?: boolean; compact?: boolean;
}) {
  return <button type="button" onClick={() => onSelect(item)} draggable={Boolean(onDragStart)}
    onDragStart={(event) => onDragStart?.(item, event)} onDragEnd={onDragEnd}
    aria-label={`Detalhes: ${occupationLabel(item)}, ${item.roomName}, ${dateBR(item.date)}${onDragStart ? ". Arraste para remanejar ou clique para abrir a movimentação." : ""}`}
    className={`block w-full text-left rounded-lg border-l-4 border p-2.5 text-xs leading-5 transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${item.conflicts.length ? "border-rose-300 bg-rose-50 text-rose-900" : item.kind === "Bloqueio" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-sky-200 bg-sky-50 text-sky-900"}`}>
    {dragging && <span className="block font-semibold mb-1">Movendo esta ocupação</span>}
    <span className="font-semibold">{item.conflicts.length ? "Conflito · " : item.kind === "Bloqueio" ? "Bloqueio · " : "Ocupado · "}{occupationLabel(item)}</span>
    {(item.courseName || item.curricularUnitName) && <span className="block mt-1">{[item.courseName, item.curricularUnitName].filter(Boolean).join(" · ")}</span>}
    {!compact && <span className="block opacity-80">{item.roomName} · {item.shiftName ?? `${item.startsAt.slice(11, 16)}–${item.endsAt.slice(11, 16)}`}</span>}
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
  const [roomKind, setRoomKind] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [classGroupId, setClassGroupId] = useState("");
  const [shiftId, setShiftId] = useState(initialFilter?.shiftId ? String(initialFilter.shiftId) : "");
  const [kind, setKind] = useState("");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const activeFilterCount = [semesterId, roomKind, roomId, admin ? teacherId : "", classGroupId, shiftId, kind].filter(Boolean).length;
  useEffect(() => {
    if (!filtersExpanded) return;
    filtersRef.current?.querySelector("select")?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!filtersRef.current?.contains(event.target as Node)) setFiltersExpanded(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setFiltersExpanded(false); filtersButtonRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [filtersExpanded]);
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
  const [blockItem, setBlockItem] = useState<AgendaOccupation | null>(null);
  const [blockRoomId, setBlockRoomId] = useState("");
  const [blockStartDate, setBlockStartDate] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [blockPreview, setBlockPreview] = useState<OccupationBlockMovePreview | null>(null);
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockError, setBlockError] = useState("");
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

  const roomKinds = useMemo(() => [...new Set(data.rooms.map((room) => room.kind).filter(Boolean))].sort(), [data.rooms]);
  const rooms = useMemo(() => data.rooms.filter((room) => (!roomId || String(room.id) === roomId) && (!roomKind || room.kind === roomKind)), [data.rooms, roomId, roomKind]);
  const visibleItems = useMemo(() => {
    if (!roomKind) return items ?? [];
    const roomIds = new Set(rooms.map((room) => room.id));
    return (items ?? []).filter((item) => roomIds.has(item.roomId));
  }, [items, roomKind, rooms]);
  const { slots: bySlot, days: byDay } = useMemo(() => indexOccupations(visibleItems), [visibleItems]);
  const summary = useMemo(() => summarize(visibleItems), [visibleItems]);
  const busiestMonth = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of visibleItems) counts.set(item.date.slice(0, 7), (counts.get(item.date.slice(0, 7)) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  }, [visibleItems]);
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
    if (view !== "semester") setSemesterId("");
    setRoomId(""); setRoomKind(""); setTeacherId(""); setClassGroupId(""); setShiftId(""); setKind("");
  }
  function goToDate(date: string) {
    if (!date) return;
    setAnchor(date);
    const matching = data.semesters.find(s => s.startDate <= date && s.endDate >= date);
    setSemesterId(matching ? String(matching.id) : "");
    setClassGroupId("");
    if (view === "semester" && !matching) setView("week");
  }
  const activeFilters = [
    { label: "Semestre", value: semesterId, text: semester?.name, clear: () => { setSemesterId(""); setClassGroupId(""); }, removable: view !== "semester" },
    { label: "Tipo de ambiente", value: roomKind, text: roomKind, clear: () => setRoomKind("") },
    { label: "Ambiente", value: roomId, text: data.rooms.find(r => String(r.id) === roomId)?.name, clear: () => setRoomId("") },
    { label: "Instrutor", value: admin ? teacherId : "", text: data.teachers.find(t => t.id === teacherId)?.displayName, clear: () => setTeacherId("") },
    { label: "Turma", value: classGroupId, text: classOptions.find(c => String(c.id) === classGroupId)?.name, clear: () => setClassGroupId("") },
    { label: "Turno", value: shiftId, text: data.shifts.find(s => String(s.id) === shiftId)?.name, clear: () => setShiftId("") },
    { label: "Tipo de ocupação", value: kind, text: kind, clear: () => setKind("") },
  ].filter(filter => filter.value);
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
  function beginBlockMove(item: AgendaOccupation) {
    if (!admin || item.kind === "Bloqueio" || !item.planProposalId) return;
    setSelected(null);
    setBlockItem(item);
    setBlockRoomId(String(item.roomId));
    setBlockStartDate(item.date);
    setBlockReason("");
    setBlockPreview(null);
    setBlockError("");
  }
  async function requestBlockPreview() {
    if (!blockItem || !blockRoomId || !blockStartDate || blockBusy) return;
    setBlockBusy(true); setBlockError(""); setBlockPreview(null);
    try {
      const result = await post<OccupationBlockMovePreview>(
        `/occupations/${blockItem.id}/block-move-preview`,
        { roomId: Number(blockRoomId), startDate: blockStartDate });
      setBlockPreview(result);
    } catch (reason) { setBlockError(resultMessage(reason)); }
    finally { setBlockBusy(false); }
  }
  async function confirmBlockMove() {
    if (!blockItem || !blockPreview?.allowed || blockBusy ||
        blockPreview.destinationRoomId !== Number(blockRoomId) ||
        blockPreview.requestedStartDate !== blockStartDate) return;
    setBlockBusy(true); setBlockError("");
    try {
      await post(`/occupations/${blockItem.id}/block-move`, {
        roomId: Number(blockRoomId), startDate: blockStartDate,
        expectedSignature: blockPreview.signature, confirm: true,
        reason: blockReason.trim() || null,
      });
      setBlockItem(null); setOperationError("");
      setMoveSuccess("Bloco pedagógico remanejado. Todas as ocorrências foram atualizadas.");
      setRevision((value) => value + 1);
    } catch (reason) {
      setBlockError(resultMessage(reason)); setRevision((value) => value + 1);
    } finally { setBlockBusy(false); }
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
    <Title title="Cronograma"
      action={<div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={openBookings}>Abrir reservas</button>
        {admin && <div className="space-y-1"><button type="button" className="btn-secondary" aria-describedby="timeline-export-scope" disabled={!range || exportBusy} onClick={() => void exportCurrentPeriod()}>{exportBusy ? "Gerando Excel..." : "Exportar ocupações"}</button><p id="timeline-export-scope" className="text-xs text-muted-ink">Exporta período, ambiente e turno.</p></div>}</div>} />
    {exportError && <div className="mb-4"><Notice type="error" message={exportError} onClose={() => setExportError("")} /></div>}
    {admin && (teacherId || classGroupId || kind || roomKind) && <p className="mb-4 text-sm text-amber-800" role="status">A exportação preserva período, ambiente e turno. Os filtros de instrutor, turma, tipo de ambiente e tipo de ocupação não são aplicados ao arquivo.</p>}
    {moveSuccess && <div className="mb-4"><Notice type="success" message={moveSuccess} onClose={() => setMoveSuccess("")} /></div>}
    {operationError && <div className="mb-4"><Notice message={operationError} onClose={() => setOperationError("")} /></div>}
    <Card className="p-4 sm:p-5 mb-5 space-y-5">
      <SectionHeading title="Período e visualização" />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Visualização do cronograma">{(["week", "month", "semester"] as TimelineView[]).map((choice) => <button key={choice} type="button"
          aria-pressed={view === choice} onClick={() => changeView(choice)}
          className={view === choice ? "btn-primary" : "btn-secondary"}>
          {{ week: "Semana", month: "Mês", semester: "Semestre" }[choice]}
        </button>)}</div>
        <div className="min-w-0 space-y-2 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-x-3 lg:space-y-0">
          {view === "week" && <p className="text-sm font-semibold text-ink text-center lg:col-span-2 lg:mb-2" aria-live="polite">{formatMonthWeek(anchor)}</p>}
          <div className="flex items-center gap-2 min-w-0 rounded-xl border border-line bg-canvas/40 p-1" aria-label="Navegação entre períodos">
          <button type="button" className="btn-secondary shrink-0" onClick={() => navigate(-1)} aria-label="Período anterior">‹</button>
          <span className="text-sm font-semibold text-ink flex-1 min-w-0 text-center capitalize px-1" aria-live="polite">{periodName}</span>
          <button type="button" className="btn-secondary shrink-0" onClick={() => navigate(1)} aria-label="Próximo período">›</button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => goToDate(localDate(new Date()))}>Hoje</button>
            <Field label="Ir para data"><input type="date" className="field" value={anchor} onChange={e => goToDate(e.target.value)} /></Field>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="section-title">Filtros do cronograma</h2>
        <div ref={filtersRef} className="relative sm:shrink-0" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFiltersExpanded(false); }}>
          <button ref={filtersButtonRef} type="button" className="btn-secondary w-full sm:w-auto" aria-expanded={filtersExpanded} aria-controls="timeline-filters" onClick={() => setFiltersExpanded((expanded) => !expanded)}>
            <SlidersHorizontal size={17} aria-hidden="true" />Filtros
            {activeFilterCount > 0 && <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-ink">{activeFilterCount}<span className="sr-only"> selecionados</span></span>}
            <ChevronDown size={16} aria-hidden="true" className={`transition-transform ${filtersExpanded ? "rotate-180" : ""}`} />
          </button>
      <div id="timeline-filters" hidden={!filtersExpanded} role="region" aria-label="Opções de filtro" className="absolute right-0 top-full z-20 mt-2 w-full min-w-0 max-h-[70dvh] overflow-y-auto space-y-4 rounded-panel border border-line bg-surface p-4 shadow-soft sm:w-[32rem]">
        <div className="grid grid-cols-2 gap-4 [&>label]:min-w-0">
        <TimelineFilterField label="Semestre"><select className="field" value={semesterId} onChange={(e) => { setSemesterId(e.target.value); setClassGroupId(""); }}>
          <option value="" disabled={view === "semester"}>{view === "semester" ? "Selecione um semestre" : "Todos"}</option>{data.semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></TimelineFilterField>
        <TimelineFilterField label="Tipo de ambiente"><select className="field" value={roomKind} onChange={(e) => { setRoomKind(e.target.value); setRoomId(""); }}>
          <option value="">Todos</option>{roomKinds.map((value) => <option key={value} value={value}>{value}</option>)}
        </select></TimelineFilterField>
        <TimelineFilterField label="Ambiente"><select className="field" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="">Todos</option>{data.rooms.filter((room) => !roomKind || room.kind === roomKind).map((r) => <option key={r.id} value={r.id}>{r.code ? `${r.code} · ` : ""}{r.name}</option>)}
        </select></TimelineFilterField>
        {admin && <TimelineFilterField label="Instrutor"><select className="field" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
          <option value="">Todos</option>{data.teachers.map((t) => <option key={t.id} value={t.id}>{t.displayName}</option>)}
        </select></TimelineFilterField>}
        <TimelineFilterField label="Turma"><select className="field" value={classGroupId} onChange={(e) => setClassGroupId(e.target.value)}>
          <option value="">Todas</option>{classOptions.filter((c) => !semesterId || String(c.semesterId) === semesterId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></TimelineFilterField>
        <TimelineFilterField label="Turno"><select className="field" value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
          <option value="">Todos</option>{data.shifts.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.startsAt.slice(0, 5)}–{s.endsAt.slice(0, 5)}</option>)}
        </select></TimelineFilterField>
        <TimelineFilterField label="Tipo de ocupação"><select className="field" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Todos</option><option value="Aula">Aula</option><option value="Avulsa">Avulsa</option><option value="Bloqueio">Bloqueio</option>
        </select></TimelineFilterField>
        </div>
        <button type="button" className="btn-quiet" onClick={clearFilters}>Limpar filtros</button>
      </div>
      </div>
      </div>
      {activeFilters.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Filtros selecionados">{activeFilters.map(filter => <div key={filter.label} className="flex min-w-0 max-w-full items-center gap-1 rounded-lg border border-line bg-canvas px-3 py-1 text-sm text-ink">
        <span className="min-w-0 [overflow-wrap:anywhere]">{filter.label}: {filter.text || "Seleção indisponível"}</span>
        {filter.removable !== false && <button type="button" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500" aria-label={`Remover filtro ${filter.label}`} onClick={filter.clear}><X size={16} aria-hidden="true" /></button>}
      </div>)}</div>}
    </Card>
    <Card className="mb-5 p-4 sm:p-5 space-y-2">
      <div className="sr-only"><SectionHeading title="Resumo do período" subtitle={`${periodName}${view === "week" ? ` · ${formatMonthWeek(anchor)}` : ""}`} /></div>
      <p className="text-sm text-ink" role="status">{items && loadedQuery === queryKey ? `${summary.count} ocupações · ${summary.conflicts} conflitos` : loading ? "Consultando ocupações…" : "Ocupações não consultadas"} · {rooms.length} ambientes</p>
      <details><summary className="cursor-pointer py-2 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500">Ver resumo</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Ocupações registradas" value={items && loadedQuery === queryKey ? summary.count : "—"} detail="Registros, não horas de aula" />
        <MetricCard label="Conflitos sinalizados" value={items && loadedQuery === queryKey ? summary.conflicts : "—"} tone="rose" detail="Conforme análise da API" />
        <MetricCard label="Ambientes exibidos" value={rooms.length} detail="Conforme cadastro e filtros" tone="violet" />
        <MetricCard label="Turnos exibidos" value={shifts.length} detail="Conforme cadastro e filtros" tone="emerald" />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-ink" aria-label="Legenda do cronograma"><span className="font-semibold text-ink">Legenda:</span><span className="rounded-full border-l-4 border-sky-300 bg-sky-50 px-2.5 py-1 text-sky-800">Ocupado</span><span className="rounded-full border-l-4 border-rose-300 bg-rose-50 px-2.5 py-1 text-rose-800">Conflito</span><span className="rounded-full border-l-4 border-amber-300 bg-amber-50 px-2.5 py-1 text-amber-800">Bloqueio</span><span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">Dia especial</span><span className="rounded-full bg-slate-100 px-2.5 py-1">Sem registro · disponibilidade desconhecida</span></div>
      </details>
    </Card>
    {catalogError && <div className="mb-4"><Notice message={`Não foi possível carregar os cadastros: ${catalogError}. A grade não pode identificar períodos sem registro.`} /></div>}
    {!rangeValid && <Notice message={view === "semester" && semester && datesBetween(semester.startDate, nextDate(semester.endDate, 1)).length > 371
      ? "Este semestre excede 371 dias; consulte semanas ou meses. Nenhum resultado parcial é exibido."
      : view === "semester" ? "Selecione um semestre cadastrado." : "O período está fora do semestre selecionado."} />}
    {error && <div className="mb-4 space-y-2"><Notice message={error} /><button type="button" className="btn-secondary" onClick={() => setRevision(current => current + 1)}>Tentar novamente</button></div>}
    {loading && <Busy />}
    {!loading && !error && items && loadedQuery === queryKey && !catalogError && <>
      {visibleItems.length === 0 && <div className="mb-4"><Notice type="info" message="Nenhuma ocupação registrada no período e filtros selecionados. Isso não confirma disponibilidade para novas reservas." /></div>}
      {view === "week" && <WeeklyOccupations adaptive occupations={visibleItems} dates={visibleDates} rooms={rooms} shifts={shifts} range={range} onOpen={setSelected} onDropSlot={admin ? (roomId, date, shiftId, event) => dropOn(roomId, date, shiftId, event) : undefined}
        renderActivity={item => <><p className="text-xs font-semibold text-ink">{data.classes.find(group => group.id === item.actualClassGroupId)?.code}{item.isBorrowed ? " - Empréstimo efetivado" : ""}</p><OccupationButton compact item={item} onSelect={setSelected} onDragStart={admin && item.kind !== "Bloqueio" ? startDrag : undefined} onDragEnd={() => { setDraggingId(null); setDragTarget(""); }} dragging={draggingId === item.id} /></>} />}
      {view === "week" && visibleItems.some((item) => !rooms.some((room) => room.id === item.roomId)) && <Card className="p-4 mb-5 space-y-2"><h2 className="font-semibold">Ocupações fora da grade visível</h2>
        {visibleItems.filter((item) => !rooms.some((room) => room.id === item.roomId)).map((item) => <div key={item.id}><span className="text-xs text-slate-500">{dateBR(item.date)} · {item.roomName || "Ambiente não identificado"} · {item.startsAt.slice(11, 16)}–{item.endsAt.slice(11, 16)}</span><OccupationButton item={item} onSelect={setSelected} /></div>)}
      </Card>}
      {view === "month" && <Card className="p-3 mb-5"><div className="grid grid-cols-7 text-xs sm:text-sm">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((label) => <div key={label} className="p-2 font-semibold text-slate-600">{label}</div>)}
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
    {selected && <Modal title="Detalhes da ocupação" onClose={() => setSelected(null)}>
      <dl className="grid gap-3 rounded-lg border border-line bg-canvas p-4 text-sm sm:grid-cols-2">
        {([
          ["Ambiente", selected.roomName], ["Data", dateBR(selected.date)],
          ["Turno", selected.shiftName ?? `${selected.startsAt.slice(11, 16)}–${selected.endsAt.slice(11, 16)} (sem turno correspondente)`],
          ["Instrutor efetivo", selected.actualTeacherName ?? "Não informado ou não autorizado"], ["Turma", selected.actualClassGroupName ?? "Não informada ou não autorizada"],
        ] as [string, string][]).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted-ink">{label}</dt><dd className="font-semibold text-ink [overflow-wrap:anywhere]">{value}</dd></div>)}
      </dl>
      {selected.conflicts.length > 0 && <p className="mt-3 text-sm font-semibold text-ink" role="status">Conflitos: {selected.conflicts.map(reason => conflictLabels[reason] ?? "Inconsistência sinalizada").join(", ")}</p>}
      <details className="mt-4"><summary className="cursor-pointer py-3 font-semibold text-ink">Dados pedagógicos e situação</summary><dl className="grid sm:grid-cols-2 gap-3 text-sm">
      {([[
        "Curso", selected.courseName ?? "Não vinculado ou não autorizado"], ["UC", selected.curricularUnitName ?? "Não vinculada ou não autorizada"],
        ["Capacidade", selected.curricularCapabilityDescription ?? "Não vinculada ou não autorizada"], ["Situação", selected.bookingStatus ?? ({ Confirmed: "Confirmada", Blocked: "Bloqueada" }[selected.status] ?? "Não informada")],
        ["Origem", sourceLabels[selected.source] ?? "Não informada"], ["Dia letivo", dayLabels[selected.dayStatus ?? ""] ?? "Não informado"],
        ["Calendário", selected.calendarKind ? calendarLabels[selected.calendarKind] ?? "Dia especial" : "Não informado"],
        ["Motivo do calendário", selected.calendarReason ?? "Não informado"],
        ["Conflitos", selected.conflicts.length ? selected.conflicts.map((reason) => conflictLabels[reason] ?? "Inconsistência sinalizada").join(", ") : "Nenhum sinalizado"]
      ] as [string, string][]).map(([label, value]) => <div key={label} className="min-w-0"><dt className="font-semibold text-muted-ink">{label}</dt><dd className="text-ink [overflow-wrap:anywhere]">{value}</dd></div>)}</dl></details>
      {(admin || selected.originalTeacherId === user.id) && <details className="mt-4 border-t border-line pt-2"><summary className="cursor-pointer py-3 font-semibold text-ink">Histórico de alterações</summary><AuditHistory type="Occupation" id={selected.id} onReverse={admin ? (changeId, action) => void beginReversal(selected, changeId, action) : undefined} /></details>}
      {admin && selected.kind !== "Bloqueio" && <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={() => beginMove(selected)}>Mover ocupação</button>
        {selected.planProposalId != null && <button type="button" className="btn-primary" onClick={() => beginBlockMove(selected)}>Mover bloco completo</button>}
      </div>}
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
    {blockItem && <Modal title="Mover bloco pedagógico" onClose={() => { if (!blockBusy) setBlockItem(null); }}>
      <div className="space-y-4 text-sm">
        <p><strong>{blockItem.actualTeacherName ?? "Instrutor não informado"}</strong>{blockItem.actualClassGroupName ? ` · ${blockItem.actualClassGroupName}` : ""}</p>
        <p>{blockItem.courseName ?? "Curso"} · {blockItem.curricularUnitName ?? "UC não identificada"} · {blockItem.shiftName ?? "Turno não identificado"}</p>
        <p className="text-slate-600">A análise considera somente a oferta publicada e suas capacidades vinculadas. A prévia não altera dados nem garante reserva.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Ambiente de destino"><select className="field" value={blockRoomId} disabled={blockBusy}
            onChange={(event) => { setBlockRoomId(event.target.value); setBlockPreview(null); }}>
            {data.rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
          </select></Field>
          <Field label="Nova data inicial (dia da atribuição)"><input type="date" className="field" value={blockStartDate} disabled={blockBusy}
            onChange={(event) => { setBlockStartDate(event.target.value); setBlockPreview(null); }} /></Field>
        </div>
        <Field label="Motivo (opcional)"><input className="field" maxLength={500} value={blockReason} disabled={blockBusy} onChange={(event) => setBlockReason(event.target.value)} /></Field>
        {blockError && <Notice message={blockError} />}
        {blockBusy && <p role="status">Analisando ou confirmando o bloco...</p>}
        {blockPreview && blockPreview.requestedStartDate === blockStartDate && blockPreview.destinationRoomId === Number(blockRoomId) && <section className="rounded-xl border border-slate-200 p-4 space-y-3" aria-label="Prévia da movimentação do bloco">
          <h3 className="font-semibold">Prévia · {blockPreview.allowed ? "Movimentação permitida" : "Movimentação impedida"}</h3>
          <p>Destino: {blockPreview.destinationRoomName} · início solicitado: {dateBR(blockPreview.requestedStartDate)} · {blockPreview.shiftName}</p>
          <p>{blockPreview.capabilities.reduce((sum, capability) => sum + capability.requiredMeetings, 0)} encontros · {blockPreview.affectedOccupationIds.length} ocorrências afetadas</p>
          <div className="space-y-3">
            {blockPreview.capabilities.map((capability) => <article key={capability.capabilityId} className="border-t border-slate-200 pt-3">
              <h4 className="font-semibold">{capability.order}. {capability.description}</h4>
              <p>CH pedagógica: {capability.pedagogicalHours} h · encontros: {capability.requiredMeetings} · ocupação física estimada: {capability.physicalHours} h</p>
              <p>Ambiente(s) atual(is): {capability.previousRoomIds.map((id) => data.rooms.find((room) => room.id === id)?.name ?? `Ambiente ${id}`).join(", ") || "não identificado"}</p>
              <p>Antes: {capability.previousDates.map(dateBR).join(", ") || "sem datas"}</p>
              <p>Depois: {capability.newDates.map(dateBR).join(", ") || "nenhuma data calculada"}</p>
              {capability.technicalFindings.map((finding, index) => <p key={`${finding.requirement}-${index}`}>{finding.status}: {finding.detail}</p>)}
            </article>)}
          </div>
          {blockPreview.blocks.map((block) => <p key={block} role="alert" className="text-rose-700">Impedimento: {block}</p>)}
          {blockPreview.warnings.map((warning) => <p key={warning} className="text-amber-800">Atenção: {warning}</p>)}
        </section>}
        <div className="flex flex-wrap gap-2 justify-end">
          <button type="button" className="btn-secondary" disabled={blockBusy} onClick={() => setBlockItem(null)}>Cancelar</button>
          <button type="button" className="btn-secondary" disabled={blockBusy || !blockRoomId || !blockStartDate} onClick={() => void requestBlockPreview()}>Consultar prévia</button>
          <button type="button" className="btn-primary" disabled={blockBusy || !blockPreview?.allowed || blockPreview.requestedStartDate !== blockStartDate || blockPreview.destinationRoomId !== Number(blockRoomId)} onClick={() => void confirmBlockMove()}>
            {blockBusy ? "Processando..." : "Confirmar movimentação do bloco"}
          </button>
        </div>
      </div>
    </Modal>}    {moveItem && <Modal title="Remanejar ocupação" onClose={() => { if (!moveBusy) { previewRequest.current++; setMoveItem(null); } }}>
      <div className="space-y-4 text-sm">
        <p><strong>{moveItem.actualTeacherName ?? "Instrutor não informado"}</strong>{moveItem.actualClassGroupName ? ` · ${moveItem.actualClassGroupName}` : ""}</p>
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
