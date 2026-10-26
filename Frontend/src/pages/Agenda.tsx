import { useEffect, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  LockKeyhole,
} from "lucide-react";
import { read, post, remove } from "../lib/api";
import { useData } from "../lib/data";
import { dateBR, hour, localDate, nextDate, resultMessage } from "../lib/utils";
import {
  Card,
  Field,
  Modal,
  Notice,
  SubmitButton,
  Title,
} from "../components/UI";
import { OccupationManager } from "../components/OccupationManager";
import type { Occupation, User } from "../types";

export function Agenda({
  user,
  occupations,
  reloadAgenda,
}: {
  user: User;
  occupations: Occupation[];
  reloadAgenda: () => Promise<void>;
}) {
  const admin = user.roles.includes("Admin");
  const { data } = useData();
  const [selected, setSelected] = useState<Occupation | null>(null);
  const [chosen, setChosen] = useState<number[]>([]);
  const [from, setFrom] = useState(localDate(new Date()));
  const [roomId, setRoomId] = useState("");
  const [items, setItems] = useState<Occupation[]>(occupations);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [blockRoom, setBlockRoom] = useState("");
  const [blockDate, setBlockDate] = useState(localDate(new Date()));
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("10:00");
  const [description, setDescription] = useState("Manutenção");
  const [busy, setBusy] = useState(false);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const all = await read<Occupation[]>(
        `/agenda?from=${from}T00:00:00&to=${nextDate(from, 7)}T00:00:00${roomId ? `&roomId=${roomId}` : ""}`,
      );
      setItems(all);
    } catch (e) {
      setError(resultMessage(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [from, roomId]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("/rooms/block", {
        roomId: Number(blockRoom),
        startsAt: `${blockDate}T${start}:00`,
        endsAt: `${blockDate}T${end}:00`,
        description,
      });
      setModal(false);
      await load();
      await reloadAgenda();
    } catch (e) {
      setError(resultMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function releaseMany() {
    if (
      !chosen.length ||
      !window.confirm(`Liberar ${chosen.length} datas selecionadas?`)
    )
      return;
    setBusy(true);
    try {
      await post("/occupations/release-many", {
        occupationIds: chosen,
        confirm: true,
      });
      setChosen([]);
      await load();
      await reloadAgenda();
    } catch (e) {
      setError(resultMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function unblock(id: number) {
    if (!window.confirm("Deseja remover este bloqueio?")) return;
    try {
      await remove(`/rooms/block/${id}`);
      await load();
      await reloadAgenda();
    } catch (e) {
      setError(resultMessage(e));
    }
  }
  const dates = Array.from({ length: 7 }, (_, i) => nextDate(from, i));
  return (
    <>
      <Title
        title="Agenda de salas"
        subtitle="Visualize a ocupação por dia e acompanhe aulas, reservas e empréstimos."
        action={
          admin ? (
            <button
              className="btn-primary"
              onClick={() => {
                setBlockRoom(data.rooms[0] ? String(data.rooms[0].id) : "");
                setBlockDate(from);
                setModal(true);
              }}
            >
              <LockKeyhole size={16} /> Bloquear sala
            </button>
          ) : undefined
        }
      />
      {error && (
        <div className="mb-4">
          <Notice message={error} onClose={() => setError("")} />
        </div>
      )}
      <Card className="p-4 mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-end gap-1">
            <button
              className="btn-secondary !px-3"
              title="Semana anterior"
              onClick={() => setFrom(nextDate(from, -7))}
            >
              <ChevronLeft size={18} />
            </button>
            <Field label="Início da semana (7 dias)">
              <input
                className="field"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <button
              className="btn-secondary !px-3"
              title="Próxima semana"
              onClick={() => setFrom(nextDate(from, 7))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <Field label="Filtrar por sala">
            <select
              className="field min-w-[200px]"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            >
              <option value="">Todas as salas</option>
              {data.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <button
            className="btn-quiet"
            onClick={() => {
              setFrom(localDate(new Date()));
              setRoomId("");
            }}
          >
            <Filter size={16} /> Limpar filtros
          </button>
        </div>
      </Card>
      <div className="flex items-center gap-3 mb-4">
        <button
          className="btn-secondary"
          disabled={!chosen.length || busy}
          onClick={() => void releaseMany()}
        >
          Liberar {chosen.length} data(s) selecionada(s)
        </button>
        <p className="text-xs text-slate-500">
          Selecione suas ocorrências na agenda para liberação em lote.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-7 gap-3">
        {dates.map((date) => {
          const all = items.filter((o) => o.startsAt.slice(0, 10) === date);
          return (
            <Card key={date} className="min-h-48 overflow-hidden">
              <div
                className={`px-3 py-3 border-b border-slate-100 ${date === localDate(new Date()) ? "bg-skybrand-50" : ""}`}
              >
                <p className="text-[11px] uppercase font-bold tracking-wide text-slate-500">
                  {new Date(`${date}T12:00`).toLocaleDateString("pt-BR", {
                    weekday: "short",
                  })}
                </p>
                <p className="font-bold text-lg">
                  {date.slice(8, 10)}
                  <span className="text-xs text-slate-400 font-medium">
                    /{date.slice(5, 7)}
                  </span>
                </p>
              </div>
              <div className="p-2 space-y-2">
                {all.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">
                    Livre
                  </p>
                ) : (
                  all.map((o) => (
                    <div
                      key={o.id}
                      className={`rounded-lg p-2 border ${o.kind === "Bloqueio" ? "bg-red-50 border-red-100" : "bg-sky-50 border-sky-100"}`}
                    >
                      <p className="text-[11px] font-bold text-slate-800">
                        {hour(o.startsAt.slice(11))}–{hour(o.endsAt.slice(11))}
                      </p>
                      <p className="text-xs font-semibold text-slate-700 mt-1 line-clamp-2">
                        {data.rooms.find((r) => r.id === o.roomId)?.name ||
                          `Sala ${o.roomId}`}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                        {o.description || o.kind}
                      </p>
                      {o.dayStatus && o.kind !== "Bloqueio" && (
                        <p className="text-[10px] text-slate-600 mt-1">
                          {o.dayStatus === "NaoLetivo"
                            ? "Não letivo"
                            : o.dayStatus}
                        </p>
                      )}
                      {o.isBorrowed && (
                        <span className="inline-block mt-1 text-[10px] text-skybrand-700 font-bold">
                          Emprestada
                        </span>
                      )}
                      {o.isBorrowed && (
                        <p className="text-[10px] text-slate-600">
                          {data.teachers.find(
                            (t) => t.id === o.originalTeacherId,
                          )?.displayName || "Titular"}{" "}
                          →{" "}
                          {data.teachers.find((t) => t.id === o.actualTeacherId)
                            ?.displayName || "Destinatário"}
                        </p>
                      )}
                      {(admin || o.originalTeacherId === user.id) &&
                        o.kind !== "Bloqueio" && (
                          <div className="mt-2 space-y-1">
                            <button
                              className="text-[11px] text-sky-700 font-bold underline"
                              onClick={() => setSelected(o)}
                            >
                              Gerenciar
                            </button>
                            <label className="flex gap-1.5 items-center text-[10px]">
                              <input
                                type="checkbox"
                                checked={chosen.includes(o.id)}
                                onChange={(e) =>
                                  setChosen((old) =>
                                    e.target.checked
                                      ? [...old, o.id]
                                      : old.filter((x) => x !== o.id),
                                  )
                                }
                              />
                              Liberar em lote
                            </label>
                          </div>
                        )}
                      {admin && o.kind === "Bloqueio" && (
                        <button
                          onClick={() => void unblock(o.id)}
                          className="text-[11px] text-red-700 font-semibold mt-2 hover:underline"
                        >
                          Remover bloqueio
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-slate-400 mt-4">
        {loading
          ? "Atualizando..."
          : `${items.length} ocupação(ões) neste período.`}{" "}
        A agenda exibe alocações confirmadas, publicadas, emprestadas e
        bloqueios.
      </p>
      {selected && (
        <Modal
          title={`Gerenciar alocação #${selected.id}`}
          onClose={() => setSelected(null)}
        >
          <OccupationManager
            key={selected.id}
            occ={selected}
            onSaved={async () => {
              await load();
              await reloadAgenda();
              setSelected(null);
            }}
          />
        </Modal>
      )}
      {modal && (
        <Modal title="Bloquear sala" onClose={() => setModal(false)}>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Sala">
              <select
                required
                className="field"
                value={blockRoom}
                onChange={(e) => setBlockRoom(e.target.value)}
              >
                {data.rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Data">
              <input
                type="date"
                className="field"
                required
                value={blockDate}
                onChange={(e) => setBlockDate(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Início">
                <input
                  type="time"
                  className="field"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </Field>
              <Field label="Fim">
                <input
                  type="time"
                  className="field"
                  required
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Motivo">
              <input
                required
                className="field"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <div className="flex justify-end">
              <SubmitButton busy={busy}>Registrar bloqueio</SubmitButton>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
