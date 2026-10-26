import { useState } from "react";
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
import { dateTimeBR, dateBR, resultMessage } from "../lib/utils";
import {
  Badge,
  Card,
  Empty,
  Modal,
  Notice,
  Title,
  Checkbox,
} from "../components/UI";
import { BookingForm } from "../components/BookingForm";
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
}: {
  user: User;
  reloadAgenda: () => Promise<void>;
}) {
  const { data, reload } = useData();
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
  const teacher = (id: string | null) =>
    data.teachers.find((t) => t.id === id)?.displayName ||
    "Professor não identificado";
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
    const missing = availability.unavailable;
    const explanation = missing
      ? `${missing} de ${availability.total} datas apresentam conflitos. A API tentará confirmar apenas as disponíveis.`
      : `Confirmar ${availability.available} data(s) no ${chosen.name}?`;
    if (!window.confirm(explanation)) return;
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
    if (!window.confirm("Descartar esta solicitação ainda não confirmada?"))
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
  const list = data.bookings.filter(
    (b) => filter === "Todos" || b.status === filter,
  );
  const selected = suggestions.find((s) => s.id === Number(selectedRoom));
  const possiblyAvailable =
    availability?.days.filter(
      (d) =>
        d.available ||
        (replace &&
          booking?.classGroupId != null &&
          d.conflicts.length === 1 &&
          d.conflicts[0].teacherId === booking.teacherId &&
          d.conflicts[0].classGroupId === booking.classGroupId),
    ).length ?? 0;
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
      <Card className="p-3 mb-5">
        <div className="flex flex-wrap gap-2">
          {["Todos", "Pendente", "Aprovada", "Rejeitada"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`text-sm font-semibold px-4 py-2 rounded-xl ${filter === s ? "bg-navy-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}
            >
              {s === "Todos"
                ? "Todas"
                : s === "Pendente"
                  ? "Aguardando sala"
                  : s === "Aprovada"
                    ? "Confirmadas"
                    : "Descartadas"}
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
            <Card key={b.id} className="p-4 md:p-5">
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
            </Card>
          ))}
        </div>
      )}
      {form && (
        <Modal title="Criar reserva" onClose={() => setForm(false)}>
          <BookingForm
            onCreated={() => {
              setForm(false);
              setSuccess(
                "Reserva criada! Agora selecione uma sala na lista e confirme a alocação.",
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
              As salas são ordenadas pela adequação. Uma sala ocupada continua
              visível, mas não pode ser confirmada nas datas em conflito.
            </p>
            {busy && (
              <p className="text-sm text-slate-500">
                Consultando disponibilidade...
              </p>
            )}
            <div className="grid sm:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => void selectRoom(String(s.id))}
                  className={`rounded-xl border p-3 text-left space-y-1 ${selectedRoom === String(s.id) ? "border-sky-500 bg-sky-50" : "border-slate-200 hover:border-slate-400"}`}
                >
                  <div className="flex justify-between gap-2">
                    <b className="text-sm">{s.name}</b>
                    <span
                      className={`text-[11px] font-bold ${s.compatible ? "text-emerald-700" : "text-rose-700"}`}
                    >
                      {s.compatible ? "Compatível" : "Incompatível"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {s.location} · {s.seats} lugares · {s.computers}{" "}
                    computadores
                  </p>
                  <p className="text-xs text-slate-600">
                    {s.purpose || "Finalidade não informada"}
                  </p>
                  <p
                    className={`text-xs font-semibold ${s.available ? "text-emerald-700" : "text-amber-700"}`}
                  >
                    {s.available
                      ? "Livre"
                      : `Ocupada: ${s.availableOccurrences}/${s.totalOccurrences} datas livres`}
                  </p>
                  {s.incompatibility && (
                    <p className="text-xs text-rose-700">{s.incompatibility}</p>
                  )}
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
                <h3 className="text-sm font-bold">
                  {selected.name}: avaliação detalhada
                </h3>
                <div className="text-xs text-slate-600">
                  {selected.computerGroups
                    .map(
                      (g) =>
                        `${g.quantity} PC(s) · ${g.ramGb} GB RAM · ${g.tier} · ${g.software.map((s) => s.name).join(", ") || "sem softwares cadastrados"}`,
                    )
                    .join(" | ") || "Sala sem computadores cadastrados."}
                </div>
                {availability && (
                  <div className="rounded-xl bg-slate-50 border p-3">
                    <p className="text-sm font-bold mb-2">
                      {availability.available} disponíveis /{" "}
                      {availability.total} solicitadas
                    </p>
                    <div className="max-h-36 overflow-y-auto space-y-1">
                      {availability.days.map((d) => (
                        <p
                          className={`text-xs ${d.available ? "text-emerald-700" : "text-rose-700"}`}
                          key={d.start}
                        >
                          {dateTimeBR(d.start)} ·{" "}
                          {d.available
                            ? "Disponível"
                            : `Ocupada: ${conflicts(d.conflicts)}`}
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
                    message="Ao confirmar, o backend substituirá apenas ocorrências próprias elegíveis; reservas de outros professores não serão apagadas."
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
                    Confirmar até {possiblyAvailable} data(s)
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
