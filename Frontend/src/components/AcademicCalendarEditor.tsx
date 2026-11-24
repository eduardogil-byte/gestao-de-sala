import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useData } from "../lib/data";
import { post, put, read } from "../lib/api";
import { dateBR, resultMessage } from "../lib/utils";
import { Card, Field, Notice, SubmitButton } from "./UI";

type Event = { id: number; startDate: string; endDate: string; kind: string; description: string };
const kinds = { Holiday: "Feriado", Recess: "Recesso", Planning: "Planejamento", NonTeaching: "Não letivo" };

export function AcademicCalendarEditor() {
  const { data } = useData();
  const [semesterId, setSemesterId] = useState("");
  const semester = data.semesters.find((item) => item.id === Number(semesterId));
  return <Card className="p-5 mb-6"><details>
    <summary className="cursor-pointer font-semibold text-ink"><CalendarDays aria-hidden="true" size={19} className="inline mr-2" />Calendário letivo</summary>
    <div className="mt-4 space-y-4">
      <Field label="Semestre do calendário"><select className="field" value={semesterId} onChange={(event) => setSemesterId(event.target.value)}>
        <option value="">Selecione</option>{data.semesters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></Field>
      {semester && <CalendarForm key={semester.id} semester={semester} />}
    </div>
  </details></Card>;
}

function CalendarForm({ semester }: { semester: { id: number; startDate: string; endDate: string } }) {
  const empty = { startDate: semester.startDate, endDate: semester.startDate, kind: "Holiday", description: "" };
  const [draft, setDraft] = useState(empty);
  const [editing, setEditing] = useState<number | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const path = `/semesters/${semester.id}/calendar`;
  useEffect(() => {
    let active = true;
    read<{ events: Event[] }>(path).then((value) => { if (active) { setEvents(value.events); setReady(true); } })
      .catch((cause) => { if (active) setError(resultMessage(cause)); });
    return () => { active = false; };
  }, [path]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try {
      if (editing) {
        await put(`${path}/events/${editing}`, draft);
        setEvents((items) => items.map((item) => item.id === editing ? { ...draft, id: editing } : item));
      } else {
        const created = await post<Event>(`${path}/events`, draft);
        setEvents((items) => [...items, created]);
      }
      setEditing(null); setDraft(empty); setSuccess("Calendário atualizado.");
    } catch (cause) { setError(resultMessage(cause)); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    {error && <Notice message={error} />}{success && <Notice type="success" message={success} />}
    {!ready && !error && <p role="status" className="muted">Carregando calendário…</p>}
    {ready && <>
      <ul className="space-y-2">{[...events].sort((a, b) => a.startDate.localeCompare(b.startDate)).map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3">
        <span className="text-sm text-ink">{dateBR(item.startDate)} – {dateBR(item.endDate)} · {kinds[item.kind as keyof typeof kinds] ?? item.kind} · {item.description}</span>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => { setEditing(item.id); setDraft({ startDate: item.startDate, endDate: item.endDate, kind: item.kind, description: item.description }); setSuccess(""); }}>Editar</button>
      </li>)}</ul>
      {!events.length && <p className="muted">Nenhuma ocorrência cadastrada.</p>}
      <form onSubmit={save}><fieldset disabled={busy} className="space-y-3">
        <legend className="font-semibold text-ink mb-3">{editing ? "Editar ocorrência" : "Nova ocorrência"}</legend>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Início da ocorrência"><input className="field" type="date" required min={semester.startDate} max={semester.endDate} value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} /></Field>
          <Field label="Fim da ocorrência"><input className="field" type="date" required min={draft.startDate} max={semester.endDate} value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} /></Field>
          <Field label="Tipo de ocorrência"><select className="field" value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value })}>{Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
          <Field label="Descrição da ocorrência"><input className="field" required maxLength={250} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
        </div>
        <div className="flex gap-2"><SubmitButton busy={busy}>Salvar ocorrência</SubmitButton>{editing && <button type="button" className="btn-secondary" onClick={() => { setEditing(null); setDraft(empty); }}>Cancelar edição</button>}</div>
      </fieldset></form>
    </>}
  </div>;
}
