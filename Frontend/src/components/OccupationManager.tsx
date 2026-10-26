import { useEffect, useState } from "react";
import { put, post, read } from "../lib/api";
import { resultMessage } from "../lib/utils";
import { Checkbox, Field, Notice } from "./UI";
import type { Occupation, RoomOption } from "../types";

export function OccupationManager({
  occ,
  onSaved,
}: {
  occ: Occupation;
  onSaved: () => Promise<void>;
}) {
  const [status, setStatus] = useState(occ.dayStatus || "Letivo");
  const [options, setOptions] = useState<RoomOption[]>([]),
    [room, setRoom] = useState(""),
    [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  useEffect(() => {
    setStatus(occ.dayStatus || "Letivo");
    read<RoomOption[]>(`/occupations/${occ.id}/room-options`)
      .then(setOptions)
      .catch((e) => setError(resultMessage(e)));
  }, [occ.id, occ.dayStatus]);
  async function run(operation: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    try {
      await operation();
      await onSaved();
      setSuccess(message);
    } catch (e) {
      setError(resultMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      {error && <Notice message={error} />}{" "}
      {success && <Notice type="success" message={success} />}
      <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
        <Field label="Situação deste dia">
          <select
            className="field"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="Letivo">Letivo</option>
            <option value="Ead">EAD</option>
            <option value="NaoLetivo">Não letivo / recesso</option>
          </select>
        </Field>
        <button
          className="btn-secondary"
          disabled={busy || status === occ.dayStatus}
          onClick={() =>
            void run(
              () => put(`/occupations/${occ.id}/day-status`, { status }),
              "Situação letiva atualizada. A reserva da sala permanece ativa.",
            )
          }
        >
          Salvar situação
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Alterar para EAD ou não letivo não libera automaticamente a sala. Use
        “Liberar esta data” se quiser devolvê-la.
      </p>
      <div className="border-t pt-4 space-y-3">
        <h3 className="text-sm font-bold">Transferir para outra sala</h3>
        <Field label="Salas sugeridas">
          <select
            className="field"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
          >
            <option value="">Selecione uma sala</option>
            {options
              .filter((r) => r.id !== occ.roomId)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.seats} alunos · {r.computers} PCs ·{" "}
                  {r.compatible ? "compatível" : "incompatível"} ·{" "}
                  {r.available ? "livre" : "ocupada"}
                </option>
              ))}
          </select>
        </Field>
        {room && (
          <p className="text-xs text-slate-600">
            {options.find((r) => r.id === Number(room))?.incompatibility ||
              options.find((r) => r.id === Number(room))?.purpose ||
              "O backend valida disponibilidade e compatibilidade no salvamento."}
          </p>
        )}
        <Checkbox
          label="Notificar professores afetados"
          checked={notify}
          onChange={setNotify}
        />
        <button
          className="btn-secondary"
          disabled={
            busy ||
            !room ||
            !options.find((r) => r.id === Number(room))?.compatible ||
            !options.find((r) => r.id === Number(room))?.available
          }
          onClick={() => {
            if (window.confirm("Confirmar a transferência desta ocorrência?"))
              void run(
                () =>
                  put(`/occupations/${occ.id}/room`, {
                    roomId: Number(room),
                    notifyTeachers: notify,
                  }),
                "Sala alterada.",
              );
          }}
        >
          Confirmar transferência
        </button>
      </div>
      <div className="border-t pt-4">
        <button
          className="btn-secondary text-red-700"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                "Liberar esta data? A operação libera a sala somente nesta ocorrência.",
              )
            )
              void run(
                () => post(`/occupations/${occ.id}/release`, { confirm: true }),
                "Data liberada.",
              );
          }}
        >
          Liberar esta data
        </button>
      </div>
    </div>
  );
}
