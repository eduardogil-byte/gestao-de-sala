import { useEffect, useState, type FormEvent } from "react";
import { put, read } from "../lib/api";
import { resultMessage } from "../lib/utils";
import { Busy, Card, Field, Notice, SectionHeading, SubmitButton } from "./UI";

type Profile = {
  teacherId: string; displayName: string; education: string; technicalSkills: string; professionalKnowledge: string;
  courses: { courseId: number; courseName: string }[];
  curricularUnits: { curricularUnitId: number; unitName: string; courseId: number; courseName: string }[];
  capabilities: { curricularCapabilityId: number; description: string; curricularUnitId: number }[];
};
const path = (id: string) => `/teachers/${encodeURIComponent(id)}/pedagogical-profile`;

export function TeacherProfile({ teacherId, admin }: { teacherId: string; admin: boolean }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState({ education: "", technicalSkills: "", professionalKnowledge: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    let current = true;
    setLoading(true); setProfile(null); setError(""); setSuccess("");
    read<Profile>(path(teacherId)).then((value) => {
      if (!value || value.teacherId !== teacherId || !Array.isArray(value.courses) ||
        !Array.isArray(value.curricularUnits) || !Array.isArray(value.capabilities))
        throw new Error("A API retornou um perfil pedagógico incompleto.");
      if (current) {
        setProfile(value);
        setDraft({ education: value.education ?? "", technicalSkills: value.technicalSkills ?? "",
          professionalKnowledge: value.professionalKnowledge ?? "" });
      }
    }).catch((cause) => { if (current) setError(resultMessage(cause)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [teacherId]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!admin || busy || !profile) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await put(path(teacherId), draft);
      setProfile({ ...profile, ...draft });
      setSuccess("Perfil pedagógico atualizado.");
    } catch (cause) { setError(resultMessage(cause)); }
    finally { setBusy(false); }
  }
  return <Card className="p-4 sm:p-5 space-y-4">
    <SectionHeading title="Perfil pedagógico" subtitle="Formação, habilidades, conhecimentos e habilitações registrados para o docente selecionado." />
    {loading && <Busy />}{error && <Notice message={error} />}{success && <Notice type="success" message={success} />}
    {profile && <>
      <form onSubmit={(event) => void save(event)} className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Formação"><textarea className="field min-h-24" maxLength={2000} readOnly={!admin} disabled={busy}
            value={draft.education} onChange={(event) => setDraft({ ...draft, education: event.target.value })} /></Field>
          <Field label="Habilidades técnicas"><textarea className="field min-h-24" maxLength={2000} readOnly={!admin} disabled={busy}
            value={draft.technicalSkills} onChange={(event) => setDraft({ ...draft, technicalSkills: event.target.value })} /></Field>
          <Field label="Conhecimentos profissionais"><textarea className="field min-h-24" maxLength={2000} readOnly={!admin} disabled={busy}
            value={draft.professionalKnowledge} onChange={(event) => setDraft({ ...draft, professionalKnowledge: event.target.value })} /></Field>
        </div>
        {admin && <SubmitButton busy={busy}>Salvar perfil</SubmitButton>}
      </form>
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-line p-4"><h3 className="font-semibold text-ink">Cursos habilitados</h3>
          {profile.courses.length ? <ul className="mt-3 space-y-2 text-sm">{profile.courses.map((item) =>
            <li key={item.courseId}>{item.courseName}</li>)}</ul> : <p className="muted mt-2">Nenhum curso registrado.</p>}</div>
        <div className="rounded-xl border border-line p-4"><h3 className="font-semibold text-ink">UCs habilitadas</h3>
          {profile.curricularUnits.length ? <ul className="mt-3 space-y-2 text-sm">{profile.curricularUnits.map((item) =>
            <li key={item.curricularUnitId}>{item.unitName}<span className="block text-xs text-muted-ink">{item.courseName}</span></li>)}</ul>
            : <p className="muted mt-2">Nenhuma UC registrada.</p>}</div>
        <div className="rounded-xl border border-line p-4"><h3 className="font-semibold text-ink">Capacidades vinculadas</h3>
          {profile.capabilities.length ? <ul className="mt-3 space-y-2 text-sm">{profile.capabilities.map((item) =>
            <li key={item.curricularCapabilityId}>{item.description}</li>)}</ul> : <p className="muted mt-2">Nenhuma capacidade registrada.</p>}</div>
      </div>
      <p className="muted">Habilitação pedagógica não é atribuição de turma nem disponibilidade confirmada.</p>
    </>}
  </Card>;
}
