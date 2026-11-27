import { useEffect, useRef, useState } from "react";
import {
  Check,
  Pencil,
  Plus,
  Trash2,
  AlertTriangle,
  ChevronDown,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useData } from "../lib/data";
import { ApiError, post, read } from "../lib/api";
import { dateTimeBR, dateBR, resultMessage, roomKind } from "../lib/utils";
import {
  Badge,
  Card,
  Empty,
  Modal,
  Notice,
  Title,
  Checkbox,
  Field,
  useConfirmation,
} from "../components/UI";
import { BookingForm } from "../components/BookingForm";
import { AuditHistory } from "../components/AuditHistory";
import type {
  Booking,
  Suggestion,
  BookingAvailability,
  ConflictInfo,
  User,
} from "../types";

export function Bookings({
  user,
  reloadAgenda,
  focusId,
}: {
  user: User;
  reloadAgenda: () => Promise<void>;
  focusId?: number | null;
}) {
  const { data, reload } = useData();
  const ask = useConfirmation();
  const admin = user.roles.includes("Admin");
  const formState = useRef({ dirty: false, busy: false });
  const suggestionsRequest = useRef(0);
  const availabilityRequest = useRef(0);
  const [query, setQuery] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [form, setForm] = useState(false),
    [filter, setFilter] = useState("Todos");
  const [editing, setEditing] = useState<Booking | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null),
    [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedRoom, setSelectedRoom] = useState(""),
    [availability, setAvailability] = useState<BookingAvailability | null>(
      null,
    );
  const [replace, setReplace] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [createdId, setCreatedId] = useState<number | null>(null);
  useEffect(() => {
    if (!focusId) return;
    setFilter("Todos");
    setQuery(""); setTeacherFilter(""); setFrom(""); setUntil("");
    const timer = window.setTimeout(() => document.getElementById("booking-" + focusId)?.scrollIntoView({ block: "center" }), 0);
    return () => window.clearTimeout(timer);
  }, [focusId, data.bookings]);
  useEffect(() => {
    if (createdId === null) return;
    const created = data.bookings.find((item) => item.id === createdId);
    if (created) {
      setCreatedId(null);
      void choose(created);
    }
  }, [createdId, data.bookings]);
  async function closeForm() {
    if (formState.current.busy) return;
    if (formState.current.dirty && !await ask({ title: "Descartar alterações?",
      message: "Os dados preenchidos ainda não foram salvos. Deseja descartar as alterações?",
      confirmLabel: "Descartar alterações", danger: true })) return;
    setForm(false); setEditing(null); formState.current = { dirty: false, busy: false };
  }
  function closeChoice() {
    if (confirming) return;
    suggestionsRequest.current++; availabilityRequest.current++;
    setBooking(null); setAvailability(null); setSuggestions([]); setSelectedRoom("");
    setReplace(false); setBusy(false); setError("");
  }
  const acceptedDates =
    availability?.days
      .filter(
        (d) =>
          d.available ||
          (replace &&
            booking?.classGroupId != null &&
            !d.calendarReason &&
            !d.availabilityReason &&
            d.conflicts.length === 1 &&
            d.conflicts[0].teacherId === booking.teacherId &&
            d.conflicts[0].classGroupId === booking.classGroupId),
      )
      .map((d) => d.start.slice(0, 10)) ?? [];
  const teacher = (id: string | null) =>
    data.teachers.find((t) => t.id === id)?.displayName ||
    "Instrutor não identificado";
  const turma = (id: number | null) =>
    data.classes.find((c) => c.id === id)?.name || "Turma não informada";
  function conflicts(list: ConflictInfo[]) {
    return list
      .map(
        (c) =>
          `${dateBR(c.startsAt)} — ${teacher(c.teacherId)} / ${turma(c.classGroupId)}`,
      )
      .join("; ");
  }
  async function choose(b: Booking) {
    if (b.status !== "Pendente") return;
    const request = ++suggestionsRequest.current;
    availabilityRequest.current++;
    setBooking(b);
    setBusy(true);
    setError("");
    setAvailability(null);
    setSelectedRoom("");
    setSuggestions([]);
    setReplace(false);
    try {
      const found = await read<Suggestion[]>(`/bookings/${b.id}/suggestions`);
      if (request === suggestionsRequest.current) setSuggestions(found);
    } catch (e) {
      if (request === suggestionsRequest.current) setError(resultMessage(e));
    } finally {
      if (request === suggestionsRequest.current) setBusy(false);
    }
  }
  async function selectRoom(id: string, preserveError = false) {
    if (!booking) return;
    const request = ++availabilityRequest.current;
    setSelectedRoom(id);
    setAvailability(null);
    if (!preserveError) { setError(""); setReplace(false); }
    if (!id) return;
    setBusy(true);
    try {
      const found = await read<BookingAvailability>(
          `/bookings/${booking.id}/availability?roomId=${id}`,
        );
      if (request === availabilityRequest.current) setAvailability(found);
    } catch (e) {
      if (request === availabilityRequest.current)
        setError((current) => preserveError && current ? `${current} Não foi possível atualizar a disponibilidade: ${resultMessage(e)}` : resultMessage(e));
    } finally {
      if (request === availabilityRequest.current) setBusy(false);
    }
  }
  async function confirm() {
    if (!booking || !selectedRoom || !availability || busy || confirming || !acceptedDates.length) return;
    const chosen = suggestions.find((s) => s.id === Number(selectedRoom));
    if (!chosen) return;
    const missing = availability.total - acceptedDates.length;
    const excludedDates = availability.days.filter((day) => !acceptedDates.includes(day.start.slice(0, 10)));
    const explanation = `Sala: ${chosen.name}\nTurma: ${turma(booking.classGroupId)}\n${admin ? `Instrutor: ${teacher(booking.teacherId)}\n` : ""}Horário: ${booking.startsAt.slice(11, 16)}–${booking.endsAt.slice(11, 16)}\n\n${acceptedDates.length} data(s) para confirmar:\n${acceptedDates.map(dateBR).join(", ")}${missing ? `\n\n${missing} data(s) ficarão de fora:\n${excludedDates.map((day) => dateBR(day.start)).join(", ")}` : ""}${replace ? "\n\nAs alocações elegíveis deste instrutor e desta turma serão substituídas nas datas selecionadas." : ""}`;
    if (!await ask({ title: "Confirmar reserva", message: explanation, confirmLabel: `Confirmar ${acceptedDates.length} ${acceptedDates.length === 1 ? "data" : "datas"}` })) return;
    setConfirming(true);
    setBusy(true);
    setError("");
    try {
      const send = (acceptedTechnicalReasons?: string[]) => post<{
        reservedCount: number;
        unavailableDates: unknown[];
        replacedOccupationIds: number[];
      }>(`/bookings/${booking.id}/confirm`, {
        acceptedTechnicalReasons,
        roomId: Number(selectedRoom),
        confirmPartial: missing > 0,
        replaceOwnClassBooking: replace,
        expectedAvailableDates: booking.curricularCapabilityId
          ? acceptedDates
          : undefined,
      });
      let result;
      try { result = await send(); }
      catch (error) {
        const reasons = error instanceof ApiError ? (error.details as { technicalReasons?: string[] })?.technicalReasons : undefined;
        if (!reasons?.length) throw error;
        const accepted = await ask({ title: "Este ambiente não atende a todos os requisitos",
          message: `A sala selecionada apresenta as seguintes incompatibilidades:\n${reasons.map(r => `\u2022 ${r}`).join("\n")}\nVocê deseja confirmar a reserva mesmo assim?`, confirmLabel: "Confirmar mesmo assim" });
        if (!accepted) return;
        result = await send(reasons);
      }
      await reload();
      await reloadAgenda();
      setBooking(null);
      setAvailability(null);
      setSuccess(
        `${result.reservedCount} data(s) confirmadas. ${result.unavailableDates.length} indisponível(is). ${result.replacedOccupationIds.length} alocação(ões) substituída(s).`,
      );
    } catch (e) {
      setError(resultMessage(e));
      if (booking) await selectRoom(selectedRoom, true);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }
  async function discard(id: number) {
    if (!await ask({ title: "Descartar solicitação", message: "Esta solicitação ainda não confirmada será descartada. As reservas já confirmadas não serão alteradas.", confirmLabel: "Descartar solicitação", danger: true }))
      return;
    setBusy(true);
    try {
      await post(`/bookings/${id}/reject`);
      await reload();
      setSuccess("Solicitação descartada.");
    } catch (e) {
      setError(resultMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const order: Record<string, number> = { Pendente: 0, Aprovada: 1, Rejeitada: 2 };
  const labels: Record<string, string> = { Todos: "Todas", Pendente: "Aguardando sala", Aprovada: "Confirmada", Rejeitada: "Descartada" };
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const matching = data.bookings.filter((b) => (!teacherFilter || b.teacherId === teacherFilter) &&
    (!from || (b.repeatUntil ?? b.startsAt.slice(0, 10)) >= from) && (!until || b.startsAt.slice(0, 10) <= until) &&
    normalize([b.reason, turma(b.classGroupId), data.classes.find(c => c.id === b.classGroupId)?.code,
      b.curricularUnitName, b.curricularCapabilityDescription, data.rooms.find(r => r.id === b.approvedRoomId)?.name,
      admin ? teacher(b.teacherId) : ""].filter(Boolean).join(" ")).includes(normalize(query.trim())));
  const list = matching.filter((b) => filter === "Todos" || b.status === filter)
    .sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || a.startsAt.localeCompare(b.startsAt));
  const selected = suggestions.find((s) => s.id === Number(selectedRoom));
  const possiblyAvailable = acceptedDates.length;
  const roomOptions = new Map(data.rooms.map((room) => [room.id, room]));
  const detail = data.bookings.find((item) => item.id === detailId);
  const detailClass = data.classes.find((item) => item.id === detail?.classGroupId);
  const detailResources = detail ? [detail.needsProjector && "Projetor", detail.needsTeacherComputer && "Computador do instrutor",
    detail.needsStudentComputers && "Computadores para alunos", detail.needsDedicatedGpu && "GPU dedicada",
    (detail.needsStudentComputers || detail.softwareIds.length > 0) && detail.minRamGb > 0 && `${detail.minRamGb} GB RAM`,
    ...detail.softwareIds.map(id => data.software.find(item => item.id === id)?.name ?? "Software registrado")].filter(Boolean) : [];
  const replaceable = availability?.days.some((day) => booking?.classGroupId != null && !day.calendarReason &&
    !day.availabilityReason && day.conflicts.length === 1 && day.conflicts[0].teacherId === booking.teacherId &&
    day.conflicts[0].classGroupId === booking.classGroupId) ?? false;
  const unavailableDays = availability?.days.filter((day) => !acceptedDates.includes(day.start.slice(0, 10))) ?? [];
  const filterCount = Number(!!teacherFilter) + Number(!!from) + Number(!!until);
  const clearFilters = () => { setFilter("Todos"); setQuery(""); setTeacherFilter(""); setFrom(""); setUntil(""); };
  return (
    <>
      <Title title={admin ? "Reservas de salas" : "Minhas reservas"}
        subtitle={admin ? "Acompanhe as reservas por turma e instrutor." : "Confira suas salas e conclua as reservas que aguardam escolha."}
        action={<button type="button" className="btn-primary" onClick={() => {
          formState.current = { dirty: false, busy: false }; setForm(true); setError("");
        }}><Plus size={17} aria-hidden="true" />Nova reserva</button>} />
      {error && !booking && !detail && <div className="mb-4"><Notice message={error} onClose={() => setError("")} /></div>}
      {success && <div className="mb-4"><Notice type="success" message={success} onClose={() => setSuccess("")} /></div>}
      <Card className="mb-5 space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="relative min-w-0 flex-1"><span className="field-label">Buscar reserva</span>
            <Search size={17} aria-hidden="true" className="absolute bottom-3 left-3 text-muted-ink" />
            <input type="search" className="field !pl-10" value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder={admin ? "Turma, UC, sala ou instrutor" : "Turma, UC ou sala"} />
          </label>
          <details className="relative sm:shrink-0">
            <summary className="btn-secondary min-h-11 cursor-pointer list-none"><SlidersHorizontal size={17} aria-hidden="true" />Filtros{filterCount > 0 && <span>({filterCount})</span>}<ChevronDown size={16} aria-hidden="true" /></summary>
            <div className="mt-3 space-y-3 rounded-panel border border-line bg-surface p-4 sm:absolute sm:right-0 sm:z-20 sm:w-80 sm:shadow-soft">
              {admin && <Field label="Instrutor"><select className="field" value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)}>
                <option value="">Todos os instrutores</option>{data.teachers.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
              </select></Field>}
              <Field label="Período a partir de"><input type="date" className="field" value={from} max={until || undefined} onChange={(event) => setFrom(event.target.value)} /></Field>
              <Field label="Período até"><input type="date" className="field" value={until} min={from || undefined} onChange={(event) => setUntil(event.target.value)} /></Field>
              <button type="button" className="btn-quiet" onClick={clearFilters}>Limpar filtros</button>
            </div>
          </details>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar reservas por situação">
          {["Todos", "Pendente", "Aprovada", "Rejeitada"].map((status) => <button key={status} type="button" aria-pressed={filter === status}
            onClick={() => setFilter(status)} className={filter === status ? "btn-primary" : "btn-secondary"}>
            {status === "Aprovada" ? "Confirmadas" : status === "Rejeitada" ? "Descartadas" : labels[status]}
            <span className="tabular-nums">({status === "Todos" ? matching.length : matching.filter(b => b.status === status).length})</span>
          </button>)}
        </div>
      </Card>
      <p role="status" className="mb-3 text-sm text-muted-ink">{list.length} {list.length === 1 ? "reserva encontrada" : "reservas encontradas"}</p>
      {!list.length ? <Card className="p-4"><Empty title={data.bookings.length ? "Nenhuma reserva encontrada" : "Sem reservas"}
        text={data.bookings.length ? "Ajuste a busca ou os filtros para encontrar a reserva." : "Crie uma reserva para organizar os espaços da sua turma."} />
        {data.bookings.length > 0 && <div className="flex justify-center pb-4"><button type="button" className="btn-secondary" onClick={clearFilters}>Limpar filtros</button></div>}
      </Card> : <div className="grid gap-3">{list.map((b) => <article key={b.id} onClick={(event) => {
        if ((event.target as HTMLElement).closest("button, a")) return;
        event.currentTarget.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')?.focus();
        setDetailId(b.id); setError("");
      }}><Card className={`card-interactive cursor-pointer p-4 sm:p-5 ${focusId === b.id ? "ring-2 ring-skybrand-500" : ""}`}>
        <span id={`booking-${b.id}`} />
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:justify-between sm:gap-3">
          <div className="min-w-0 w-full flex-1 space-y-1 sm:w-auto">
            <h2 className="break-words font-semibold text-ink"><button type="button" aria-haspopup="dialog"
              aria-label={`Abrir detalhes da reserva #${b.id}: ${b.classGroupId ? turma(b.classGroupId) : b.reason}`}
              className="rounded text-left underline decoration-line underline-offset-4 hover:decoration-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500"
              onClick={(event) => { event.currentTarget.focus(); setDetailId(b.id); setError(""); }}>{b.classGroupId ? turma(b.classGroupId) : b.reason}</button></h2>
            {b.curricularUnitId && <p className="break-words text-sm text-ink">{b.curricularUnitName || "Unidade curricular registrada"}</p>}
            {b.curricularCapabilityId != null && b.curricularCapabilityDescription && <p className="break-words text-sm text-muted-ink">{b.curricularCapabilityDescription}</p>}
          </div>
          <Badge status={b.status} label={labels[b.status]} />
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1 text-sm text-muted-ink">
          <p>{dateBR(b.startsAt)}{b.repeatUntil && ` a ${dateBR(b.repeatUntil)}`} · {b.startsAt.slice(11, 16)}–{b.endsAt.slice(11, 16)}</p>
          {b.recurrence !== "Nenhuma" && <p>Semanal: {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].filter((_, day) => b.weekdaysMask ? (b.weekdaysMask & (1 << day)) !== 0 : day === new Date(b.startsAt).getDay()).join(", ")}</p>}
          {b.recurrence === "Nenhuma" && b.repeatUntil && <p>Datas específicas no período</p>}
          {admin && <p className="font-medium text-ink">Instrutor: {teacher(b.teacherId)}</p>}
          {b.approvedRoomId && <p className="font-medium text-ink">Sala: {roomOptions.get(b.approvedRoomId)?.name ?? "Sala registrada"}</p>}
          {b.classGroupId && b.reason !== "Aula" && <p className="break-words">{b.reason}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {b.status === "Pendente" && <button type="button" className="btn-primary" disabled={busy} onClick={() => void choose(b)}>Escolher sala</button>}
        </div>
        </div>
      </Card></article>)}</div>}
      {detail && <Modal title={`Detalhes da reserva #${detail.id}`} width="max-w-3xl" onClose={() => { if (!busy) setDetailId(null); }}>
        <div className="space-y-5">
          {error && <Notice message={error} />}
          <div className="space-y-2">
            <Badge status={detail.status} label={labels[detail.status]} />
            <h3 className="break-words font-semibold text-ink">{detailClass?.code && `${detailClass.code} · `}{turma(detail.classGroupId)}</h3>
            {detail.curricularUnitId && <p className="break-words text-sm text-ink">{detail.curricularUnitName || "Unidade curricular registrada"}</p>}
            {detail.curricularCapabilityId != null && detail.curricularCapabilityDescription && <p className="break-words text-sm text-muted-ink">{detail.curricularCapabilityDescription}</p>}
          </div>
          <dl className="grid gap-4 rounded-panel border border-line bg-canvas p-4 text-sm sm:grid-cols-2">
            <div className="min-w-0"><dt className="text-muted-ink">Instrutor responsável</dt><dd className="break-words font-medium text-ink">{teacher(detail.teacherId)}</dd></div>
            <div className="min-w-0"><dt className="text-muted-ink">Sala</dt><dd className="break-words font-medium text-ink">{detail.approvedRoomId ? roomOptions.get(detail.approvedRoomId)?.name ?? "Sala registrada" : detail.status === "Pendente" ? "Aguardando escolha" : "Nenhuma sala confirmada"}</dd></div>
            <div className="min-w-0"><dt className="text-muted-ink">Período solicitado</dt><dd className="break-words font-medium text-ink">{dateBR(detail.startsAt)}{detail.repeatUntil && ` a ${dateBR(detail.repeatUntil)}`}</dd></div>
            <div><dt className="text-muted-ink">Horário</dt><dd className="font-medium text-ink">{detail.startsAt.slice(11, 16)}–{detail.endsAt.slice(11, 16)}</dd></div>
            <div><dt className="text-muted-ink">Alunos</dt><dd className="font-medium text-ink">{detail.students}</dd></div>
            <div className="min-w-0"><dt className="text-muted-ink">Semestre</dt><dd className="break-words font-medium text-ink">{data.semesters.find(item => item.id === detailClass?.semesterId)?.name ?? "Não informado"}</dd></div>
            <div className="min-w-0"><dt className="text-muted-ink">Frequência</dt><dd className="break-words font-medium text-ink">{detail.recurrence === "Nenhuma" ? detail.repeatUntil ? "Datas específicas" : "Data única" : `Semanal: ${["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].filter((_, day) => detail.weekdaysMask ? (detail.weekdaysMask & (1 << day)) !== 0 : day === new Date(detail.startsAt).getDay()).join(", ")}`}</dd></div>
            {detail.recurringEadWeekday != null && <div><dt className="text-muted-ink">Dia com EAD</dt><dd className="font-medium text-ink">{["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][detail.recurringEadWeekday]}</dd></div>}
            <div className="min-w-0"><dt className="text-muted-ink">Atividade</dt><dd className="break-words font-medium text-ink">{detail.reason}</dd></div>
          </dl>
          <section aria-label="Recursos solicitados" className="space-y-2 text-sm">
            <h3 className="font-semibold text-ink">Recursos solicitados</h3>
            <p className="break-words text-muted-ink">{detailResources.join(", ") || "Nenhum recurso adicional solicitado."}</p>
            {(detail.needsStudentComputers || detail.softwareIds.length > 0) && <p className="text-muted-ink">Potência mínima: {detail.minTier === "Alto" ? "Alta" : detail.minTier === "Intermediario" ? "Intermediária" : "Básica"}. {detail.studentsPerComputer} aluno(s) por computador.</p>}
            {detail.lessonPlanLink && /^https?:\/\//i.test(detail.lessonPlanLink) && <a href={detail.lessonPlanLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded font-medium text-ink underline">Abrir plano de ensino</a>}
          </section>
          <details aria-label="Histórico da reserva" className="border-t border-line pt-3">
            <summary className="min-h-11 cursor-pointer rounded py-3 font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500">Histórico da reserva</summary>
            <div className="pt-3 [overflow-wrap:anywhere]"><AuditHistory key={`${detail.id}-${detail.version}-${detail.status}`} type="Booking" id={detail.id} scrollable={false} /></div>
          </details>
          {detail.status === "Pendente" && <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
              <button type="button" className="btn-quiet text-[var(--color-remove-ink)]" disabled={busy} onClick={() => void discard(detail.id)}><Trash2 size={15} aria-hidden="true" />Descartar</button>
              {(admin || detail.teacherId === user.id) && <button type="button" className="btn-secondary" disabled={busy} onClick={() => {
                formState.current = { dirty: false, busy: false }; setEditing(detail); setError("");
              }}><Pencil size={15} aria-hidden="true" />Editar</button>}
              <button type="button" className="btn-primary" disabled={busy} onClick={() => { setDetailId(null); void choose(detail); }}>Escolher sala</button>
          </div>}
        </div>
      </Modal>}
      {form && <Modal title="Criar reserva" onClose={() => void closeForm()}>
        <BookingForm user={user} onCancel={() => void closeForm()} onStateChange={(state) => { formState.current = state; }} onCreated={(id, qualificationWarning) => {
          setForm(false); formState.current = { dirty: false, busy: false }; setCreatedId(id);
          setSuccess("Solicitação criada. Escolha uma sala e confira as datas antes de confirmar." + (qualificationWarning ? " Habilitação para esta UC não cadastrada no perfil." : ""));
        }} />
      </Modal>}
      {editing && <Modal title={`Editar solicitação #${editing.id}`} onClose={() => void closeForm()}>
        <BookingForm key={editing.id} user={user} editing={editing} onCancel={() => void closeForm()} onStateChange={(state) => { formState.current = state; }} onCreated={() => {}} onSaved={() => {
          setEditing(null); formState.current = { dirty: false, busy: false }; setBooking(null); setAvailability(null); setSuggestions([]);
          setSuccess("Solicitação atualizada. Consulte novamente a disponibilidade antes de escolher a sala.");
        }} />
      </Modal>}
      {booking && <Modal title="Escolher sala" width="max-w-4xl" onClose={closeChoice}>
        <div className="space-y-5">
          <div className="space-y-1 rounded-panel border border-line bg-canvas p-4 text-sm">
            <h3 className="break-words font-semibold text-ink">{turma(booking.classGroupId)}</h3>
            {booking.curricularUnitName && <p className="break-words text-ink">{booking.curricularUnitName}</p>}
            <p className="text-muted-ink">{dateBR(booking.startsAt)}{booking.repeatUntil && ` a ${dateBR(booking.repeatUntil)}`} · {booking.startsAt.slice(11, 16)}–{booking.endsAt.slice(11, 16)} · {booking.students} alunos</p>
            {admin && <p className="text-muted-ink">Instrutor: {teacher(booking.teacherId)}</p>}
          </div>
          <p className="text-sm text-muted-ink">Selecione uma sala para conferir as datas. As opções seguem a ordem de adequação.</p>
          {error && <div className="space-y-2"><Notice message={error} /><button type="button" className="btn-secondary" disabled={busy || confirming} onClick={() => selectedRoom ? void selectRoom(selectedRoom) : void choose(booking)}>Tentar novamente</button></div>}
          {busy && <p role="status" className="text-sm text-muted-ink">Consultando disponibilidade…</p>}
          <div className="grid gap-3 sm:grid-cols-2" aria-label="Ambientes sugeridos para a reserva">
            {suggestions.map((s) => <button key={s.id} type="button" aria-pressed={selectedRoom === String(s.id)} disabled={busy || confirming}
              onClick={() => void selectRoom(String(s.id))}
              className={`min-w-0 space-y-2 rounded-panel border p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500 ${selectedRoom === String(s.id) ? "border-skybrand-500 bg-canvas ring-1 ring-skybrand-500" : "border-line hover:border-skybrand-500"}`}>
              <p className="break-words font-semibold text-ink">{roomOptions.get(s.id)?.code && `${roomOptions.get(s.id)?.code} · `}{s.name}</p>
              <p className="break-words text-sm text-muted-ink">{roomOptions.get(s.id) ? `${roomKind(roomOptions.get(s.id)!.kind)} · ` : ""}{s.location} · {s.seats} lugares</p>
              <p className="text-sm text-ink">Requisitos: {s.technicalClassification === "Partial" ? "parcialmente atendidos" : s.compatible ? "atendidos" : "não atendidos"}</p>
              <p className="text-sm font-medium text-ink">{s.available ? "Sem conflito indicado na prévia" : `${s.availableOccurrences} de ${s.totalOccurrences} datas livres na prévia`}</p>
              {selectedRoom === String(s.id) && <span className="block text-sm font-semibold text-ink">Sala selecionada</span>}
            </button>)}
          </div>
          {!suggestions.length && !busy && !error && <Empty title="Nenhuma sala cadastrada" />}
          {selected && <section className="space-y-4 border-t border-line pt-4 [&_input]:scroll-mb-24 [&_summary]:scroll-mb-24" aria-label="Detalhes da sala selecionada">
            <h3 className="break-words font-semibold text-ink">{selected.name}</h3>
            <details className="rounded-panel border border-line p-3 text-sm">
              <summary className="min-h-11 cursor-pointer py-3 font-medium text-ink">Ver requisitos e inventário</summary>
              <div className="space-y-2 pt-2 text-muted-ink">
                <p>{selected.purpose || "Finalidade não informada"}</p>
                {selected.incompatibility && <p>Requisito não atendido: {selected.incompatibility}</p>}
                {selected.availabilityReason && <p>{selected.availabilityReason}</p>}
                {selected.technicalFindings?.map((finding) => <p key={finding.requirement}>{finding.status === "Met" ? "Atendido" : finding.status === "Unknown" ? "Verificar" : finding.status === "Partial" ? "Parcial" : "Não atendido"}: {finding.detail}</p>)}
                <p className="break-words">{selected.computerGroups.map((g) => `${g.quantity} computadores · ${g.ramGb} GB RAM · ${g.tier} · ${g.software.map(s => s.name).join(", ") || "sem softwares cadastrados"}`).join("; ") || "Sala sem computadores cadastrados."}</p>
              </div>
            </details>
            {availability && <div className="space-y-3 rounded-panel border border-line bg-canvas p-4">
              <p role="status" className="font-semibold text-ink">{availability.total} datas solicitadas · {acceptedDates.length} para confirmar · {unavailableDays.length} indisponíveis</p>
              {replace && acceptedDates.length > availability.available && <p className="text-sm text-ink">{acceptedDates.length - availability.available} data(s) incluem a substituição de alocações do instrutor desta turma.</p>}
              {unavailableDays.length > 0 && <div className="space-y-2"><h4 className="flex items-center gap-2 text-sm font-semibold text-ink"><AlertTriangle size={17} aria-hidden="true" />Datas que ficarão de fora</h4>
                <ul className="space-y-2 text-sm text-muted-ink">{unavailableDays.map((day) => <li key={day.start} className="break-words">{dateTimeBR(day.start)}: {day.calendarReason ? `${day.calendarReason}${day.conflicts.length ? `; Ocupada: ${conflicts(day.conflicts)}` : ""}` : day.availabilityReason || `Ocupada: ${conflicts(day.conflicts)}`}</li>)}</ul>
              </div>}
              <details className="text-sm"><summary className="min-h-11 cursor-pointer py-3 font-medium text-ink">Ver todas as datas ({availability.total})</summary>
                <ul className="space-y-2 pt-2 text-muted-ink">{availability.days.map((day) => <li key={day.start}>{dateTimeBR(day.start)} · {acceptedDates.includes(day.start.slice(0, 10)) ? day.available ? "Disponível" : "Substituição de alocação" : "Indisponível"}</li>)}</ul>
              </details>
            </div>}
            {replaceable && <Checkbox label={admin ? `Substituir alocações de ${teacher(booking.teacherId)} nesta mesma turma` : "Substituir minhas alocações nesta mesma turma"} checked={replace} onChange={setReplace} />}
            {replace && <Notice type="info" message="Somente alocações elegíveis deste instrutor e desta turma serão substituídas. As reservas dos demais instrutores serão preservadas." />}
            {availability && possiblyAvailable === 0 && <p role="status" className="text-sm text-muted-ink">Nenhuma data pode ser confirmada nesta sala. Escolha outra opção ou revise as datas da solicitação.</p>}
            <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-line bg-surface py-3">
              <button type="button" className="btn-secondary" disabled={confirming} onClick={closeChoice}>Voltar à lista</button>
              <button type="button" className="btn-primary" disabled={busy || confirming || !availability || possiblyAvailable === 0} onClick={() => void confirm()}>
                <Check size={17} aria-hidden="true" />Revisar {possiblyAvailable} {possiblyAvailable === 1 ? "data" : "datas"}
              </button>
            </div>
          </section>}
        </div>
      </Modal>}
    </>
  );
}
