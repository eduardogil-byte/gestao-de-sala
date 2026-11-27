import { WeeklyOccupations } from "../components/WeeklyOccupations";
import { TimelinePeriodPicker } from "../components/TimelinePeriodPicker";
import { TimelineOccupancySummary } from "../components/TimelineOccupancySummary";
import { Children, isValidElement, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { ApiError, downloadFile, post, read } from "../lib/api";
import { useData } from "../lib/data";
import { agendaPath, datesBetween, indexOccupations, isAgendaOccupation, movePeriod, period, summarize, weekStart, type TimelineView } from "../lib/roomTimeline";
import { dateBR, localDate, nextDate, resultMessage } from "../lib/utils";
import { Busy, Card, Field, Modal, Notice, Title } from "../components/UI";
import { AuditHistory } from "../components/AuditHistory";
import { isSemesterIndicators, type SemesterIndicators } from "../lib/occupancyIndicators";
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
export type TimelineContext = {
  view: TimelineView; anchor: string; semesterId: string; roomId: string; roomKind: string;
  teacherId: string; classGroupId: string; shiftId: string; kind: string; selectedDay: string; scrollY: number;
};

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function TimelineFilterField({ label, children }: { label: string; children: React.ReactElement<React.SelectHTMLAttributes<HTMLSelectElement>> }) {
  const selected = Children.toArray(children.props.children).find(child => isValidElement<{ value?: string | number }>(child) && String(child.props.value) === String(children.props.value));
  return <Field label={label}>{children}{children.props.value && isValidElement<{ children?: React.ReactNode }>(selected) && <span className="mt-1 block text-xs text-muted-ink [overflow-wrap:anywhere] sm:hidden">{selected.props.children}</span>}</Field>;
}

function occupationLabel(item: AgendaOccupation) {
  return item.kind === "Bloqueio" ? "Bloqueio" :
    [item.actualTeacherName, item.actualClassGroupName].filter(Boolean).join(" · ") || "Ocupação registrada";
}

function OccupationButton({ item, onSelect, onDragStart, onDragEnd, dragging, classLabel, continuous = false }: {
  item: AgendaOccupation; onSelect: (item: AgendaOccupation) => void;
  onDragStart?: (item: AgendaOccupation, event: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: () => void; dragging?: boolean;
  classLabel?: string; continuous?: boolean;
}) {
  if (continuous) return <button type="button" className="h-full min-h-11 w-full rounded-control text-ink hover:bg-skybrand-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-skybrand-500" draggable={Boolean(onDragStart)} onDragStart={event => onDragStart?.(item, event)} onDragEnd={onDragEnd} onClick={() => onSelect(item)} aria-label={`Detalhes: ${occupationLabel(item)}, ${item.roomName}, ${dateBR(item.date)}`}>
    <span className="sr-only">{dragging ? "Movendo esta ocupação" : "Ver detalhes"}</span>
  </button>;
  return <button type="button" onClick={() => onSelect(item)} draggable={Boolean(onDragStart)}
    onDragStart={(event) => onDragStart?.(item, event)} onDragEnd={onDragEnd}
    aria-label={`Detalhes: ${occupationLabel(item)}, ${item.roomName}, ${dateBR(item.date)}${onDragStart ? ". Arraste para remanejar ou clique para abrir a movimentação." : ""}`}
    className={`block w-full min-h-11 [overflow-wrap:anywhere] text-left rounded-control border border-l-2 border-line bg-canvas p-2.5 text-sm leading-5 text-ink transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500 ${item.conflicts.length ? "border-l-rose-500" : item.kind === "Bloqueio" ? "border-l-amber-500" : "border-l-skybrand-500"}`}>
    {dragging && <span className="block font-semibold mb-1">Movendo esta ocupação</span>}
    <span className="block font-semibold">{item.kind === "Bloqueio" ? "Bloqueio" : [item.actualTeacherName ?? "Instrutor não informado", item.actualClassGroupName ?? classLabel ?? "Turma não informada"].join(" · ")}</span>
    {(item.conflicts.length > 0 || item.isBorrowed || item.calendarKind && item.calendarKind !== "Presential" || item.dayStatus && item.dayStatus !== "Letivo") && <span className="mt-2 flex flex-wrap gap-1 text-xs">
      {item.conflicts.length > 0 && <span className="rounded border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-rose-800">Conflito</span>}
      {item.isBorrowed && <span className="rounded border border-line bg-surface px-1.5 py-0.5">Empréstimo efetivado</span>}
      {item.calendarKind && item.calendarKind !== "Presential" && <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-800">{calendarLabels[item.calendarKind] ?? "Dia especial"}</span>}
      {item.dayStatus && item.dayStatus !== "Letivo" && dayLabels[item.dayStatus] !== calendarLabels[item.calendarKind ?? ""] && <span className="rounded border border-line bg-surface px-1.5 py-0.5">{dayLabels[item.dayStatus] ?? "Situação especial"}</span>}
    </span>}
  </button>;
}

export function RoomTimeline({ user, openBookings, initialFilter, contextRef }: { user: User; openBookings: () => void; initialFilter?: { semesterId: number; roomId: number; anchor: string; shiftId?: number } | null; contextRef?: React.MutableRefObject<TimelineContext | null> }) {
  const { data, error: catalogError } = useData();
  const admin = user.roles.includes("Admin");
  const [savedContext] = useState(() => contextRef?.current);
  const [view, setView] = useState<TimelineView>(savedContext?.view ?? (initialFilter?.shiftId ? "month" : initialFilter ? "semester" : "week"));
  const [anchor, setAnchor] = useState(savedContext?.anchor ?? initialFilter?.anchor ?? localDate(new Date()));
  const [semesterId, setSemesterId] = useState(savedContext?.semesterId ?? (initialFilter ? String(initialFilter.semesterId) : ""));
  const [roomId, setRoomId] = useState(savedContext?.roomId ?? (initialFilter ? String(initialFilter.roomId) : ""));
  const [roomKind, setRoomKind] = useState(savedContext?.roomKind ?? "");
  const [teacherId, setTeacherId] = useState(savedContext?.teacherId ?? "");
  const [classGroupId, setClassGroupId] = useState(savedContext?.classGroupId ?? "");
  const [shiftId, setShiftId] = useState(savedContext?.shiftId ?? (initialFilter?.shiftId ? String(initialFilter.shiftId) : ""));
  const [kind, setKind] = useState(savedContext?.kind ?? "");
  const [filterNotice, setFilterNotice] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const activeFilterCount = [semesterId, roomKind, admin ? teacherId : "", classGroupId, kind].filter(Boolean).length;
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
  const [selectedDay, setSelectedDay] = useState(savedContext?.selectedDay ?? "");
  const restoredScroll = useRef(false);
  useEffect(() => {
    if (contextRef) contextRef.current = { view, anchor, semesterId, roomId, roomKind, teacherId, classGroupId, shiftId, kind, selectedDay, scrollY: contextRef.current?.scrollY ?? 0 };
  }, [view, anchor, semesterId, roomId, roomKind, teacherId, classGroupId, shiftId, kind, selectedDay, contextRef]);
  const [revision, setRevision] = useState(0);
  const [indicatorState, setIndicatorState] = useState<{ key: string; report?: SemesterIndicators; error?: string; loading?: boolean }>({ key: "" });
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
  const indicatorCandidates = range ? data.semesters.filter(s => s.startDate <= range.from && s.endDate >= nextDate(range.to, -1)) : [];
  const indicatorSemester = semester ?? (indicatorCandidates.length === 1 ? indicatorCandidates[0] : undefined);
  const indicatorParams = new URLSearchParams(range ? { from: range.from, to: nextDate(range.to, -1) } : {});
  if (roomId) indicatorParams.set("roomId", roomId);
  if (shiftId) indicatorParams.set("shiftId", shiftId);
  const indicatorQuery = admin && range && indicatorSemester && query ? `/occupancy-indicators/semesters/${indicatorSemester.id}?${indicatorParams}` : "";
  const indicatorKey = `${indicatorQuery}|${revision}`;
  useEffect(() => {
    if (!indicatorQuery) return;
    let current = true;
    setIndicatorState({ key: indicatorKey, loading: true });
    read<unknown>(indicatorQuery).then(report => {
      if (!isSemesterIndicators(report) || report.semesterId !== indicatorSemester?.id ||
          report.from !== range?.from || report.to !== nextDate(range!.to, -1))
        throw new Error("Não foi possível comprovar os indicadores para este período.");
      if (current) setIndicatorState({ key: indicatorKey, report });
    }).catch(reason => { if (current) setIndicatorState({ key: indicatorKey, error: resultMessage(reason) }); });
    return () => { current = false; };
  }, [indicatorQuery, revision]);

  useEffect(() => {
    let current = true;
    setItems(null);
    setLoadedQuery("");
    setError("");
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

  useEffect(() => {
    if (!items || loading || restoredScroll.current) return;
    const frame = requestAnimationFrame(() => {
      if (savedContext) window.scrollTo({ top: savedContext.scrollY, behavior: "instant" });
      restoredScroll.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [items, loading, savedContext]);

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
  const rangeValid = Boolean(query);
  const periodName = view === "semester" ? semester?.name ?? "Selecione um semestre" :
    view === "week" ? `${dateBR(visibleDates[0])} a ${dateBR(visibleDates[6])}` :
      new Date(`${monthStart}T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const detailDate = range && selectedDay >= range.from && selectedDay < range.to ? selectedDay :
    range && anchor >= range.from && anchor < range.to ? anchor : range?.from ?? "";
  const semesterIndex = data.semesters.findIndex(s => String(s.id) === semesterId);

  function selectSemester(value: string) {
    setFilterNotice("");
    setSemesterId(value);
    const next = data.semesters.find(s => String(s.id) === value);
    if (next && (anchor < next.startDate || anchor > next.endDate)) setAnchor(next.startDate);
    if (next && classGroupId && !classOptions.some(c => String(c.id) === classGroupId && c.semesterId === next.id)) {
      setClassGroupId("");
      setFilterNotice("O filtro de turma foi removido porque ela não pertence ao semestre selecionado.");
    }
  }

  function navigate(direction: number) {
    if (view === "semester") {
      const index = data.semesters.findIndex((s) => String(s.id) === semesterId);
      const next = data.semesters[index - direction];
      if (next) selectSemester(String(next.id));
    } else goToDate(movePeriod(view, anchor, direction));
  }
  function changeView(next: TimelineView) {
    if (next === "semester" && !semesterId) {
      const matching = data.semesters.find((s) => s.startDate <= anchor && s.endDate >= anchor);
      selectSemester(String((matching ?? data.semesters[0])?.id ?? ""));
    }
    setView(next);
  }
  function clearFilters() {
    setFilterNotice("");
    if (view !== "semester") setSemesterId("");
    setRoomId(""); setRoomKind(""); setTeacherId(""); setClassGroupId(""); setShiftId(""); setKind("");
  }
  function goToDate(date: string) {
    if (!date) return;
    setAnchor(date);
    setSelectedDay(date);
    setFilterNotice("");
    if (semester && (date < semester.startDate || date > semester.endDate)) {
      setSemesterId("");
      if (view === "semester") setView("week");
      setFilterNotice("O filtro de semestre foi removido para mostrar a data escolhida. Os demais filtros foram mantidos.");
    }
  }
  const activeFilters = [
    { label: "Semestre", value: semesterId, text: semester?.name, clear: () => setSemesterId(""), removable: view !== "semester" },
    { label: "Tipo de ambiente", value: roomKind, text: roomKind, clear: () => setRoomKind("") },
    { label: "Ambiente", value: roomId, text: data.rooms.find(r => String(r.id) === roomId)?.name, clear: () => setRoomId("") },
    { label: "Instrutor", value: admin ? teacherId : "", text: data.teachers.find(t => t.id === teacherId)?.displayName, clear: () => setTeacherId("") },
    { label: "Turma", value: classGroupId, text: classOptions.find(c => String(c.id) === classGroupId)?.name, clear: () => setClassGroupId("") },
    { label: "Turno", value: shiftId, text: data.shifts.find(s => String(s.id) === shiftId)?.name, clear: () => setShiftId("") },
    { label: "Tipo de ocupação", value: kind, text: kind, clear: () => setKind("") },
  ].filter(filter => filter.value && filter.label !== "Ambiente" && filter.label !== "Turno");
  function daySummary(date: string) {
    const rows = byDay.get(date) ?? [];
    const summary = summarize(rows);
    return { rows, conflicts: summary.conflicts, specials: summary.specialDays };
  }
  function dailyDetails(date: string) {
    const summary = daySummary(date);
    return <div className="space-y-3">
      <h2 className="font-semibold text-ink">{dateBR(date)} · {countLabel(summary.rows.length, "ocupação", "ocupações")}</h2>
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
    <Title title="Cronograma de ambientes"
      action={<div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={openBookings}>Reservas</button>
        {admin && <button type="button" className="btn-secondary" disabled={!range || exportBusy} onClick={() => setExportOpen(true)}>{exportBusy ? "Gerando Excel..." : "Exportar"}</button>}</div>} />
    {exportError && <div className="mb-4"><Notice type="error" message={exportError} onClose={() => setExportError("")} /></div>}
    {moveSuccess && <div className="mb-4"><Notice type="success" message={moveSuccess} onClose={() => setMoveSuccess("")} /></div>}
    {operationError && <div className="mb-4"><Notice message={operationError} onClose={() => setOperationError("")} /></div>}
    <Card className="relative p-3 sm:p-4 mb-4 space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Visualização do cronograma">{(["week", "month", "semester"] as TimelineView[]).map((choice) => <button key={choice} type="button"
          aria-pressed={view === choice} onClick={() => changeView(choice)}
          className={view === choice ? "btn-primary" : "btn-secondary"}>
          {{ week: "Semana", month: "Mês", semester: "Semestre" }[choice]}
        </button>)}</div>
        <div className={`flex min-w-0 items-center gap-1 md:min-w-[20rem] ${view === "semester" ? "" : "rounded-control border border-line bg-surface p-1"}`} aria-label="Navegação entre períodos">
          <button type="button" className="btn-quiet shrink-0" disabled={view === "semester" && !data.semesters[semesterIndex + 1]} onClick={() => navigate(-1)} aria-label="Período anterior">‹</button>
          {view === "semester" ? <select className="field min-w-0 flex-1" aria-label="Selecionar semestre" value={semesterId} onChange={event => selectSemester(event.target.value)}>
            <option value="" disabled>Selecione um semestre</option>{data.semesters.map(semester => <option key={semester.id} value={semester.id}>{semester.name}</option>)}
          </select> : <TimelinePeriodPicker view={view} anchor={anchor} semesterId={semesterId} semesters={data.semesters} label={periodName} onDate={goToDate} onSemester={selectSemester} />}
          <button type="button" className="btn-quiet shrink-0" disabled={view === "semester" && !data.semesters[semesterIndex - 1]} onClick={() => navigate(1)} aria-label="Próximo período">›</button>
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] [&>label]:min-w-0 [&>label:first-child]:col-span-2 sm:[&>label:first-child]:col-span-1">
        <TimelineFilterField label="Ambiente"><select className="field" value={roomId} onChange={e => setRoomId(e.target.value)}>
          <option value="">Todos</option>{data.rooms.filter(room => !roomKind || room.kind === roomKind).map(r => <option key={r.id} value={r.id}>{r.code ? `${r.code} · ` : ""}{r.name}</option>)}
        </select></TimelineFilterField>
        <TimelineFilterField label="Turno"><select className="field" value={shiftId} onChange={e => setShiftId(e.target.value)}>
          <option value="">Todos</option>{data.shifts.map(s => <option key={s.id} value={s.id}>{s.name} · {s.startsAt.slice(0, 5)}–{s.endsAt.slice(0, 5)}</option>)}
        </select></TimelineFilterField>
        <div ref={filtersRef} className="pt-[1.625rem] sm:shrink-0" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFiltersExpanded(false); }}>
          <button ref={filtersButtonRef} type="button" className="btn-secondary w-full sm:w-auto" aria-expanded={filtersExpanded} aria-controls="timeline-filters" onClick={() => setFiltersExpanded((expanded) => !expanded)}>
            <SlidersHorizontal size={17} aria-hidden="true" />Mais filtros
            {activeFilterCount > 0 && <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-ink">{activeFilterCount}<span className="sr-only"> selecionados</span></span>}
            <ChevronDown size={16} aria-hidden="true" className={`transition-transform ${filtersExpanded ? "rotate-180" : ""}`} />
          </button>
      <div id="timeline-filters" hidden={!filtersExpanded} role="region" aria-label="Opções de filtro" className="absolute right-3 z-20 mt-2 max-h-[70dvh] w-[calc(100%-1.5rem)] min-w-0 space-y-3 overflow-y-auto rounded-panel border border-line bg-surface p-3 shadow-soft sm:w-[30rem] sm:max-w-[calc(100%-1.5rem)]">
        <div className="grid gap-3 sm:grid-cols-2 [&>label]:min-w-0">
        <TimelineFilterField label="Semestre"><select className="field" value={semesterId} onChange={e => selectSemester(e.target.value)}>
          <option value="" disabled={view === "semester"}>{view === "semester" ? "Selecione um semestre" : "Todos"}</option>{data.semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></TimelineFilterField>
        <TimelineFilterField label="Tipo de ambiente"><select className="field" value={roomKind} onChange={e => {
          const value = e.target.value;
          setRoomKind(value);
          setFilterNotice("");
          if (value && roomId && !data.rooms.some(room => String(room.id) === roomId && room.kind === value)) {
            setRoomId("");
            setFilterNotice("O filtro de ambiente foi removido porque ele não pertence ao tipo selecionado.");
          }
        }}>
          <option value="">Todos</option>{roomKinds.map((value) => <option key={value} value={value}>{value}</option>)}
        </select></TimelineFilterField>
        {admin && <TimelineFilterField label="Instrutor"><select className="field" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
          <option value="">Todos</option>{data.teachers.map((t) => <option key={t.id} value={t.id}>{t.displayName}</option>)}
        </select></TimelineFilterField>}
        <TimelineFilterField label="Turma"><select className="field" value={classGroupId} onChange={(e) => setClassGroupId(e.target.value)}>
          <option value="">Todas</option>{classOptions.filter((c) => !semesterId || String(c.semesterId) === semesterId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></TimelineFilterField>
        <TimelineFilterField label="Tipo de ocupação"><select className="field" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Todos</option><option value="Aula">Aula</option><option value="Avulsa">Avulsa</option><option value="Bloqueio">Bloqueio</option>
        </select></TimelineFilterField>
        </div>
        <button type="button" className="btn-quiet" onClick={clearFilters}>Limpar filtros</button>
      </div>
      </div>
      </div>
      {activeFilters.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Filtros selecionados">{activeFilters.map(filter => <div key={filter.label} className={`flex min-h-[46px] min-w-0 max-w-full items-center gap-1 rounded-lg border border-line bg-canvas pl-3 text-sm text-ink ${filter.removable === false ? "pr-3" : ""}`}>
        <span className="min-w-0 [overflow-wrap:anywhere]">{filter.label}: {filter.text || "Seleção indisponível"}</span>
        {filter.removable !== false && <button type="button" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500" aria-label={`Remover filtro ${filter.label}`} onClick={filter.clear}><X size={16} aria-hidden="true" /></button>}
      </div>)}</div>}
      {filterNotice && <p className="text-sm text-muted-ink" role="status">{filterNotice}</p>}
    </Card>
    {admin && <TimelineOccupancySummary
      rooms={rooms.map(room => indicatorState.key === indicatorKey ? indicatorState.report?.rooms.find(item => item.roomId === room.id) : undefined)}
      loading={Boolean(indicatorQuery && (indicatorState.key !== indicatorKey || indicatorState.loading))}
      message={!indicatorQuery ? "Totais não definidos: selecione um semestre que inclua todo o período." : indicatorState.key === indicatorKey ? indicatorState.error : undefined}
    />}
    <div className="mb-3 space-y-2 px-1">
      <p className="text-sm text-ink" role="status">{items && loadedQuery === queryKey ? `${countLabel(summary.count, "ocupação", "ocupações")} · ${countLabel(rooms.length, "ambiente", "ambientes")}${summary.conflicts ? ` · ${countLabel(summary.conflicts, "ocupação com conflito", "ocupações com conflito")}` : ""}` : loading ? "Consultando ocupações…" : "Ocupações não consultadas"}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-ink" aria-label="Legenda do cronograma"><span className="border-l-4 border-sky-300 pl-2">Ocupado</span><span className="border-l-4 border-rose-300 pl-2">Conflito</span><span className="border-l-4 border-amber-300 pl-2">Bloqueio / dia especial</span><span>— Sem registro; disponibilidade não confirmada.</span></div>
      {admin && (teacherId || classGroupId || kind) && <p className="text-xs text-muted-ink">Os indicadores mostram a ocupação total dos ambientes exibidos no período e turno; os filtros de instrutor, turma e tipo de ocupação se aplicam aos registros da agenda.</p>}
      {admin && indicatorState.key === indicatorKey && indicatorState.error && <button type="button" className="btn-quiet" onClick={() => setRevision(value => value + 1)}>Recalcular indicadores</button>}
    </div>
    {exportOpen && admin && <Modal title="Exportar ocupações" onClose={() => setExportOpen(false)}>
      <div className="space-y-4 text-sm text-ink">
        <p>O Excel inclui o período consultado, o ambiente e o turno selecionados.</p>
        <dl className="space-y-2"><div><dt className="text-muted-ink">Período</dt><dd>{range ? `${dateBR(range.from)} a ${dateBR(nextDate(range.to, -1))}` : periodName}</dd></div><div><dt className="text-muted-ink">Ambiente</dt><dd>{data.rooms.find(r => String(r.id) === roomId)?.name ?? "Todos"}</dd></div><div><dt className="text-muted-ink">Turno</dt><dd>{data.shifts.find(s => String(s.id) === shiftId)?.name ?? "Todos"}</dd></div></dl>
        {(teacherId || classGroupId || kind || roomKind) && <Notice type="info" message="Os filtros de instrutor, turma, tipo de ambiente e tipo de ocupação não são aplicados ao arquivo." />}
        <div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setExportOpen(false)}>Cancelar</button><button type="button" className="btn-primary" disabled={!range || exportBusy} onClick={() => { setExportOpen(false); void exportCurrentPeriod(); }}>Gerar Excel</button></div>
      </div>
    </Modal>}
    {catalogError && <div className="mb-4"><Notice message={`Não foi possível carregar os cadastros: ${catalogError}. A grade não pode identificar períodos sem registro.`} /></div>}
    {!rangeValid && <Notice message={view === "semester" && semester && datesBetween(semester.startDate, nextDate(semester.endDate, 1)).length > 371
      ? "Este semestre excede 371 dias; consulte semanas ou meses. Nenhum resultado parcial é exibido."
      : view === "semester" ? "Selecione um semestre cadastrado." : "O período está fora do semestre selecionado."} />}
    {error && <div className="mb-4 space-y-2"><Notice message={error} /><button type="button" className="btn-secondary" onClick={() => setRevision(current => current + 1)}>Tentar novamente</button></div>}
    {loading && <Busy />}
    {!loading && !error && items && loadedQuery === queryKey && !catalogError && <>
      {visibleItems.length === 0 && <div className="mb-4"><Notice type="info" message="Nenhuma ocupação registrada no período e filtros selecionados. Isso não confirma disponibilidade para novas reservas." /></div>}
      {(view === "week" || view === "month") && <WeeklyOccupations key={view} monthly={view === "month"} onSelectDate={setSelectedDay} selectedDate={detailDate} adaptive occupations={visibleItems} dates={visibleDates} rooms={rooms} shifts={shifts} range={range} onOpen={setSelected} onDropSlot={admin ? (roomId, date, shiftId, event) => dropOn(roomId, date, shiftId, event) : undefined}
        renderActivity={(item, continuous) => <OccupationButton continuous={continuous} classLabel={data.classes.find(group => group.id === item.actualClassGroupId)?.code ?? undefined} item={item} onSelect={setSelected} onDragStart={admin && item.kind !== "Bloqueio" ? startDrag : undefined} onDragEnd={() => { setDraggingId(null); setDragTarget(""); }} dragging={draggingId === item.id} />} />}
      {view === "week" && visibleItems.some((item) => !rooms.some((room) => room.id === item.roomId)) && <Card className="p-4 mb-5 space-y-2"><h2 className="font-semibold">Ocupações fora da grade visível</h2>
        {visibleItems.filter((item) => !rooms.some((room) => room.id === item.roomId)).map((item) => <div key={item.id}><span className="text-xs text-slate-500">{dateBR(item.date)} · {item.roomName || "Ambiente não identificado"} · {item.startsAt.slice(11, 16)}–{item.endsAt.slice(11, 16)}</span><OccupationButton item={item} onSelect={setSelected} /></div>)}
      </Card>}
      {view === "month" && detailDate && <Card className="p-4 mb-4"><section id="timeline-day-details" aria-label="Ocupações do dia" aria-live="polite">{dailyDetails(detailDate)}</section></Card>}
      {view === "semester" && semester && <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-5">
        {datesBetween(semester.startDate, nextDate(semester.endDate, 1)).filter((date, index, dates) => index === 0 || date.slice(0, 7) !== dates[index - 1].slice(0, 7)).map((date) => {
          const end = nextDate(`${date.slice(0, 7)}-01`, 32).slice(0, 7) + "-01";
          const dates = datesBetween(date, end < nextDate(semester.endDate, 1) ? end : nextDate(semester.endDate, 1));
          const rows = dates.flatMap((day) => byDay.get(day) ?? []);
          const conflicts = summarize(rows).conflicts;
          return <Card key={date} className="p-4"><h2 className="capitalize font-semibold">{new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h2>
            <p className="text-sm mt-2">{countLabel(rows.length, "ocupação", "ocupações")}</p>{conflicts > 0 && <p className="text-sm text-rose-700">{countLabel(conflicts, "ocupação com conflito", "ocupações com conflito")}</p>}
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
          ["Horário", `${selected.startsAt.slice(11, 16)}–${selected.endsAt.slice(11, 16)}`],
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
        <button type="button" className="btn-primary" onClick={() => beginMove(selected)}>Remanejar esta ocupação</button>
        {selected.planProposalId != null && <button type="button" className="btn-secondary" onClick={() => beginBlockMove(selected)}>Remanejar bloco completo</button>}
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
    {blockItem && <Modal title="Remanejar bloco completo" onClose={() => { if (!blockBusy) setBlockItem(null); }}>
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
            {blockBusy ? "Processando..." : "Confirmar remanejamento do bloco"}
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
          <button type="button" className="btn-primary" disabled={moveBusy || !movePreview?.allowed || !previewMatches} onClick={() => void confirmMove()}>Confirmar remanejamento</button>
        </div>
      </div>
    </Modal>}
  </>;
}
