import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { CalendarDays } from "lucide-react";
import { useData } from "../lib/data";
import { post, put, read } from "../lib/api";
import { dateBR, resultMessage } from "../lib/utils";
import { Card, Field, Notice, SubmitButton, useConfirmation } from "./UI";
import { SemesterCalendar, calendarKinds as kinds, type CalendarEvent as Event } from "./SemesterCalendar";


type CloseGuard = MutableRefObject<(() => Promise<boolean>) | null>;
export function AcademicCalendarEditor({ semesterId: fixedSemesterId, closeGuardRef }: { semesterId?: number; closeGuardRef?: CloseGuard } = {}) {
  const { data } = useData();
  const [semesterId, setSemesterId] = useState("");
  const semester = data.semesters.find((item) => item.id === (fixedSemesterId ?? Number(semesterId)));
  if (fixedSemesterId !== undefined) return semester ? <CalendarForm key={semester.id} semester={semester} closeGuardRef={closeGuardRef} /> : <Notice message="Semestre não encontrado." />;
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

function CalendarForm({ semester, closeGuardRef }: { semester: { id: number; startDate: string; endDate: string }; closeGuardRef?: CloseGuard }) {
  const confirm = useConfirmation();
  const empty = { startDate: semester.startDate, endDate: semester.startDate, kind: "Holiday", description: "" };
  const [draft, setDraft] = useState(empty);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const baseline = useRef(JSON.stringify(empty));
  const [editing, setEditing] = useState<number | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const path = `/semesters/${semester.id}/calendar`;
  const selectedEvents = events.filter((item) => selectedDates.some((date) => date >= item.startDate && date <= item.endDate));
  const canDiscard = async () => !busy && (JSON.stringify(draft) === baseline.current || await confirm({
    title: "Descartar alterações?", message: "As alterações não salvas serão perdidas.", confirmLabel: "Descartar", danger: true,
  }));
  useEffect(() => {
    if (!closeGuardRef) return;
    closeGuardRef.current = canDiscard;
    return () => { closeGuardRef.current = null; };
  }, [closeGuardRef, busy, formOpen, draft, confirm]);
  async function openForm(item?: Event) {
    if (!await canDiscard()) return;
    const next = item ? { startDate: item.startDate, endDate: item.endDate, kind: item.kind, description: item.description } : empty;
    setDraft(next); baseline.current = JSON.stringify(next); setEditing(item?.id ?? null); setSelectedDates([]); setFormOpen(true); setError(""); setSuccess("");
  }
  async function toggleDate(date: string) {
    if (busy) return;
    if (editing && !await canDiscard()) return;
    const current = editing ? [] : selectedDates;
    const next = current.includes(date) ? current.filter((item) => item !== date) : [...current, date].sort();
    if (editing) { setDraft(empty); baseline.current = JSON.stringify(empty); }
    setEditing(null); setSelectedDates(next); setFormOpen(!!next.length); setError(""); setSuccess("");
  }
  async function cancelForm() {
    if (!await canDiscard()) return;
    setFormOpen(false); setSelectedDates([]); setDraft(empty); baseline.current = JSON.stringify(empty); setEditing(null); setError("");
  }
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
        if (!selectedDates.length || selectedEvents.length) throw new Error("Selecione apenas datas sem ocorrência para cadastrar.");
        const created = await post<Event[]>(`${path}/events/batch`, { dates: selectedDates, kind: draft.kind, description: draft.description });
        setEvents((items) => [...items, ...created]);
      }
      setEditing(null); setSelectedDates([]); setDraft(empty); baseline.current = JSON.stringify(empty); setFormOpen(false); setSuccess("Calendário atualizado.");
    } catch (cause) { setError(resultMessage(cause)); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    {error && <Notice message={error} />}{success && <Notice type="success" message={success} />}
    {!ready && !error && <p role="status" className="muted">Carregando calendário…</p>}
    {ready && <>
      <SemesterCalendar start={semester.startDate} end={semester.endDate} selected={selectedDates} events={events} disabled={busy} onToggle={(date) => void toggleDate(date)} />
      {selectedDates.length > 0 && <div className="space-y-2" aria-live="polite"><p className="font-medium text-ink">{selectedDates.length} data(s) selecionada(s)</p><p className="text-sm text-muted-ink break-words">{selectedDates.map(dateBR).join(', ')}</p></div>}
      {selectedEvents.map((item) => <div key={item.id} className="rounded-lg border border-line bg-canvas p-3 space-y-2"><p className="text-sm text-muted-ink">{dateBR(item.startDate)} – {dateBR(item.endDate)}</p><dl className="text-sm space-y-2"><div><dt className="text-muted-ink">Tipo de ocorrência</dt><dd className="font-medium text-ink">{kinds[item.kind as keyof typeof kinds] ?? item.kind}</dd></div><div><dt className="text-muted-ink">Descrição</dt><dd className="text-ink">{item.description}</dd></div></dl><button type="button" className="btn-secondary" disabled={busy} onClick={() => void openForm(item)}>Editar ocorrência</button></div>)}
      {!!selectedEvents.length && <p className="text-sm text-muted-ink">Para cadastrar uma nova ocorrência, selecione somente datas sem ocorrência. Use Editar ocorrência para alterar um registro existente.</p>}
      {formOpen && (editing || !selectedEvents.length) && <form onSubmit={save}><fieldset disabled={busy} className="space-y-3 rounded-lg border border-line p-4">
        <legend className="font-semibold text-ink mb-3">{editing ? "Editar ocorrência" : "Ocorrência das datas selecionadas"}</legend>
        <div className="grid sm:grid-cols-2 gap-3">
          {editing && <><Field label="Início da ocorrência"><input className="field" type="date" required min={semester.startDate} max={semester.endDate} value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} /></Field>
          <Field label="Fim da ocorrência"><input className="field" type="date" required min={draft.startDate} max={semester.endDate} value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} /></Field></>}
          <Field label="Tipo de ocorrência"><select className="field" value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value })}>{Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
          <Field label="Descrição da ocorrência"><input className="field" required maxLength={250} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
        </div>
        <div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => void cancelForm()}>Cancelar</button><SubmitButton busy={busy}>Salvar ocorrência</SubmitButton></div>
      </fieldset></form>}
      <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer font-medium text-ink">Ocorrências cadastradas ({events.length})</summary>
      <ul className="mt-3 space-y-2">{[...events].sort((a, b) => a.startDate.localeCompare(b.startDate)).map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3">
        <span className="text-sm text-ink">{dateBR(item.startDate)} – {dateBR(item.endDate)} · {kinds[item.kind as keyof typeof kinds] ?? item.kind} · {item.description}</span>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => void openForm(item)}>Editar</button>
      </li>)}</ul>
      {!events.length && <p className="muted mt-3">Nenhuma ocorrência cadastrada.</p>}
      </details>
    </>}
  </div>;
}
