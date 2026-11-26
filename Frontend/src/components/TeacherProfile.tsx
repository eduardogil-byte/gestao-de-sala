import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { post, put, read, remove } from "../lib/api";
import { resultMessage } from "../lib/utils";
import { Busy, Field, Notice, SubmitButton } from "./UI";
import { Panel, StatCard, Tabs } from "./senai/SenaiUI";
import type { Course, CourseModule, CurricularUnit } from "../types";

type Profile = {
  teacherId: string; displayName: string; education: string; technicalSkills: string; professionalKnowledge: string;
  courses: { courseId: number; courseName: string }[];
  curricularUnits: { curricularUnitId: number; unitName: string; courseId: number; courseName: string }[];
  capabilities: { curricularCapabilityId: number; description: string; curricularUnitId: number }[];
};
const path = (id: string) => `/teachers/${encodeURIComponent(id)}/pedagogical-profile`;

export type TeacherTab = "resumo" | "habilitacoes" | "disponibilidade" | "turmas";
type Section = { count?: number; content: ReactNode };

export function TeacherProfile({ teacherId, admin, tab, onTab, information, availability, assignments }: {
  teacherId: string; admin: boolean; tab: TeacherTab; onTab: (tab: TeacherTab) => void;
  information: [string, string][]; availability: Section; assignments: Section & { active: number };
}) {
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
    if (!admin) return;
    let active = true;
    read<Course[]>("/courses").then((rows) => { if (active) setCourses(rows); })
      .catch((cause) => { if (active) setError(resultMessage(cause)); });
    return () => { active = false; };
  }, [admin]);
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
    if (!profile || busy || !courseId) return;
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
    } catch (cause) { setError(resultMessage(cause)); }
    finally { setBusy(false); }
  }
  const count = (value: number | undefined) => value === undefined ? "—" : value;
  // Os painéis permanecem montados para não descartar textos e seleções ao trocar de aba.
  const panel = (id: TeacherTab, content: ReactNode) =>
    <div role="tabpanel" id={`teacher-detail-panel-${id}`} aria-labelledby={`teacher-detail-tab-${id}`} hidden={tab !== id} className="sg-stack">{content}</div>;
  const pending = loading ? <Busy /> : <p className="sg-empty">Perfil pedagógico indisponível.</p>;
  const qualification = (title: string, items: { key: number; name: string; note?: string }[], empty: string) =>
    <div className="sg-list-box"><h3>{title}<span>{items.length}</span></h3>
      {items.length ? <ul>{items.map((item) => <li key={item.key}>{item.name}{item.note && <small>{item.note}</small>}</li>)}</ul> : <p className="sg-note">{empty}</p>}</div>;
  return <div className="sg-stack">
    {error && <Notice message={error} />}{success && <Notice type="success" message={success} />}
    <Tabs label="Seções do instrutor" idPrefix="teacher-detail" active={tab} onChange={(next) => onTab(next as TeacherTab)} items={[
      { id: "resumo", label: "Resumo" },
      { id: "habilitacoes", label: "Habilitações", count: profile ? profile.courses.length + profile.curricularUnits.length + profile.capabilities.length : undefined },
      { id: "disponibilidade", label: "Disponibilidade", count: availability.count },
      { id: "turmas", label: "Turmas atribuídas", count: assignments.count },
    ]} />
    {panel("resumo", <>
      <div className="sg-stats sg-stats-4 sg-stats-compact">
        <StatCard label="Cursos" value={count(profile?.courses.length)} detail="habilitados" />
        <StatCard tone="green" label="UCs" value={count(profile?.curricularUnits.length)} detail="habilitadas" />
        <StatCard label="Disponibilidade" value={count(availability.count)} detail="blocos semanais" />
        <StatCard tone="amber" label="Atribuições" value={assignments.active} detail="ativas" />
      </div>
      <Panel title="Informações gerais">
        <dl className="sg-facts">{information.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="break-all">{value}</dd></div>)}</dl>
      </Panel>
      <Panel title="Perfil pedagógico" subtitle="Formação, habilidades e conhecimentos registrados para o docente selecionado.">
        {!profile ? pending : <>
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
        </>}
      </Panel>
    </>)}
    {panel("habilitacoes", !profile ? pending : <>
      <Panel title="Habilitações" subtitle="Habilitação pedagógica não é atribuição de turma nem disponibilidade confirmada.">
        <div className="sg-list-grid">
          {qualification("Cursos habilitados", profile.courses.map((item) => ({ key: item.courseId, name: item.courseName })), "Nenhum curso registrado.")}
          {qualification("UCs habilitadas", profile.curricularUnits.map((item) => ({ key: item.curricularUnitId, name: item.unitName, note: item.courseName })), "Nenhuma UC registrada.")}
          {qualification("Capacidades vinculadas", profile.capabilities.map((item) => ({ key: item.curricularCapabilityId, name: item.description })), "Nenhuma capacidade registrada.")}
        </div>
      </Panel>
      {admin && <section className="card sg-panel" aria-label="Gerenciar habilitações">
        <div className="sg-panel-head"><div><h2>Habilitações por curso e UC</h2><p>As alterações são salvas ao marcar ou desmarcar.</p></div></div>
        <div className="sg-panel-body space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Curso para habilitação"><select className="field" value={courseId} onChange={(event) => setCourseId(event.target.value)}>
            <option value="">Selecione um curso</option>{courses.map((course) =>
              <option key={course.id} value={course.id}>{course.code} · {course.name}</option>)}</select></Field>
          <Field label="Módulo para habilitação"><select className="field" value={moduleId} disabled={!courseId}
            onChange={(event) => setModuleId(event.target.value)}><option value="">Selecione um módulo</option>
            {modules.map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}</select></Field>
        </div>
        {courseId && <label className="sg-check"><input type="checkbox" disabled={busy ||
          (profile.courses.some((item) => item.courseId === Number(courseId)) &&
            profile.curricularUnits.some((item) => item.courseId === Number(courseId)))}
          checked={profile.courses.some((item) => item.courseId === Number(courseId))}
          onChange={(event) => void changeQualification("course", Number(courseId), event.target.checked)} />
          Habilitado para o curso</label>}
        {moduleId && <div className="space-y-2">{units.map((unit) => <label key={unit.id} className="sg-check">
          <input type="checkbox" disabled={busy || !profile.courses.some((item) => item.courseId === Number(courseId))}
            checked={profile.curricularUnits.some((item) => item.curricularUnitId === unit.id)}
            onChange={(event) => void changeQualification("unit", unit.id, event.target.checked)} />
          {unit.code} · {unit.name}</label>)}</div>}
        {moduleId && units.length === 0 && <p className="muted">Nenhuma UC cadastrada neste módulo.</p>}
        </div>
      </section>}
    </>)}
    {panel("disponibilidade", availability.content)}
    {panel("turmas", assignments.content)}
  </div>;
}
