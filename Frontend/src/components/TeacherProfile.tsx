import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { post, put, read, remove } from "../lib/api";
import { resultMessage } from "../lib/utils";
import { Busy, Field, Modal, Notice, SubmitButton, useConfirmation } from "./UI";
import type { Course, CourseModule, CurricularUnit } from "../types";

type Profile = {
  teacherId: string; displayName: string; education: string; technicalSkills: string; professionalKnowledge: string;
  courses: { courseId: number; courseName: string }[];
  curricularUnits: { curricularUnitId: number; unitName: string; courseId: number; courseName: string }[];
  capabilities: { curricularCapabilityId: number; description: string; curricularUnitId: number }[];
};
const path = (id: string) => `/teachers/${encodeURIComponent(id)}/pedagogical-profile`;

function QualificationOption({ label, description, checked, disabled, onChange }: {
  label: string; description?: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void;
}) {
  return <label className={`flex min-h-14 items-start gap-3 rounded-xl border p-4 text-sm transition-colors ${checked ? "border-skybrand-500 bg-canvas" : "border-line bg-surface"} ${disabled ? "cursor-default" : "cursor-pointer hover:bg-canvas"}`}>
    <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 appearance-none rounded-md border border-line bg-surface checked:border-skybrand-600 checked:bg-skybrand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-skybrand-500 disabled:cursor-not-allowed" />
      {checked && <Check size={14} strokeWidth={3} aria-hidden="true" className="pointer-events-none absolute text-white" />}
    </span>
    <span className="min-w-0"><span className="block font-medium text-ink">{label}</span>
      {description && <span className="mt-1 block text-xs leading-relaxed text-muted-ink">{description}</span>}</span>
  </label>;
}

export function TeacherProfile({ teacherId, admin, onStateChange }: {
  teacherId: string; admin: boolean; onStateChange?: (state: { busy: boolean; dirty: boolean }) => void;
}) {
  const confirm = useConfirmation();
  const managerId = useId();
  const editButton = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [managing, setManaging] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState({ education: "", technicalSkills: "", professionalKnowledge: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [moduleId, setModuleId] = useState("");
  const [units, setUnits] = useState<CurricularUnit[]>([]);
  const courseQualified = profile?.courses.some((item) => item.courseId === Number(courseId)) ?? false;
  const hasQualifiedUnits = profile?.curricularUnits.some((item) => item.courseId === Number(courseId)) ?? false;
  const dirty = editing && profile !== null && (draft.education !== (profile.education ?? "") ||
    draft.technicalSkills !== (profile.technicalSkills ?? "") || draft.professionalKnowledge !== (profile.professionalKnowledge ?? ""));
  useEffect(() => { onStateChange?.({ busy, dirty }); }, [busy, dirty, onStateChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function finishEditing() {
    setEditing(false);
    requestAnimationFrame(() => editButton.current?.focus());
  }
  async function cancelEditing() {
    if (busy || !profile) return;
    if (dirty && !await confirm({ title: "Descartar alterações?", message: "As alterações das informações profissionais ainda não foram salvas.", confirmLabel: "Descartar alterações", danger: true })) return;
    setDraft({ education: profile.education ?? "", technicalSkills: profile.technicalSkills ?? "", professionalKnowledge: profile.professionalKnowledge ?? "" });
    setError(""); finishEditing();
  }
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
  useEffect(() => {
    if (!admin || !managing) return;
    let active = true;
    read<Course[]>("/courses").then((rows) => { if (active) setCourses(rows); })
      .catch((cause) => { if (active) setError(resultMessage(cause)); });
    return () => { active = false; };
  }, [admin, managing]);
  useEffect(() => {
    setModules([]); setModuleId(""); setUnits([]);
    if (!courseId) return;
    let active = true;
    read<CourseModule[]>(`/courses/${courseId}/modules`)
      .then((rows) => { if (active) setModules(rows); })
      .catch((cause) => { if (active) setError(resultMessage(cause)); });
    return () => { active = false; };
  }, [courseId]);
  useEffect(() => {
    setUnits([]);
    if (!courseId || !moduleId) return;
    let active = true;
    read<CurricularUnit[]>(`/courses/${courseId}/modules/${moduleId}/curricular-units`)
      .then((rows) => { if (active) setUnits(rows); })
      .catch((cause) => { if (active) setError(resultMessage(cause)); });
    return () => { active = false; };
  }, [courseId, moduleId]);
  async function changeQualification(kind: "course" | "unit", id: number, enabled: boolean) {
    if (!admin || !profile || busy || !courseId) return;
    setBusy(true); setError(""); setSuccess("");
    const base = `${path(teacherId)}/courses/${courseId}`;
    try {
      await (enabled ? post : remove)<unknown>(kind === "course" ? base : `${base}/curricular-units/${id}`);
      const updated = await read<Profile>(path(teacherId));
      setProfile(updated);
      setSuccess("Habilitações atualizadas.");
    } catch (cause) { setError(resultMessage(cause)); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!admin || busy || !profile) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await put(path(teacherId), draft);
      setProfile({ ...profile, ...draft });
      setSuccess("Perfil pedagógico atualizado.");
      finishEditing();
    } catch (cause) { setError(resultMessage(cause)); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">
    {loading && <Busy />}{!editing && !managing && error && <Notice message={error} />}{!editing && !managing && success && <Notice type="success" message={success} />}
    {profile && <>
      <section className="space-y-4" aria-label="Informações profissionais">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-ink">Informações profissionais</h3>
          {admin && !editing && <button ref={editButton} type="button" className="btn-secondary" disabled={busy} aria-haspopup="dialog"
            onClick={() => { setError(""); setSuccess(""); setEditing(true); }}>Editar informações</button>}
        </div>
      {editing && admin && <Modal title="Editar informações profissionais" width="max-w-xl" onClose={() => void cancelEditing()}>
        <p className="mb-4 text-sm text-muted-ink">{profile.displayName}</p>
        {error && <div className="mb-4"><Notice message={error} /></div>}
        <form onSubmit={(event) => void save(event)} className="space-y-4">
        <div className="grid gap-4">
          <Field label="Formação"><textarea className="field min-h-24" maxLength={2000} readOnly={!admin} disabled={busy}
            autoFocus
            value={draft.education} onChange={(event) => setDraft({ ...draft, education: event.target.value })} /></Field>
          <Field label="Habilidades técnicas"><textarea className="field min-h-24" maxLength={2000} readOnly={!admin} disabled={busy}
            value={draft.technicalSkills} onChange={(event) => setDraft({ ...draft, technicalSkills: event.target.value })} /></Field>
          <Field label="Conhecimentos profissionais"><textarea className="field min-h-24" maxLength={2000} readOnly={!admin} disabled={busy}
            value={draft.professionalKnowledge} onChange={(event) => setDraft({ ...draft, professionalKnowledge: event.target.value })} /></Field>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void cancelEditing()}>Cancelar</button>
          <SubmitButton busy={busy} disabled={!dirty}>Salvar alterações</SubmitButton>
        </div>
      </form></Modal>}
      <dl className="space-y-4 text-sm">
        {([['Formação', profile.education], ['Habilidades técnicas', profile.technicalSkills], ['Conhecimentos profissionais', profile.professionalKnowledge]] as const).map(([label, value]) =>
          <div key={label}><dt className="mb-1 font-medium text-muted-ink">{label}</dt>
            <dd className="whitespace-pre-wrap break-words text-ink">{value?.trim() || "Não informado."}</dd></div>)}
      </dl>
      </section>
      <section className="border-t border-line pt-5 space-y-3" aria-label="Habilitações">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-ink">Habilitações</h3>
          {admin && <button type="button" className="btn-secondary" disabled={busy} aria-haspopup="dialog"
            onClick={() => { setError(""); setSuccess(""); setManaging(true); }}>Gerenciar habilitações</button>}
        </div>
        {profile.courses.length ? <div className="space-y-2">{profile.courses.map((course) => {
          const qualified = profile.curricularUnits.filter((unit) => unit.courseId === course.courseId);
          return <details key={course.courseId} className="rounded-xl border border-line p-3 sm:p-4">
            <summary className="cursor-pointer rounded text-sm font-medium text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500">
              {course.courseName} <span className="font-normal text-muted-ink">· {qualified.length} {qualified.length === 1 ? "UC habilitada" : "UCs habilitadas"}</span>
            </summary>
            {qualified.length ? <ul className="mt-3 space-y-2 text-sm text-ink">{qualified.map((unit) => <li key={unit.curricularUnitId}>{unit.unitName}</li>)}</ul>
              : <p className="mt-3 text-sm text-muted-ink">Nenhuma UC habilitada neste curso.</p>}
          </details>;
        })}</div> : <p className="text-sm text-muted-ink">Nenhum curso habilitado.</p>}
        <details className="text-sm">
          <summary className="cursor-pointer rounded py-2 text-muted-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-skybrand-500">Capacidades vinculadas ({profile.capabilities.length})</summary>
          {profile.capabilities.length ? <ul className="mt-2 space-y-2 text-ink">{profile.capabilities.map((item) => <li key={item.curricularCapabilityId}>{item.description}</li>)}</ul>
            : <p className="text-muted-ink">Nenhuma capacidade registrada.</p>}
        </details>
        <p className="text-xs text-muted-ink">Habilitações indicam o que o instrutor pode ministrar; as turmas são atribuídas separadamente.</p>
      {admin && managing && <Modal title="Gerenciar habilitações" onClose={() => { if (!busy) { setManaging(false); setError(""); } }}>
      <section id={managerId} className="space-y-4" aria-label="Gerenciar habilitações">
        <div><p className="font-medium text-ink">{profile.displayName}</p>
          <p className="mt-1 text-sm text-muted-ink">Habilitações por curso e UC. Cada marcação é salva imediatamente.</p></div>
        {error && <Notice message={error} />}{success && <Notice type="success" message={success} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Curso para habilitação"><select className="field" value={courseId} disabled={busy} onChange={(event) => setCourseId(event.target.value)}>
            <option value="">Selecione um curso</option>{courses.map((course) =>
              <option key={course.id} value={course.id}>{course.code} · {course.name}</option>)}</select></Field>
          <Field label="Módulo para habilitação"><select className="field" value={moduleId} disabled={busy || !courseId}
            onChange={(event) => setModuleId(event.target.value)}><option value="">Selecione um módulo</option>
            {modules.map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}</select></Field>
        </div>
        {courseId && <QualificationOption label="Habilitado para o curso" checked={courseQualified}
          disabled={busy || (courseQualified && hasQualifiedUnits)}
          description={courseQualified && hasQualifiedUnits
            ? "Para remover esta habilitação, desmarque primeiro as UCs habilitadas deste curso."
            : "Pré-requisito para habilitar UCs deste curso. As UCs são selecionadas individualmente abaixo."}
          onChange={(enabled) => void changeQualification("course", Number(courseId), enabled)} />}
        {moduleId && <div className="space-y-3">
          <h3 className="text-sm font-semibold text-ink">UCs do módulo</h3>
          {!courseQualified && <p className="text-sm text-muted-ink">Habilite o instrutor para o curso para selecionar as UCs.</p>}
          {units.map((unit) => <QualificationOption key={unit.id} label={`${unit.code} · ${unit.name}`}
            disabled={busy || !courseQualified} checked={profile.curricularUnits.some((item) => item.curricularUnitId === unit.id)}
            onChange={(enabled) => void changeQualification("unit", unit.id, enabled)} />)}
        </div>}
        {moduleId && units.length === 0 && <p className="muted">Nenhuma UC cadastrada neste módulo.</p>}
        <div className="flex justify-end border-t border-line pt-4"><button type="button" className="btn-secondary" disabled={busy}
          onClick={() => { setManaging(false); setError(""); }}>Concluir</button></div>
      </section></Modal>}
      </section>
    </>}
  </div>;
}
