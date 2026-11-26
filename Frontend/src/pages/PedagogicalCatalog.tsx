import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Eye, Pencil, Plus, Power, Search } from "lucide-react";
import { post, put, read } from "../lib/api";
import { useData } from "../lib/data";
import {
  canEditCatalog, catalogErrorMessage, catalogPath, formatHours, parseHours, parseOrder,
  shiftHours, workloadText,
} from "../lib/pedagogicalCatalog";
import { Busy, Field, Modal, Notice, SubmitButton, useConfirmation } from "../components/UI";
import { PageHeading, Panel, SenaiScope, StatCard, Tabs } from "../components/senai/SenaiUI";
import { CapabilityRequirements } from "../components/CapabilityRequirements";
import { UnitResourceRequirements } from "../components/UnitResourceRequirements";
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
const newLabels: Record<Level, string> = {
  course: "Novo curso", module: "Novo módulo", unit: "Novo unidade curricular", capability: "Novo capacidade",
};
type CourseTab = "resumo" | "modulos" | "turmas";

function Status({ active }: { active: boolean }) {
  return <span className={`sg-status ${active ? "is-active" : ""}`}>{active ? "Ativo" : "Inativo"}</span>;
}

export function PedagogicalCatalog({ user }: { user: User }) {
  const admin = canEditCatalog(user.roles);
  const { data } = useData();
  const confirm = useConfirmation();
  const [courses, setCourses] = useState<Course[]>([]);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [units, setUnits] = useState<CurricularUnit[]>([]);
  const [capabilities, setCapabilities] = useState<CurricularCapability[]>([]);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [moduleId, setModuleId] = useState<number | null>(null);
  const [unitId, setUnitId] = useState<number | null>(null);
  const [showUnitResources, setShowUnitResources] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [summary, setSummary] = useState<WorkloadSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [hoursPerShift, setHoursPerShift] = useState("");
  const [plannedHours, setPlannedHours] = useState("");
  const [formLevel, setFormLevel] = useState<Level | null>(null);
  const [courseTab, setCourseTab] = useState<CourseTab>("modulos");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [moduleSearch, setModuleSearch] = useState("");
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

  const closeForm = () => { setFormLevel(null); setEditId(null); setError(""); };
  const goCourses = () => {
    closeForm(); setSearch(""); setModuleSearch(""); setCourseId(null); setModuleId(null); setUnitId(null);
    setModules([]); setUnits([]); setCapabilities([]); setSummary(null);
  };
  const goModules = (id: number) => {
    closeForm(); setSearch(""); setModuleSearch(""); setCourseTab("modulos");
    setCourseId(id); setModuleId(null); setUnitId(null);
    setModules([]); setUnits([]); setCapabilities([]); setSummary(null);
  };
  const collapseModule = () => {
    closeForm(); setSearch(""); setModuleId(null); setUnitId(null);
    setUnits([]); setCapabilities([]); setSummary(null);
  };
  const goUnits = (id: number) => {
    closeForm(); setSearch(""); setModuleId(id); setUnitId(null);
    setUnits([]); setCapabilities([]); setSummary(null);
  };
  const goCapabilities = (id: number) => {
    closeForm(); setSearch(""); setUnitId(id); setCapabilities([]); setSummary(null);
  };
  const beginForm = (target: Level, id: number | null = null, values: Partial<FormValues> = {}) => {
    setForm({ ...blankForm, ...values });
    setFormLevel(target); setEditId(id); setError(""); setSuccess("");
  };
  // Atualiza uma lista de nível superior ao exibido (ex.: editar o curso dentro dos detalhes).
  const reloadList = async (target: Level) => {
    if (target === "course") setCourses(await read<Course[]>(catalogPath()));
    else if (target === "module" && courseId !== null) setModules(await read<CourseModule[]>(catalogPath(courseId)));
    else if (target === "unit" && courseId !== null && moduleId !== null)
      setUnits(await read<CurricularUnit[]>(catalogPath(courseId, moduleId)));
  };

  const saveEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!admin || submitting.current || formLevel === null) return;
    submitting.current = true;
    setBusy("form"); setError(""); setSuccess("");
    try {
      let path: string;
      let payload: unknown;
      if (formLevel === "course") {
        if (!form.code.trim() || !form.name.trim()) throw new Error("Informe código e nome do curso.");
        path = catalogPath();
        payload = { code: form.code.trim(), name: form.name.trim(), active: form.active };
      } else if (formLevel === "module" && courseId !== null) {
        if (!form.name.trim()) throw new Error("Informe o nome do módulo.");
        path = catalogPath(courseId);
        payload = { name: form.name.trim(), order: parseOrder(form.order) };
      } else if (formLevel === "unit" && courseId !== null && moduleId !== null) {
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
      if (formLevel === level) setRevision((value) => value + 1);
      else await reloadList(formLevel);
    } catch (cause) {
      setError(catalogErrorMessage(cause));
    } finally {
      submitting.current = false;
      setBusy("");
    }
  };

  // Usa o mesmo contrato de edição do curso, alterando apenas a situação.
  const toggleCourse = async (item: Course) => {
    if (!admin || submitting.current) return;
    if (item.active && !await confirm({ title: "Desativar curso", confirmLabel: "Desativar",
      message: `Deseja desativar ${item.name}? O curso continuará disponível para consulta.` })) return;
    if (submitting.current) return;
    submitting.current = true;
    setBusy("status"); setError(""); setSuccess("");
    try {
      await put(`${catalogPath()}/${item.id}`, { code: item.code, name: item.name, active: !item.active });
      setSuccess(item.active ? "Curso desativado." : "Curso ativado.");
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

  const query = search.trim().toLocaleLowerCase("pt-BR");
  const matches = (text: string, term = query) => text.toLocaleLowerCase("pt-BR").includes(term);
  const visibleCourses = courses.filter((item) => matches(`${item.code} ${item.name}`) &&
    (statusFilter === "all" || item.active === (statusFilter === "active")));
  const visibleModules = modules.filter((item) => matches(item.name, moduleSearch.trim().toLocaleLowerCase("pt-BR")));
  const visibleUnits = units.filter((item) => matches(`${item.code} ${item.name}`));
  const visibleCapabilities = capabilities.filter((item) => matches(`${item.description} ${item.contents}`));
  const activeCourses = courses.filter((item) => item.active).length;
  const courseClasses = data.classes.filter((item) => item.courseId === courseId);
  const courseTitle = course?.name || "Curso";
  const locked = busy !== "";

  const newButton = (target: Level, className = "btn-primary") => admin &&
    <button type="button" className={className} onClick={() => beginForm(target)} disabled={locked}>
      <Plus size={16} aria-hidden="true" /> {newLabels[target]}
    </button>;
  const searchBox = (target: Level, value: string, onChange: (value: string) => void, placeholder: string) =>
    <div className="sg-search"><Field label={`Buscar ${levelNames[target]}`}>
      <input type="search" className="field" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </Field><Search size={16} aria-hidden="true" /></div>;
  const retry = <div className="sg-panel-body"><button type="button" className="btn-secondary" onClick={() => setRevision((value) => value + 1)}>Tentar novamente</button></div>;
  const noResults = <p className="sg-empty">Nenhum resultado para a busca. Tente outro termo neste nível do catálogo.</p>;
  const nothing = (target: Level) => <p className="sg-empty">Nenhum(a) {levelNames[target]} cadastrado(a) neste contexto.</p>;
  const notices = <>
    {error && formLevel === null && <Notice message={error} onClose={() => setError("")} />}
    {success && <Notice type="success" message={success} onClose={() => setSuccess("")} />}
    {loadError && <Notice message={loadError} />}
  </>;

  const courseList = <>
    <PageHeading eyebrow={admin ? "Cadastros / Cursos" : "Pedagógico / Catálogo"} title={admin ? "Cadastro de cursos" : "Catálogo Pedagógico"}
      subtitle="Cursos, módulos, unidades curriculares e capacidades." action={newButton("course") || undefined} />
    {notices}
    <section aria-label="Resumo dos cursos" className="sg-stats">
      <StatCard label="Cursos" value={loading || loadError ? "—" : courses.length} detail="cadastrados" />
      <StatCard tone="green" label="Ativos" value={loading || loadError ? "—" : activeCourses} detail="situação ativa" />
      <StatCard tone="gray" label="Inativos" value={loading || loadError ? "—" : courses.length - activeCourses} detail="situação inativa" />
    </section>
    <section className="card sg-panel" aria-label="Lista de cursos">
      <div className="sg-toolbar">
        {searchBox("course", search, setSearch, "Pesquisar código ou nome")}
        <Field label="Situação"><select className="field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
          <option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option>
        </select></Field>
        {!loading && !loadError && <span className="sg-count">{visibleCourses.length} de {courses.length} cursos</span>}
      </div>
      {loading ? <Busy /> : loadError ? retry : courses.length === 0 ? <div className="sg-panel-body">{nothing("course")}</div> :
        visibleCourses.length === 0 ? <div className="sg-panel-body">{noResults}</div> :
          <table className="sg-table sg-table-cards">
            <thead><tr><th scope="col">Código</th><th scope="col">Nome do curso</th><th scope="col">Situação</th><th scope="col" className="sg-col-actions">Ações</th></tr></thead>
            <tbody>{visibleCourses.map((item) => <tr key={item.id}>
              <td><span className="sg-code">{item.code}</span></td>
              <td><strong>{item.name}</strong></td>
              <td><Status active={item.active} /></td>
              <td><div className="sg-row-actions">
                <button type="button" className="sg-icon-button" title="Ver módulos" aria-label={`Ver módulos de ${item.name}`} onClick={() => goModules(item.id)}>
                  <Eye size={17} aria-hidden="true" /><span className="sr-only">Ver módulos</span></button>
                {admin && <button type="button" className="sg-icon-button" title="Editar" aria-label={`Editar ${item.name}`} disabled={locked}
                  onClick={() => beginForm("course", item.id, { code: item.code, name: item.name, active: item.active })}>
                  <Pencil size={16} aria-hidden="true" /></button>}
                {admin && <button type="button" className="sg-icon-button" title={item.active ? "Desativar" : "Ativar"} aria-label={`${item.active ? "Desativar" : "Ativar"} ${item.name}`} disabled={locked}
                  onClick={() => void toggleCourse(item)}><Power size={17} aria-hidden="true" /></button>}
              </div></td>
            </tr>)}</tbody>
          </table>}
    </section>
  </>;

  const moduleList = <Panel title="Módulos curriculares" subtitle="Unidades curriculares organizadas por sequência." action={newButton("module") || undefined}>
    {modules.length > 0 && searchBox("module", moduleSearch, setModuleSearch, "Filtrar módulos pelo nome")}
    {level === "module" && loading && modules.length === 0 ? <Busy /> : level === "module" && loadError ? retry :
      modules.length === 0 ? nothing("module") : visibleModules.length === 0 ? noResults :
        <div>{visibleModules.map((item) => {
          const open = item.id === moduleId;
          return <article key={item.id} className="sg-module">
            <div className="sg-module-head">
              <button type="button" className="sg-icon-button" aria-expanded={open} disabled={locked}
                title={open ? "Ocultar UCs" : "Ver UCs"} aria-label={`${open ? "Ocultar" : "Ver"} UCs de ${item.name}`}
                onClick={() => open ? collapseModule() : goUnits(item.id)}>
                {open ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
                <span className="sr-only">{open ? "Ocultar UCs" : "Ver UCs"}</span>
              </button>
              <span className="sg-code">Módulo {item.order}</span>
              <h3>{item.name}</h3>
              {admin && <button type="button" className="sg-icon-button" title="Editar módulo" aria-label={`Editar módulo ${item.name}`} disabled={locked}
                onClick={() => beginForm("module", item.id, { name: item.name, order: String(item.order) })}><Pencil size={16} aria-hidden="true" /></button>}
            </div>
            {open && <div className="sg-units">
              <div className="sg-units-head"><h4>Unidades curriculares</h4>{newButton("unit", "btn-secondary")}</div>
              {!loading && !loadError && units.length > 0 && searchBox("unit", search, setSearch, "Pesquisar código ou nome")}
              {loading ? <Busy /> : loadError ? retry : units.length === 0 ? nothing("unit") : visibleUnits.length === 0 ? noResults :
                <ul className="sg-unit-list">{visibleUnits.map((entry) => <li key={entry.id}>
                  <span className="sg-code">{entry.code}</span>
                  <strong>{entry.name}</strong>
                  <span className="sg-unit-hours">CH prevista: {entry.plannedHours === null ? "indefinida" : `${formatHours(entry.plannedHours)} h`}</span>
                  <div className="sg-row-actions">
                    <button type="button" className="sg-icon-button" title="Ver capacidades" aria-label={`Ver capacidades de ${entry.name}`} onClick={() => goCapabilities(entry.id)}>
                      <Eye size={17} aria-hidden="true" /><span className="sr-only">Ver capacidades</span></button>
                    {admin && <button type="button" className="sg-icon-button" title="Editar UC" aria-label={`Editar UC ${entry.name}`} disabled={locked}
                      onClick={() => beginForm("unit", entry.id, { code: entry.code, name: entry.name })}><Pencil size={16} aria-hidden="true" /></button>}
                  </div>
                </li>)}</ul>}
            </div>}
          </article>;
        })}</div>}
  </Panel>;

  const courseDetail = <>
    <button type="button" className="sg-back" disabled={locked} onClick={goCourses}><ArrowLeft size={17} aria-hidden="true" /> Voltar para cursos</button>
    <PageHeading eyebrow={admin ? "Cadastros / Cursos / Detalhes" : "Pedagógico / Catálogo / Detalhes"} title={courseTitle}
      action={admin && course ? <button type="button" className="btn-secondary" disabled={locked}
        onClick={() => beginForm("course", course.id, { code: course.code, name: course.name, active: course.active })}>
        <Pencil size={16} aria-hidden="true" /> Editar curso</button> : undefined} />
    {course && <div className="sg-meta"><span className="sg-code">{course.code}</span><Status active={course.active} /></div>}
    {notices}
    <Tabs label="Seções do curso" idPrefix="course-detail" active={courseTab} onChange={(next) => setCourseTab(next as CourseTab)}
      items={[{ id: "resumo", label: "Resumo" }, { id: "modulos", label: "Módulos e UCs" }, { id: "turmas", label: "Turmas vinculadas", count: courseClasses.length }]} />
    <div role="tabpanel" id={`course-detail-panel-${courseTab}`} aria-labelledby={`course-detail-tab-${courseTab}`} className="sg-stack">
      {courseTab === "modulos" && moduleList}
      {courseTab === "resumo" && <>
        <section aria-label="Resumo do curso" className="sg-stats">
          <StatCard label="Módulos" value={level === "module" && (loading || loadError) && modules.length === 0 ? "—" : modules.length} detail="neste curso" />
          <StatCard tone="amber" label="Turmas" value={courseClasses.length} detail="vinculadas ao curso" />
          <StatCard tone="green" label="Situação" value={course ? course.active ? "Ativo" : "Inativo" : "—"} detail="cadastro do curso" />
        </section>
        <Panel title="Informações gerais">
          <dl className="sg-facts">
            <div><dt>Código</dt><dd>{course?.code ?? "—"}</dd></div>
            <div><dt>Nome</dt><dd>{courseTitle}</dd></div>
          </dl>
        </Panel>
      </>}
      {courseTab === "turmas" && <section className="card sg-panel" aria-label="Turmas vinculadas ao curso">
        <div className="sg-panel-head"><div><h2>Turmas vinculadas</h2><p>Turmas de qualquer semestre que usam este curso.</p></div></div>
        {courseClasses.length === 0 ? <div className="sg-panel-body"><p className="sg-empty">Nenhuma turma usa este curso.</p></div> :
          <div className="sg-table-wrap" tabIndex={0} role="region" aria-label="Lista de turmas vinculadas">
            <table className="sg-table">
              <thead><tr>{["Turma", "Semestre", "Módulo", "Turno", "Alunos"].map((title) => <th scope="col" key={title}>{title}</th>)}</tr></thead>
              <tbody>{courseClasses.map((item) => <tr key={item.id}>
                <td><strong>{item.code || item.name}</strong>{item.code && <small>{item.name}</small>}</td>
                <td>{data.semesters.find((entry) => entry.id === item.semesterId)?.name ?? "Não informado"}</td>
                <td>{modules.find((entry) => entry.id === item.courseModuleId)?.name ?? "Não informado"}</td>
                <td>{data.shifts.find((entry) => entry.id === item.shiftId)?.name ?? "Não informado"}</td>
                <td>{item.students}</td>
              </tr>)}</tbody>
            </table>
          </div>}
      </section>}
    </div>
  </>;

  const unitDetail = <>
    <nav aria-label="Caminho no catálogo" className="sg-crumbs">
      <button type="button" className="sg-back" disabled={locked} onClick={() => goUnits(moduleId!)}><ArrowLeft size={17} aria-hidden="true" /> Voltar</button>
      <button type="button" className="sg-link" disabled={locked} onClick={() => goModules(courseId!)}>{courseTitle}</button>
      <ChevronRight size={14} aria-hidden="true" />
      <button type="button" className="sg-link" disabled={locked} onClick={() => goUnits(moduleId!)}>{module?.name || "Módulo"}</button>
      <ChevronRight size={14} aria-hidden="true" />
      <span aria-current="page">{unit?.name || "Unidade curricular"}</span>
    </nav>
    <PageHeading eyebrow={`${admin ? "Cadastros / Cursos" : "Pedagógico / Catálogo"}${course ? ` / ${course.code}` : ""} / UC`} title={unit?.name || "Unidade curricular"} subtitle={unit?.code}
      action={admin && unit ? <button type="button" className="btn-secondary" disabled={locked}
        onClick={() => beginForm("unit", unit.id, { code: unit.code, name: unit.name })}><Pencil size={16} aria-hidden="true" /> Editar UC</button> : undefined} />
    {notices}
    <Panel title="Carga horária da UC" subtitle="Compare a carga prevista com a soma das capacidades e a duração do turno.">
        {admin && <form onSubmit={(event) => void saveWorkload(event)} className="flex flex-wrap items-end gap-3 mb-4">
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
        {!summaryLoading && summary && <div aria-label="Resumo da carga horária" className="sg-stats sg-stats-5 sg-stats-compact">
          <StatCard label="CH prevista" value={summary.plannedHours === null ? "Indefinida" : `${formatHours(summary.plannedHours)} h`} />
          <StatCard label="Soma das capacidades" value={`${formatHours(summary.capabilityHours)} h`} />
          <StatCard tone={summary.status === "Balanced" ? "green" : "amber"} label="Diferença" value={summary.status === "Undefined" ? "Indefinida" : summary.status === "MissingHours"
            ? `${formatHours(summary.missingHours)} h faltantes` : summary.status === "ExcessHours"
              ? `${formatHours(summary.excessHours)} h excedentes` : "0 h"} />
          <StatCard tone={summary.status === "Balanced" ? "green" : "amber"} label="Situação" value={workloadText(summary)} />
          <StatCard tone="gray" label="Encontros estimados" value={summary.requiredMeetings === null ? "Indefinidos" : summary.requiredMeetings} />
        </div>}
    </Panel>
    <Panel title="Recursos técnicos" subtitle="Critérios compartilhados com o inventário dos ambientes."
      action={<button type="button" className="btn-secondary" onClick={() => setShowUnitResources(true)}>Recursos necessários da UC</button>}>
      <p className="sg-note">Estes recursos valem para toda a UC. Os requisitos específicos ficam em cada capacidade.</p>
    </Panel>
    <Panel title="Capacidades" action={newButton("capability") || undefined}>
      {!loading && !loadError && capabilities.length > 0 && searchBox("capability", search, setSearch, "Pesquisar descrição ou conteúdo")}
      {loading ? <Busy /> : loadError ? retry : capabilities.length === 0 ? nothing("capability") : visibleCapabilities.length === 0 ? noResults :
        <div>{visibleCapabilities.map((item) => <article key={item.id} className="sg-item flex-wrap">
          <div className="sg-item-text">
            <strong>{item.description}</strong>
            <small className="whitespace-pre-wrap">{item.contents}</small>
            <small>Ordem {item.order} · CH necessária {formatHours(item.requiredHours)} h</small>
          </div>
          <div className="sg-actions">
            <button type="button" className="btn-secondary" onClick={() => setRequirementsCapability(item)}>Requisitos técnicos</button>
            {admin && <button type="button" className="sg-icon-button" title="Editar capacidade" aria-label={`Editar capacidade ${item.description}`} disabled={locked}
              onClick={() => beginForm("capability", item.id, {
                description: item.description, contents: item.contents,
                requiredHours: String(item.requiredHours), order: String(item.order),
              })}><Pencil size={16} aria-hidden="true" /></button>}
          </div>
        </article>)}</div>}
    </Panel>
  </>;

  return <>
    <SenaiScope>
      {courseId === null ? courseList : level === "capability" ? unitDetail : courseDetail}
    </SenaiScope>
    <SenaiScope modals>
      {formLevel !== null && admin && <Modal title={editId === null ? newLabels[formLevel] : `Editar ${levelNames[formLevel]}`} onClose={() => { if (!locked) closeForm(); }}>
        {error && <div className="mb-4"><Notice message={error} onClose={() => setError("")} /></div>}
        <form onSubmit={(event) => void saveEntry(event)} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {(formLevel === "course" || formLevel === "unit") && <Field label="Código">
              <input className="field" required maxLength={30} value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value })} />
            </Field>}
            {formLevel !== "capability" && <Field label="Nome">
              <input className="field" required maxLength={formLevel === "module" ? 120 : 160}
                value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </Field>}
            {formLevel === "course" && <Field label="Situação">
              <select className="field" value={form.active ? "active" : "inactive"}
                onChange={(event) => setForm({ ...form, active: event.target.value === "active" })}>
                <option value="active">Ativo</option><option value="inactive">Inativo</option>
              </select>
            </Field>}
            {(formLevel === "module" || formLevel === "capability") && <Field label="Ordem">
              <input className="field" type="number" required min="1" step="1" value={form.order}
                onChange={(event) => setForm({ ...form, order: event.target.value })} />
            </Field>}
            {formLevel === "capability" && <>
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
            <SubmitButton busy={busy !== ""}>Salvar {levelNames[formLevel]}</SubmitButton>
          </div>
        </form>
      </Modal>}
      {requirementsCapability && unitPath && <Modal title={`Requisitos técnicos · ${requirementsCapability.description}`} onClose={() => setRequirementsCapability(null)} width="max-w-3xl">
        <CapabilityRequirements key={`${unitPath}|${requirementsCapability.id}`} path={`${unitPath}/capabilities/${requirementsCapability.id}`} admin={admin} />
      </Modal>}
      {showUnitResources && unitPath && <Modal title={`Recursos da UC · ${unit?.name ?? ""}`} onClose={() => setShowUnitResources(false)} width="max-w-3xl">
        <UnitResourceRequirements key={unitPath} path={unitPath} admin={admin} />
      </Modal>}
    </SenaiScope>
  </>;
}
