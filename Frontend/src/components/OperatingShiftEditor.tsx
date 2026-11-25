import { useEffect, useRef, useState } from "react";
import { put, read } from "../lib/api";
import { useData } from "../lib/data";
import { resultMessage } from "../lib/utils";
import { Busy, Checkbox, Field, Notice, SubmitButton, useConfirmation } from "./UI";

type OfferedShift = { shiftId: number; weekdaysMask: number };
const days = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function OperatingShiftEditor({ semesterId, roomId: initialRoom, onSaved }: {
  semesterId: number; roomId: string; onSaved: () => void;
}) {
  const { data } = useData();
  const [roomId, setRoomId] = useState(initialRoom);
  return <div className="space-y-4">
    <p>Semestre: <strong>{data.semesters.find((s) => s.id === semesterId)?.name}</strong></p>
    <Field label="Ambiente a configurar"><select className="field" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
      <option value="">Selecione</option>{data.rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
    </select></Field>
    {roomId && <OperatingShiftForm key={`${semesterId}|${roomId}`} semesterId={semesterId} roomId={Number(roomId)} onSaved={onSaved} />}
  </div>;
}

function OperatingShiftForm({ semesterId, roomId, onSaved }: { semesterId: number; roomId: number; onSaved: () => void }) {
  const { data } = useData();
  const confirm = useConfirmation();
  const [draft, setDraft] = useState<OfferedShift[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const mounted = useRef(false);
  const path = `/semesters/${semesterId}/rooms/${roomId}/operating-shifts`;
  useEffect(() => {
    mounted.current = true;
    let active = true;
    read<OfferedShift[]>(path).then((rows) => {
      if (!Array.isArray(rows) || rows.some((row) => !Number.isInteger(row.shiftId) || !Number.isInteger(row.weekdaysMask) || row.weekdaysMask < 1 || row.weekdaysMask > 127))
        throw new Error("A API retornou turnos oferecidos incompletos.");
      if (active) setDraft(rows);
    }).catch((cause) => { if (active) setError(resultMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; mounted.current = false; };
  }, [path]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const confirmed = await confirm({ title: "Salvar turnos oferecidos", confirmLabel: "Confirmar turnos",
        message: "A lista substituirá a configuração deste ambiente neste semestre. Turnos sem dias selecionados serão retirados da configuração. As reservas existentes serão preservadas." });
      if (!confirmed || !mounted.current) return;
      await put(path, draft.filter((row) => row.weekdaysMask > 0));
      onSaved();
      if (mounted.current) setSuccess("Turnos oferecidos salvos. Indicadores em atualização.");
    } catch (cause) { if (mounted.current) setError(resultMessage(cause)); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <form onSubmit={(e) => void save(e)} className="space-y-4">
    <p className="muted">Informe somente os dias e turnos efetivamente oferecidos. Esta configuração define a base do cálculo; não comprova que um horário está livre.</p>
    {loading && <Busy />}{error && <Notice message={error} />}{success && <Notice type="success" message={success} />}
    {draft && <fieldset disabled={busy} className="space-y-4">
      {data.shifts.map((shift) => <fieldset key={shift.id} className="rounded-lg border border-line p-3">
        <legend className="px-1 font-semibold">{shift.name} · {shift.startsAt.slice(0, 5)}–{shift.endsAt.slice(0, 5)}</legend>
        <div className="flex flex-wrap gap-3">{days.map((day, index) => {
          const mask = draft.find((row) => row.shiftId === shift.id)?.weekdaysMask ?? 0;
          return <Checkbox key={day} label={day} checked={(mask & (1 << index)) !== 0} onChange={() => {
            setSuccess("");
            setDraft([...draft.filter((row) => row.shiftId !== shift.id), { shiftId: shift.id, weekdaysMask: mask ^ (1 << index) }]);
          }} />;
        })}</div>
      </fieldset>)}
      {!data.shifts.length && <p>Nenhum turno cadastrado. Cadastre os turnos antes de configurar a oferta.</p>}
      {draft.every((row) => row.weekdaysMask === 0) && <Notice type="info" message="Sem turnos oferecidos, a capacidade e o percentual podem permanecer indeterminados. Nenhuma disponibilidade será presumida." />}
      <SubmitButton busy={busy}>Salvar turnos oferecidos</SubmitButton>
    </fieldset>}
  </form>;
}
