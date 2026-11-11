import { useEffect, useState } from "react";
import {
  CalendarPlus,
  Check,
  Eye,
  Plus,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { useData } from "../lib/data";
import { post, read } from "../lib/api";
import { dateTimeBR, dateBR, resultMessage, roomKind } from "../lib/utils";
import {
  Badge,
  Card,
  Empty,
  Modal,
  Notice,
  Title,
  Checkbox,
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
  const [form, setForm] = useState(false),
    [filter, setFilter] = useState("Todos");
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
  const [historyBookingId, setHistoryBookingId] = useState<number | null>(null);
  const [createdId, setCreatedId] = useState<number | null>(null);
  useEffect(() => {
    if (!focusId) return;
    setFilter("Todos");
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
    setBooking(b);
    setBusy(true);
    setError("");
    setAvailability(null);
    setSelectedRoom("");
    setReplace(false);
    try {
      const found = await read<Suggestion[]>(`/bookings/${b.id}/suggestions`);
      setSuggestions(found);
    } catch (e) {
      setError(resultMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function selectRoom(id: string) {
    if (!booking) return;
    setSelectedRoom(id);
    setAvailability(null);
    setError("");
    if (!id) return;
    setBusy(true);
    try {
      setAvailability(
        await read<BookingAvailability>(
          `/bookings/${booking.id}/availability?roomId=${id}`,
        ),
      );
    } catch (e) {
      setError(resultMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!booking || !selectedRoom || !availability) return;
    const chosen = suggestions.find((s) => s.id === Number(selectedRoom));
    if (!chosen?.compatible) {
      setError(
        "A sala não atende aos requisitos. Escolha uma sala compatível ou negocie um empréstimo.",
      );
      return;
    }
    const missing = availability.total - acceptedDates.length;
    const explanation = missing
      ? `${missing} de ${availability.total} datas estão indisponíveis. Confirmar somente as ${acceptedDates.length} datas válidas?`
      : `Confirmar ${acceptedDates.length} data(s) no ${chosen.name}?`;
    if (!await ask({ title: "Confirmar reserva", message: explanation, confirmLabel: "Confirmar datas" })) return;
    setBusy(true);
    setError("");
    try {
      const result = await post<{
        reservedCount: number;
        unavailableDates: unknown[];
        replacedOccupationIds: number[];
      }>(`/bookings/${booking.id}/confirm`, {
        roomId: Number(selectedRoom),
        confirmPartial: missing > 0,
        replaceOwnClassBooking: replace,
        expectedAvailableDates: booking.curricularCapabilityId
          ? acceptedDates
          : undefined,
      });
      await reload();
      await reloadAgenda();
      setBooking(null);
      setAvailability(null);
      setSuccess(
        `${result.reservedCount} data(s) confirmadas. ${result.unavailableDates.length} indisponível(is). ${result.replacedOccupationIds.length} alocação(ões) substituída(s).`,
      );
    } catch (e) {
      setError(resultMessage(e));
      if (booking) await selectRoom(selectedRoom);
    } finally {
      setBusy(false);
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
  const list = data.bookings.filter((b) => filter === "Todos" || b.status === filter)
    .sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || a.startsAt.localeCompare(b.startsAt));
  const selected = suggestions.find((s) => s.id === Number(selectedRoom));
  const possiblyAvailable = acceptedDates.length;
  const roomOptions = new Map(data.rooms.map((room) => [room.id, room]));
  return (
    <>
      <Title
        title="Reservas de salas"
        subtitle="Selecione os dias e turnos, confira a compatibilidade e confirme sua sala."
        action={
          <button
            className="btn-primary"
            onClick={() => {
              setForm(true);
              setError("");
            }}
          >
            <Plus size={17} />
            Nova reserva
          </button>
        }
      />
      {error && (
        <div className="mb-4">
          <Notice message={error} onClose={() => setError("")} />
        </div>
      )}
      {success && (
        <div className="mb-4">
          <Notice
            type="success"
            message={success}
            onClose={() => setSuccess("")}
          />
        </div>
      )}
      <Card className="p-4 mb-5">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar reservas por situação">
          {["Todos", "Pendente", "Aprovada", "Rejeitada"].map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filter === s}
              onClick={() => setFilter(s)}
              className={filter === s ? "btn-primary" : "btn-secondary"}
            >
              {s === "Todos"
                ? "Todas"
                : s === "Pendente"
                  ? "Aguardando sala"
                  : s === "Aprovada"
                    ? "Confirmadas"
                    : "Rejeitadas / descartadas"}
            </button>
          ))}
        </div>
      </Card>
      {list.length === 0 ? (
        <Card>
          <Empty
            title="Sem reservas"
            text="Crie uma reserva para organizar os espaços da sua turma."
          />
        </Card>
      ) : (
        <div className="grid gap-3">
          {list.map((b) => (
            <Card key={b.id} className={"p-4 md:p-5 " + (focusId === b.id ? "ring-2 ring-sky-500" : "")}>
              <span id={"booking-" + b.id} />
              <div className="flex flex-wrap justify-between items-start gap-3">
                <div className="flex gap-3">
                  <span className="bg-sky-50 text-sky-700 p-3 rounded-xl">
                    <CalendarPlus size={19} />
                  </span>
                  <div>
                    <b className="text-sm">{b.reason}</b>
                    <p className="text-xs text-slate-500 mt-1">
                      {dateTimeBR(b.startsAt)}–{b.endsAt.slice(11, 16)} ·{" "}
                      {b.students} alunos
                    </p>
                    <div className="flex gap-2 flex-wrap mt-2">
                      <span className="pill bg-slate-100">
                        {b.recurrence === "Nenhuma"
                          ? "Data única"
                          : `Semanal até ${dateBR(b.repeatUntil)}`}
                      </span>
                      {b.classGroupId && (
                        <span className="pill bg-slate-100">
                          {turma(b.classGroupId)}
                        </span>
                      )}
                      {b.curricularUnitId && <span className="pill bg-sky-50 text-sky-700">
                        {b.curricularUnitName || `UC #${b.curricularUnitId}`} · {b.curricularCapabilityDescription || `capacidade #${b.curricularCapabilityId}`}
                      </span>}
                      {b.approvedRoomId && (
                        <span className="pill bg-sky-50 text-sky-700">
                          {
                            data.rooms.find((r) => r.id === b.approvedRoomId)
                              ?.name
                          }
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Badge status={b.status} />
              </div>
              <div className="flex flex-wrap justify-between items-center gap-3 mt-4">
                <p className="text-xs text-slate-500">
                  {teacher(b.teacherId)} · #{b.id}
                </p>
                {b.status === "Pendente" && (
                  <div className="flex gap-2">
                    <button
                      className="btn-secondary !py-2"
                      onClick={() => void choose(b)}
                    >
                      <Eye size={15} />
                      Escolher sala
                    </button>
                    <button
                      className="btn-quiet !py-2"
                      onClick={() => void discard(b.id)}
                      disabled={busy}
                    >
                      <Trash2 size={15} />
                      Descartar
                    </button>
                  </div>
                )}
              </div>
              <button type="button" className="text-xs font-semibold text-sky-700 underline mt-3" onClick={() => setHistoryBookingId(historyBookingId === b.id ? null : b.id)}>Histórico da reserva</button>
              {historyBookingId === b.id && <div className="mt-3 border-t pt-3"><AuditHistory type="Booking" id={b.id} /></div>}
            </Card>
          ))}
        </div>
      )}
      {form && (
        <Modal title="Criar reserva" onClose={() => setForm(false)}>
          <BookingForm
            user={user}
            onCreated={(id, qualificationWarning) => {
              setForm(false);
              setCreatedId(id);
              setSuccess(
                "Solicitação criada. Escolha uma sala e confira as datas antes de confirmar." +
                  (qualificationWarning ? " Habilitação para esta UC não cadastrada no perfil." : ""),
              );
            }}
          />
        </Modal>
      )}
      {booking && (
        <Modal
          title={`Escolher sala · Reserva #${booking.id}`}
          width="max-w-4xl"
          onClose={() => {
            setBooking(null);
            setAvailability(null);
          }}
        >
          <div className="space-y-4">
            {error && <Notice message={error} />}
            <p className="text-sm text-slate-600">
              As salas são ordenadas pela adequação. Compatibilidade técnica e disponibilidade nas datas são verificações distintas; a reserva só é confirmada após validação e persistência no backend.
            </p>
            {busy && (
              <p className="text-sm text-slate-500">
                Consultando disponibilidade...
              </p>
            )}
            <div className="grid sm:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto" aria-label="Ambientes sugeridos para a reserva">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={selectedRoom === String(s.id)}
                  onClick={() => void selectRoom(String(s.id))}
                  className={`rounded-xl border p-3 text-left space-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${selectedRoom === String(s.id) ? "border-sky-500 bg-sky-50" : "border-line hover:border-sky-500"}`}
                >
                  <div className="flex justify-between gap-2">
                    <b className="text-sm">{roomOptions.get(s.id)?.code ? `${roomOptions.get(s.id)?.code} · ` : ""}{s.name}</b>
                    <span
                      className={`text-[11px] font-bold ${s.compatible ? "text-emerald-700" : "text-rose-700"}`}
                    >
                      {s.technicalClassification === "Partial" ? "Parcial" :
                        s.compatible ? "Compatível" : "Incompatível"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-ink">
                    {roomOptions.get(s.id) ? `${roomKind(roomOptions.get(s.id)!.kind)} · ` : ""}{s.location} · {s.seats} lugares · {s.computers} computadores informados
                  </p>
                  <p className="text-xs text-slate-600">
                    {s.purpose || "Finalidade não informada"}
                  </p>
                  <p
                    className={`text-xs font-semibold ${s.available ? "text-emerald-700" : "text-amber-700"}`}
                  >
                    {s.available
                      ? "Sem conflito indicado nas datas consultadas"
                      : `${s.availableOccurrences}/${s.totalOccurrences} datas potencialmente livres na prévia`}
                  </p>
                  {s.incompatibility && (
                    <p className="text-xs text-rose-700">{s.incompatibility}</p>
                  )}
                  {s.availabilityReason && <p className="text-xs text-amber-800">{s.availabilityReason}</p>}
                  {s.conflicts.length > 0 && (
                    <p className="text-xs text-slate-500 line-clamp-2">
                      {conflicts(s.conflicts)}
                    </p>
                  )}
                </button>
              ))}
            </div>
            {suggestions.length === 0 && !busy && (
              <Empty title="Nenhuma sala cadastrada" />
            )}
            {selected && (
              <div className="border-t pt-4 space-y-3">
                <h3 className="text-sm font-bold">{selected.name}: requisitos técnicos e disponibilidade</h3>
                <div className="text-xs text-slate-600">
                  Inventário informado: {" "}
                  {selected.computerGroups
                    .map(
                      (g) =>
                        `${g.quantity} PC(s) · ${g.ramGb} GB RAM · ${g.tier} · ${g.software.map((s) => s.name).join(", ") || "sem softwares cadastrados"}`,
                    )
                    .join(" | ") || "Sala sem computadores cadastrados."}
                </div>
                {selected.technicalFindings?.map((finding) =>
                  <p key={finding.requirement} className="text-xs text-slate-600">
                    {finding.status === "Met" ? "Atendido" : finding.status === "Unknown" ? "Verificar" :
                      finding.status === "Partial" ? "Parcial" : "Não atendido"}: {finding.detail}
                  </p>)}
                {availability && (
                  <div className="rounded-xl bg-slate-50 border p-3">
                    <p className="text-sm font-bold mb-2" role="status">
                      {availability.total} datas solicitadas, {availability.available} disponíveis e {availability.unavailable} indisponíveis.
                    </p>
                    {replace && acceptedDates.length > availability.available && <p className="text-xs text-amber-800 mb-2">{acceptedDates.length - availability.available} data(s) adicional(is) elegível(is) para substituir uma alocação própria da mesma turma.</p>}
                    <div className="max-h-36 overflow-y-auto space-y-1">
                      {availability.days.map((d) => (
                        <p
                          className={`text-xs ${d.available ? "text-emerald-700" : "text-rose-700"}`}
                          key={d.start}
                        >
                          {dateTimeBR(d.start)} ·{" "}
                          {d.available
                            ? "Disponível"
                            : d.calendarReason
                              ? `${d.calendarReason}${d.conflicts.length ? `; ocupada: ${conflicts(d.conflicts)}` : ""}`
                              : d.availabilityReason || `Ocupada: ${conflicts(d.conflicts)}`}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                <Checkbox
                  label="Substituir minhas alocações existentes desta mesma turma nos turnos selecionados"
                  checked={replace}
                  onChange={setReplace}
                />
                {replace && (
                  <Notice
                    type="info"
                    message="Ao confirmar, o backend substituirá apenas ocorrências próprias elegíveis; reservas de outros instrutores não serão apagadas."
                  />
                )}
                {availability && availability.unavailable > 0 && (
                  <div className="flex gap-2 items-start text-xs text-amber-800">
                    <AlertTriangle size={17} />
                    Algumas datas estão ocupadas. Somente as disponíveis poderão
                    ser confirmadas, mediante sua autorização.
                  </div>
                )}
                <div className="flex justify-end">
                  <button
                    disabled={
                      busy ||
                      !selected.compatible ||
                      !availability ||
                      possiblyAvailable === 0
                    }
                    className="btn-primary"
                    onClick={() => void confirm()}
                  >
                    <Check size={17} />
                    Confirmar {possiblyAvailable} data(s) elegível(is)
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
