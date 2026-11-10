import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ChevronRight, Plus } from "lucide-react";
import { post, put, read } from "../lib/api";
import { useData } from "../lib/data";
import {
  canEditCatalog, catalogErrorMessage, catalogPath, formatHours, parseHours, parseOrder,
  shiftHours, workloadText,
} from "../lib/pedagogicalCatalog";
import { Badge, Busy, Card, Empty, Field, MetricCard, Modal, Notice, SectionHeading, SubmitButton, Title } from "../components/UI";
import { CapabilityRequirements } from "../components/CapabilityRequirements";
import type {
  Course, CourseModule, CurricularCapability, CurricularUnit, User, WorkloadSummary,
} from "../types";

type Level = "course" | "module" | "unit" | "capability";
type FormValues = {
  code: string;
  name: string;
  active: boolean;
  order: string;
  description: string;
  contents: string;
  requiredHours: string;
};
const blankForm: FormValues = {
  code: "", name: "", active: true, order: "", description: "", contents: "", requiredHours: "",
};
const levelNames: Record<Level, string> = {
  course: "curso", module: "módulo", unit: "unidade curricular", capability: "capacidade",
};

export function PedagogicalCatalog({ user }: { user: User }) {
  const admin = canEditCatalog(user.roles);
  const { data } = useData();
  const [courses, setCourses] = useState<Course[]>([]);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [units, setUnits] = useState<CurricularUnit[]>([]);
  const [capabilities, setCapabilities] = useState<CurricularCapability[]>([]);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [moduleId, setModuleId] = useState<number | null>(null);
  const [unitId, setUnitId] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [summary, setSummary] = useState<WorkloadSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [hoursPerShift, setHoursPerShift] = useState("");
  const [plannedHours, setPlannedHours] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormValues>(blankForm);
  const [busy, setBusy] = useState("");
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [requirementsCapability, setRequirementsCapability] = useState<CurricularCapability | null>(null);
  const [search, setSearch] = useState("");

  const level: Level = unitId !== null ? "capability" : moduleId !== null ? "unit" :
    courseId !== null ? "module" : "course";
  const course = courses.find((item) => item.id === courseId);
  const module = modules.find((item) => item.id === moduleId);
  const unit = units.find((item) => item.id === unitId);
  const unitPath = courseId !== null && moduleId !== null && unitId !== null
    ? catalogPath(courseId, moduleId, unitId) : "";

  useEffect(() => {
    const first = data.shifts.map((item) => ({ id: item.id, hours: shiftHours(item) }))
      .find((item) => item.hours !== null);
    if (first) {
      setShiftId((current) => current || String(first.id));
      setHoursPerShift((current) => current || first.hours || "");
    }
  }, [data.shifts]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError("");
    const load = async () => {
      try {
        if (level === "course") {
          const result = await read<Course[]>(catalogPath());
          if (current) setCourses(result);
        } else if (level === "module" && courseId !== null) {
          const result = await read<CourseModule[]>(catalogPath(courseId));
          if (current) setModules(result);
        } else if (level === "unit" && courseId !== null && moduleId !== null) {
          const result = await read<CurricularUnit[]>(catalogPath(courseId, moduleId));
          if (current) setUnits(result);
        } else if (unitPath) {
          const result = await read<CurricularCapability[]>(`${unitPath}/capabilities`);
          if (current) setCapabilities(result);
        }
      } catch (cause) {
        if (current) setLoadError(catalogErrorMessage(cause));
      } finally {
        if (current) setLoading(false);
      }
    };
    void load();
    return () => { current = false; };
  }, [level, courseId, moduleId, unitPath, revision]);

  useEffect(() => {
    setPlannedHours(unit?.plannedHours == null ? "" : String(unit.plannedHours));
  }, [unitId, unit?.plannedHours]);

  useEffect(() => {
    if (!unitPath) { setSummary(null); setSummaryLoading(false); return; }
    let duration: number | null;
    try {
      duration = parseHours(hoursPerShift, false, 24);
    } catch {
      setSummary(null);
      setSummaryLoading(false);
      setSummaryError("");
      return;
    }
    if (duration === null) return;
    let current = true;
    setSummaryLoading(true);
    setSummaryError("");
    read<WorkloadSummary>(`${unitPath}/workload-summary?hoursPerShift=${duration}`)
      .then((result) => { if (current) setSummary(result); })
      .catch((cause) => {
        if (current) { setSummary(null); setSummaryError(catalogErrorMessage(cause)); }
      })
      .finally(() => { if (current) setSummaryLoading(false); });
    return () => { current = false; };
  }, [unitPath, hoursPerShift, revision]);

  const closeForm = () => { setFormOpen(false); setEditId(null); setError(""); };
  const goCourses = () => {
    closeForm(); setSearch(""); setCourseId(null); setModuleId(null); setUnitId(null);
    setModules([]); setUnits([]); setCapabilities([]); setSummary(null);
  };
  const goModules = (id: number) => {
    closeForm(); setSearch(""); setCourseId(id); setModuleId(null); setUnitId(null);
    setModules([]); setUnits([]); setCapabilities([]); setSummary(null);
  };
  const goUnits = (id: number) => {
    closeForm(); setSearch(""); setModuleId(id); setUnitId(null);
    setUnits([]); setCapabilities([]); setSummary(null);
  };
  const goCapabilities = (id: number) => {
    closeForm(); setSearch(""); setUnitId(id); setCapabilities([]); setSummary(null);
  };
  const beginForm = (id: number | null = null, values: Partial<FormValues> = {}) => {
    setForm({ ...blankForm, ...values });
    setEditId(id); setFormOpen(true); setError(""); setSuccess("");
  };

  const saveEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!admin || submitting.current) return;
    submitting.current = true;
    setBusy("form"); setError(""); setSuccess("");
    try {
      let path: string;
      let payload: unknown;
      if (level === "course") {
        if (!form.code.trim() || !form.name.trim()) throw new Error("Informe código e nome do curso.");
        path = catalogPath();
        payload = { code: form.code.trim(), name: form.name.trim(), active: form.active };
      } else if (level === "module" && courseId !== null) {
        if (!form.name.trim()) throw new Error("Informe o nome do módulo.");
        path = catalogPath(courseId);
        payload = { name: form.name.trim(), order: parseOrder(form.order) };
      } else if (level === "unit" && courseId !== null && moduleId !== null) {
        if (!form.code.trim() || !form.name.trim()) throw new Error("Informe código e nome da UC.");
        path = catalogPath(courseId, moduleId);
        payload = { code: form.code.trim(), name: form.name.trim() };
      } else if (unitPath) {
        if (!form.description.trim() || !form.contents.trim())
          throw new Error("Informe descrição e conteúdos da capacidade.");
        path = `${unitPath}/capabilities`;
        payload = {
          description: form.description.trim(), contents: form.contents.trim(),
          requiredHours: parseHours(form.requiredHours), order: parseOrder(form.order),
        };
      } else return;
      if (editId === null) await post(path, payload);
      else await put(`${path}/${editId}`, payload);
      closeForm();
      setSuccess(editId === null ? "Cadastro realizado." : "Alterações salvas.");
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(catalogErrorMessage(cause));
    } finally {
      submitting.current = false;
      setBusy("");
    }
  };

  const saveWorkload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!admin || !unitPath || unitId === null || submitting.current) return;
    submitting.current = true;
    setBusy("workload"); setError(""); setSuccess("");
    try {
      const value = parseHours(plannedHours, true);
      await put(`${unitPath}/workload`, { plannedHours: value });
      setUnits((items) => items.map((item) =>
        item.id === unitId ? { ...item, plannedHours: value } : item));
      setSuccess("Carga horária atualizada.");
      setRevision((current) => current + 1);
    } catch (cause) {
      setError(catalogErrorMessage(cause));
    } finally {
      submitting.current = false;
      setBusy("");
    }
  };

  const count = level === "course" ? courses.length : level === "module" ? modules.length :
    level === "unit" ? units.length : capabilities.length;
  const query = search.trim().toLocaleLowerCase("pt-BR");
  const visibleCourses = courses.filter((item) => `${item.code} ${item.name}`.toLocaleLowerCase("pt-BR").includes(query));
  const visibleModules = modules.filter((item) => item.name.toLocaleLowerCase("pt-BR").includes(query));
  const visibleUnits = units.filter((item) => `${item.code} ${item.name}`.toLocaleLowerCase("pt-BR").includes(query));
  const visibleCapabilities = capabilities.filter((item) => `${item.description} ${item.contents}`.toLocaleLowerCase("pt-BR").includes(query));
  const visibleCount = level === "course" ? visibleCourses.length : level === "module" ? visibleModules.length :
    level === "unit" ? visibleUnits.length : visibleCapabilities.length;
  return (
    <>
      <Title title="Catálogo Pedagógico"
        subtitle="Navegue por Curso → Módulo → UC → Capacidade para consultar carga horária, conteúdos e requisitos técnicos."
        action={admin ? <button className="btn-primary" onClick={() => beginForm()} disabled={busy !== ""}>
          <Plus size={16} /> Novo {levelNames[level]}
        </button> : undefined} />

      <nav aria-label="Caminho no catálogo" className="card flex flex-wrap items-center gap-2 p-3 text-sm mb-5">
        <button type="button" className="text-sky-300 font-semibold hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 rounded" onClick={goCourses}
          disabled={busy !== ""}>Cursos</button>
        {courseId !== null && <><ChevronRight size={15} className="text-slate-400" />
          <button type="button" className="text-sky-300 font-semibold hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 rounded" onClick={() => goModules(courseId)}
            disabled={busy !== ""}>{course?.name || "Curso"}</button></>}
        {moduleId !== null && <><ChevronRight size={15} className="text-slate-400" />
          <button type="button" className="text-sky-300 font-semibold hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 rounded" onClick={() => goUnits(moduleId)}
            disabled={busy !== ""}>{module?.name || "Módulo"}</button></>}
        {unitId !== null && <><ChevronRight size={15} className="text-slate-400" />
          <span aria-current="page" className="font-semibold text-ink">{unit?.name || "Unidade curricular"}</span></>}
      </nav>

      {level !== "course" && <button className="btn-quiet mb-4" disabled={busy !== ""}
        onClick={() => level === "module" ? goCourses() :
          level === "unit" ? goModules(courseId!) : goUnits(moduleId!)}>
        <ArrowLeft size={16} /> Voltar
      </button>}
      {error && <div className="mb-4"><Notice message={error} onClose={() => setError("")} /></div>}
      {success && <div className="mb-4"><Notice type="success" message={success}
        onClose={() => setSuccess("")} /></div>}
      {loadError && <div className="mb-4"><Notice message={loadError} /></div>}

      {formOpen && admin && <Card className="p-5 mb-5">
        <SectionHeading title={`${editId === null ? "Cadastrar" : "Editar"} ${levelNames[level]}`} subtitle="Os dados permanecem vinculados ao nível pedagógico exibido no caminho acima." />
        <form onSubmit={(event) => void saveEntry(event)} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {(level === "course" || level === "unit") && <Field label="Código">
              <input className="field" required maxLength={30} value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value })} />
            </Field>}
            {level !== "capability" && <Field label="Nome">
              <input className="field" required maxLength={level === "module" ? 120 : 160}
                value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </Field>}
            {level === "course" && <Field label="Situação">
              <select className="field" value={form.active ? "active" : "inactive"}
                onChange={(event) => setForm({ ...form, active: event.target.value === "active" })}>
                <option value="active">Ativo</option><option value="inactive">Inativo</option>
              </select>
            </Field>}
            {(level === "module" || level === "capability") && <Field label="Ordem">
              <input className="field" type="number" required min="1" step="1" value={form.order}
                onChange={(event) => setForm({ ...form, order: event.target.value })} />
            </Field>}
            {level === "capability" && <>
              <Field label="Descrição">
                <input className="field" required maxLength={300} value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })} />
              </Field>
              <Field label="Carga horária necessária">
                <input className="field" required inputMode="decimal" placeholder="Ex.: 12,5"
                  value={form.requiredHours}
                  onChange={(event) => setForm({ ...form, requiredHours: event.target.value })} />
              </Field>
              <Field label="Conteúdos relacionados" className="md:col-span-2">
                <textarea className="field min-h-28" required maxLength={4000} value={form.contents}
                  onChange={(event) => setForm({ ...form, contents: event.target.value })} />
              </Field>
            </>}
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={closeForm} disabled={busy !== ""}>Cancelar</button>
            <SubmitButton busy={busy !== ""}>Salvar {levelNames[level]}</SubmitButton>
          </div>
        </form>
      </Card>}

      {level === "capability" && <Card className="p-5 mb-5">
        <SectionHeading title="Carga horária da UC" subtitle="Compare a carga prevista com a soma das capacidades e a duração do turno." />
        {admin && <form onSubmit={(event) => void saveWorkload(event)} className="flex flex-wrap items-end gap-3 mb-5">
          <Field label="CH prevista (horas; vazio = indefinida)" className="w-full sm:w-64">
            <input className="field" inputMode="decimal" placeholder="Ex.: 40,5"
              value={plannedHours} onChange={(event) => setPlannedHours(event.target.value)} />
          </Field>
          <SubmitButton busy={busy !== ""}>Salvar CH</SubmitButton>
        </form>}
        <div className="grid gap-3 sm:grid-cols-2 mb-4">
          {data.shifts.length > 0 && <Field label="Turno cadastrado">
            <select className="field" value={shiftId} onChange={(event) => {
              const chosen = data.shifts.find((item) => item.id === Number(event.target.value));
              setShiftId(event.target.value);
              setHoursPerShift(chosen ? shiftHours(chosen) || "" : "");
            }}>
              <option value="">Duração manual</option>
              {data.shifts.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
          </Field>}
          <Field label="Horas por turno para estimar encontros">
            <input className="field" inputMode="decimal" value={hoursPerShift}
              placeholder="Informe a duração" onChange={(event) => {
                setShiftId(""); setHoursPerShift(event.target.value);
              }} />
          </Field>
        </div>
        {!hoursPerShift && <Notice type="info" message="Informe as horas por turno para consultar o resumo." />}
        {hoursPerShift && (() => {
          try { parseHours(hoursPerShift, false, 24); return null; }
          catch { return <Notice message="Horas por turno devem ser positivas, ter até duas casas decimais e não exceder 24." />; }
        })()}
        {summaryError && <Notice message={summaryError} />}
        {summaryLoading && <Busy />}
        {!summaryLoading && summary && <div aria-label="Resumo da carga horária"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5 text-sm">
          <MetricCard label="CH prevista" value={summary.plannedHours === null ? "Indefinida" : `${formatHours(summary.plannedHours)} h`} tone="blue" />
          <MetricCard label="Soma das capacidades" value={`${formatHours(summary.capabilityHours)} h`} tone="violet" />
          <MetricCard label="Diferença" value={summary.status === "Undefined" ? "Indefinida" : summary.status === "MissingHours"
            ? `${formatHours(summary.missingHours)} h faltantes` : summary.status === "ExcessHours"
              ? `${formatHours(summary.excessHours)} h excedentes` : "0 h"} tone={summary.status === "Balanced" ? "emerald" : "amber"} />
          <MetricCard label="Situação" value={workloadText(summary)} tone={summary.status === "Balanced" ? "emerald" : "amber"} />
          <MetricCard label="Encontros estimados" value={summary.requiredMeetings === null ? "Indefinidos" : summary.requiredMeetings} tone="slate" />
        </div>}
      </Card>}

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-3">
          <h2 className="section-title">{level === "course" ? "Cursos" : level === "module" ? "Módulos" :
            level === "unit" ? "Unidades curriculares" : "Capacidades"}</h2>
          {!loading && !loadError && <span className="text-xs text-muted-ink">{query ? `${visibleCount} de ${count}` : count} registro(s)</span>}
        </div>
        {!loading && !loadError && count > 0 && <div className="px-4 py-3 border-b border-line"><Field label={`Buscar ${levelNames[level]}`}>
          <input type="search" className="field max-w-md" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filtrar registros deste nível" />
        </Field></div>}
        {loading ? <Busy /> : loadError ? <div className="p-5">
          <button className="btn-secondary" onClick={() => setRevision((value) => value + 1)}>Tentar novamente</button>
        </div> : count === 0 ? <Empty text={`Nenhum(a) ${levelNames[level]} cadastrado(a) neste contexto.`} /> : visibleCount === 0 ?
          <Empty title="Nenhum resultado para a busca" text="Tente outro termo neste nível do catálogo." /> : <div>
          {level === "course" && visibleCourses.map((item) => <div key={item.id}
            className="p-4 md:px-5 border-b border-line last:border-0 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0"><p className="font-semibold text-ink">{item.name}</p>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-ink">
                <span>{item.code}</span><Badge status={item.active ? "Ativa" : "Inativa"} />
              </div></div>
            <div className="flex flex-wrap gap-2">
              {admin && <button className="btn-secondary" onClick={() => beginForm(item.id,
                { code: item.code, name: item.name, active: item.active })}>Editar</button>}
              <button className="btn-primary" onClick={() => goModules(item.id)}>Ver módulos <ChevronRight size={16} /></button>
            </div>
          </div>)}
          {level === "module" && visibleModules.map((item) => <div key={item.id}
            className="p-4 md:px-5 border-b border-line last:border-0 flex flex-wrap items-center justify-between gap-3">
            <div><p className="font-semibold text-ink">{item.name}</p>
              <p className="text-xs text-muted-ink mt-1">Ordem {item.order}</p></div>
            <div className="flex flex-wrap gap-2">
              {admin && <button className="btn-secondary" onClick={() => beginForm(item.id,
                { name: item.name, order: String(item.order) })}>Editar</button>}
              <button className="btn-primary" onClick={() => goUnits(item.id)}>Ver UCs <ChevronRight size={16} /></button>
            </div>
          </div>)}
          {level === "unit" && visibleUnits.map((item) => <div key={item.id}
            className="p-4 md:px-5 border-b border-line last:border-0 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0"><p className="font-semibold text-ink">{item.name}</p>
              <p className="text-xs text-muted-ink mt-1">{item.code} · CH prevista: {item.plannedHours === null
                ? "indefinida" : `${formatHours(item.plannedHours)} h`}</p></div>
            <div className="flex flex-wrap gap-2">
              {admin && <button className="btn-secondary" onClick={() => beginForm(item.id,
                { code: item.code, name: item.name })}>Editar</button>}
              <button className="btn-primary" onClick={() => goCapabilities(item.id)}>Ver capacidades <ChevronRight size={16} /></button>
            </div>
          </div>)}
          {level === "capability" && visibleCapabilities.map((item) => <div key={item.id}
            className="p-4 md:px-5 border-b border-line last:border-0 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><p className="font-semibold text-ink">{item.description}</p>
              <p className="text-sm text-muted-ink whitespace-pre-wrap mt-1">{item.contents}</p>
              <p className="text-xs text-muted-ink mt-2">Ordem {item.order} · CH necessária {formatHours(item.requiredHours)} h</p></div>
            <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => setRequirementsCapability(item)}>Requisitos técnicos</button>
            {admin && <button className="btn-secondary" onClick={() => beginForm(item.id, {
              description: item.description, contents: item.contents,
              requiredHours: String(item.requiredHours), order: String(item.order),
            })}>Editar</button>}
            </div>
          </div>)}
        </div>}
      </Card>
      {requirementsCapability && unitPath && <Modal title={`Requisitos técnicos · ${requirementsCapability.description}`} onClose={() => setRequirementsCapability(null)} width="max-w-3xl">
        <CapabilityRequirements key={`${unitPath}|${requirementsCapability.id}`} path={`${unitPath}/capabilities/${requirementsCapability.id}`} admin={admin} />
      </Modal>}
    </>
  );
}
