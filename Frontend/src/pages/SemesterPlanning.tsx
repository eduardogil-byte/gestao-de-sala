import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown, History as HistoryIcon, ListChecks, Settings2, X } from "lucide-react";
import { post, put, read } from "../lib/api";
import { useData } from "../lib/data";
import { dateBR, localDate, resultMessage } from "../lib/utils";
import { preparationIssues, useClassUnits, useGrade, useSemesterAgenda, type PlanningTab, type PlanningTarget } from "../components/planning/data";
import { GradeTab } from "../components/planning/GradeTab";
import { OverviewTab } from "../components/planning/OverviewTab";
import { PreparationTab } from "../components/planning/PreparationTab";
import { ReservationsTab } from "../components/planning/ReservationsTab";
import type { Semester, User } from "../types";
import { Schedules } from "./Schedules";
import "../components/planning/origin.css";
import "../components/planning/planning.css";

type Proposal = {
  id: number; assignmentId: number; teacherId: string; classGroupId: number;
  curricularUnitId: number | null; curricularCapabilityId: number | null;
  roomId: number; roomName: string; shiftId: number; shiftName: string;
  startDate: string; endDate: string; status: string; rejectionReason: string | null;
};
type Plan = { id: number; semesterId: number; published: boolean; revision: number;
  publishedAtUtc: string | null; proposals: Proposal[] };
type Check = { proposalId: number; startsAt: string; endsAt: string;
  existingOccupationId: number | null; blocks: string[]; warnings: string[] };
type Preview = { allowed: boolean; revision: number; proposalCount: number; approved: number;
  toCreate: number; existing: number; blocks: string[]; warnings: string[]; checks: Check[]; signature: string };
type History = { id: number; action: string; actorId: string; createdAtUtc: string;
  actorName: string; reason: string | null; entityType: string; entityId: string; afterJson: string | null };
const statusLabel: Record<string, string> = {
  Rascunho: "Rascunho", Enviada: "Enviada para análise", Aprovada: "Aprovada",
  Rejeitada: "Rejeitada", Publicada: "Publicada",
};

const tabs: { id: PlanningTab; label: string }[] = [{ id: "overview", label: "Visão geral" }, { id: "preparation", label: "Preparação" },
  { id: "reservations", label: "Reservas" }, { id: "grade", label: "Grade semestral" }];
type PageProps = { user: User; reloadAgenda: () => Promise<void>; onOpen?: (target: PlanningTarget) => void };

export function SemesterPlanning({ user, reloadAgenda, onOpen }: PageProps) {
  const { data } = useData();
  const [semesterId, setSemesterId] = useState("");
  const [tab, setTab] = useState<PlanningTab>("overview");
  const [status, setStatus] = useState("");
  const semester = data.semesters.find((item) => String(item.id) === semesterId);
  // Como na referência, abre no semestre vigente (ou no primeiro cadastrado).
  useEffect(() => {
    if (semesterId || !data.semesters.length) return;
    const today = localDate(new Date());
    const current = data.semesters.find((item) => item.startDate.slice(0, 10) <= today && item.endDate.slice(0, 10) >= today);
    setSemesterId(String((current ?? data.semesters[0]).id));
  }, [data.semesters.length]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((item) => item.id === tab);
    const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    setTab(tabs[next].id);
    document.getElementById(`planning-tab-${tabs[next].id}`)?.focus();
  };
  return <div className="sgp"><div className="courses-page planning-page">
    <header className="planning-heading"><div>
      <span className="courses-eyebrow">PLANEJAMENTO / GESTÃO ACADÊMICA</span><h1>Planejamento Semestral</h1>
      <p>Acompanhe as reservas dos instrutores e organize a grade antes da publicação final.</p></div>
      <div className="planning-heading-controls">
        <label><span>Semestre</span><select aria-label="Selecionar semestre do planejamento" value={semesterId} onChange={(event) => { setSemesterId(event.target.value); setStatus(""); }}>
          <option value="">Selecione</option>{data.semesters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        {semester && status && <span className="planning-current-status" aria-label={`Situação do planejamento: ${status}`}>{status}</span>}
        {semester && <span className="sr-only">Semestre selecionado: {semester.name} · {dateBR(semester.startDate)} a {dateBR(semester.endDate)}</span>}
      </div>
    </header>
    <div className="planning-tabs" role="tablist" aria-label="Áreas do planejamento" onKeyDown={onKeyDown}>{tabs.map((item) =>
      <button type="button" role="tab" id={`planning-tab-${item.id}`} key={item.id} aria-selected={tab === item.id} aria-controls={`planning-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
    {!semester && <p className="planning-empty">{data.semesters.length ? "Selecione um semestre para consultar o planejamento." : "Cadastre um semestre para iniciar o planejamento."}</p>}
    {semester && <SemesterPlan key={semesterId} semester={semester} user={user} reloadAgenda={reloadAgenda} onOpen={onOpen} tab={tab} onTab={setTab} onStatus={setStatus} />}
  </div></div>;
}

function Fold({ icon, title, subtitle, badge, tone = "is-ok", children }: { icon: ReactNode; title: string; subtitle: string; badge: string; tone?: string; children: ReactNode }) {
  return <details className="planning-reference-check-details sgp-fold"><summary><span className="planning-details-icon">{icon}</span><span className="planning-details-text"><strong>{title}</strong><small>{subtitle}</small></span><span className={`planning-details-badge ${tone}`}>{badge}</span><ChevronDown className="planning-details-chevron" size={18} aria-hidden="true" /></summary>{children}</details>;
}

// Each selection owns its form, filters and pending requests, including A → B → A.
function SemesterPlan({ semester, user, reloadAgenda, onOpen, tab, onTab, onStatus }: PageProps & {
  semester: Semester; tab: PlanningTab; onTab: (tab: PlanningTab) => void; onStatus: (status: string) => void;
}) {
  const semesterId = String(semester.id);
  const { data } = useData();
  const admin = user.roles.includes("Admin");
  const request = useRef(0);
  const mounted = useRef(false);
  const operationPending = useRef(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [assignmentId, setAssignmentId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [capabilityId, setCapabilityId] = useState("");
  const [capabilities, setCapabilities] = useState<{ id: number; description: string }[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [teacherFilter, setTeacherFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [reason, setReason] = useState<Record<number, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const ready = loaded && !loading && (!plan || plan.semesterId === Number(semesterId));
  const assignments = data.assignments.filter((a) => a.semesterId === Number(semesterId) &&
    a.endedAtUtc === null && a.curricularUnitId !== null && (admin || a.teacherId === user.id));
  const visible = (plan?.proposals ?? []).filter((p) =>
    (!teacherFilter || p.teacherId === teacherFilter) &&
    (!classFilter || String(p.classGroupId) === classFilter) &&
    (!roomFilter || String(p.roomId) === roomFilter) &&
    (!statusFilter || p.status === statusFilter));

  async function load(target: string) {
    const id = ++request.current;
    const current = () => mounted.current && id === request.current;
    setLoading(true); setLoaded(false); setError(""); setPreview(null); setPlan(null); setHistory([]);
    try {
      const plans = await read<{ id: number }[]>(`/semester-plans?semesterId=${target}`);
      if (!current()) return false;
      if (!plans.length) { setLoaded(true); return true; }
      const next = await read<Plan>(`/semester-plans/${plans[0].id}`);
      if (!current()) return false;
      if (next.semesterId !== Number(target)) throw new Error("O planejamento recebido não corresponde ao semestre selecionado.");
      const events = await read<History[]>(`/semester-plans/${next.id}/history`);
      if (!current()) return false;
      setPlan(next);
      setHistory(events); setLoaded(true);
      return true;
    } catch (cause) { if (current()) setError(resultMessage(cause)); return false; }
    finally { if (current()) setLoading(false); }
  }
  useEffect(() => {
    mounted.current = true;
    void load(semesterId);
    return () => { mounted.current = false; request.current++; };
  }, [semesterId]);
  useEffect(() => {
    setCapabilities([]);
    if (!ready || !plan || !assignmentId) return;
    let active = true;
    read<{ id: number; description: string }[]>(`/semester-plans/${plan.id}/capabilities?assignmentId=${assignmentId}`)
      .then((rows) => { if (active) setCapabilities(rows); })
      .catch((cause) => { if (active) setError(resultMessage(cause)); });
    return () => { active = false; };
  }, [plan?.id, assignmentId, ready]);
  async function run(operation: () => Promise<unknown>, message: string) {
    if (!mounted.current || !ready || operationPending.current) return;
    operationPending.current = true;
    setBusy(true); setError(""); setSuccess("");
    try {
      await operation();
      if (mounted.current && await load(semesterId) && mounted.current) setSuccess(message);
    }
    catch (cause) { if (mounted.current) setError(resultMessage(cause)); }
    finally { operationPending.current = false; if (mounted.current) setBusy(false); }
  }
  function clearForm() {
    setEditingId(null); setAssignmentId(""); setCapabilityId(""); setRoomId("");
    setShiftId(""); setStartDate(""); setEndDate("");
  }
  function edit(p: Proposal) {
    setEditingId(p.id); setAssignmentId(String(p.assignmentId));
    setCapabilityId(String(p.curricularCapabilityId ?? "")); setRoomId(String(p.roomId));
    setShiftId(String(p.shiftId)); setStartDate(p.startDate); setEndDate(p.endDate);
  }
  function publishedDistribution(entry: History) {
    if (entry.action !== "Publicada" || !entry.afterJson) return null;
    try {
      const snapshot = JSON.parse(entry.afterJson) as { Distribution?: {
        Id: number; TeacherId: string; ClassGroupId: number; RoomId: number;
        StartDate: string; EndDate: string; ShiftId: number;
      }[] };
      return snapshot.Distribution ?? null;
    } catch { return null; }
  }
  async function save() {
    if (!ready || !plan || !assignmentId || !roomId || !shiftId || !startDate || !endDate) return;
    const input = { assignmentId: Number(assignmentId), curricularCapabilityId: capabilityId ? Number(capabilityId) : null,
      roomId: Number(roomId), shiftId: Number(shiftId), startDate, endDate };
    await run(async () => {
      if (editingId) await put(`/semester-plans/${plan.id}/proposals/${editingId}`, input);
      else await post(`/semester-plans/${plan.id}/proposals`, input);
      if (mounted.current) clearForm();
    }, "Rascunho salvo. Nenhuma sala foi ocupada.");
  }
  async function previewPublication() {
    if (!mounted.current || !ready || !plan || operationPending.current) return;
    operationPending.current = true;
    setBusy(true); setError(""); setPreview(null);
    try {
      const result = await read<Preview>(`/semester-plans/${plan.id}/publish-preview`);
      if (mounted.current) setPreview(result);
    }
    catch (cause) { if (mounted.current) setError(resultMessage(cause)); }
    finally { operationPending.current = false; if (mounted.current) setBusy(false); }
  }

  const agenda = useSemesterAgenda(semester, user);
  const units = useClassUnits(semester, true);
  const issues = preparationIssues(data, semester, units);
  const versions = admin ? data.schedules.filter((item) => item.semesterId === semester.id).sort((a, b) => b.id - a.id) : [];
  const [versionId, setVersionId] = useState("");
  const reference = versions.find((item) => String(item.id) === versionId) ?? versions.find((item) => item.status === "Publicada") ?? versions[0];
  const { grade, error: gradeError } = useGrade(reference?.id);
  const steps = ["Em elaboração", "Em revisão", "Aprovada", "Publicada"];
  const proposals = plan?.proposals ?? [];
  const open = proposals.filter((item) => item.status !== "Rejeitada");
  const step = !plan ? -1 : plan.published ? 3 : open.length && open.every((item) => item.status === "Aprovada") ? 2 : proposals.some((item) => item.status === "Enviada" || item.status === "Aprovada") ? 1 : 0;
  const gradeStatus = !ready ? (loading ? "Carregando" : "Indisponível") : step < 0 ? "Não iniciado" : steps[step];
  useEffect(() => { onStatus(gradeStatus); }, [gradeStatus]);
  const approved = proposals.filter((item) => item.status === "Aprovada").length;
  const sent = proposals.filter((item) => item.status === "Enviada").length;
  const panel = (id: PlanningTab, content: ReactNode) =>
    <div className="planning-tab-panel" role="tabpanel" id={`planning-panel-${id}`} aria-labelledby={`planning-tab-${id}`} hidden={tab !== id}>{content}</div>;
  const unavailable = <p className="planning-empty">{loading ? "Aguarde o carregamento do planejamento." : ready ? "Crie o planejamento do semestre na aba Grade semestral para usar as propostas." : "Planejamento não carregado."}</p>;
  const choose = (label: string, value: string, onChange: (value: string) => void, empty: string, options: [string | number, string][], disabled = busy) =>
    <label><span>{label}</span><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="">{empty}</option>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
  const filter = (name: string, value: string, onChange: (value: string) => void, empty: string, options: [string | number, string][]) =>
    <label><span>{name}</span><select aria-label={`Filtrar ${name === "Situação" ? "situação" : name.toLowerCase()}`} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{empty}</option>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
  const teacherName = (id: string) => data.teachers.find((item) => item.id === id)?.displayName ?? id;
  const className = (id: number) => data.classes.find((item) => item.id === id)?.name ?? `Turma ${id}`;
  const tone = (status: string) => status === "Aprovada" || status === "Publicada" ? "is-confirmed" : status === "Rejeitada" ? "is-warning" : "is-pending";

  const proposalArea = <Fold icon={<ListChecks size={20} aria-hidden="true" />} title="Propostas do planejamento semestral" subtitle="Propostas de alocação, envio, análise e correção. Não são reservas cotidianas."
    badge={ready && plan ? `${proposals.length} ${proposals.length === 1 ? "proposta" : "propostas"}${sent ? ` · ${sent} em análise` : ""}` : "Indisponível"} tone={sent ? "is-warning" : "is-ok"}>
    {!(ready && plan) ? <section className="courses-panel planning-section">{unavailable}</section> : <>
      {!plan.published && assignments.length === 0 && <p className="planning-empty">Nenhuma atribuição pedagógica ativa disponível para você neste semestre.</p>}
      {!plan.published && assignments.length > 0 && <section className="courses-panel planning-section">
        <div className="curriculum-section-head"><div><h3>{editingId ? `Editar proposta #${editingId}` : "Nova proposta"}</h3><p>Selecione a atribuição, o ambiente e o período. Salvar mantém a proposta em rascunho.</p></div></div>
        <div className="grade-filters sgp-form">
          {choose("Atribuição", assignmentId, (value) => { setAssignmentId(value); setCapabilityId(""); }, "Selecione", assignments.map((item) => [item.id, `${className(item.classGroupId)} · ${item.disciplineName} · ${teacherName(item.teacherId)}`]))}
          {choose("Capacidade (opcional)", capabilityId, setCapabilityId, "Sem capacidade específica", capabilities.map((item) => [item.id, item.description]), busy || !assignmentId)}
          {choose("Ambiente", roomId, setRoomId, "Selecione", data.rooms.filter((item) => item.active).map((item) => [item.id, item.name]))}
          {choose("Turno", shiftId, setShiftId, "Selecione", data.shifts.map((item) => [item.id, item.name]))}
          <label><span>Início</span><input type="date" value={startDate} disabled={busy} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label><span>Fim</span><input type="date" value={endDate} disabled={busy} onChange={(event) => setEndDate(event.target.value)} /></label>
        </div>
        <div className="sgp-actions"><button type="button" className="course-primary" disabled={busy || !assignmentId || !roomId || !shiftId || !startDate || !endDate} onClick={() => void save()}>{editingId ? "Salvar alteração" : "Criar proposta"}</button>
          {editingId && <button type="button" className="course-secondary" disabled={busy} onClick={clearForm}>Cancelar edição</button>}</div>
      </section>}
      <section className="courses-panel planning-section">
        <div className="curriculum-section-head"><div><h3>Propostas do semestre</h3><p>Aprovação e publicação são etapas distintas. Aprovar não ocupa ambiente.</p></div><span className="planning-reference-status is-pending">{visible.length} de {proposals.length} registros</span></div>
        <div className="grade-filters" role="group" aria-label="Filtros das propostas">
          {admin && filter("Instrutor", teacherFilter, setTeacherFilter, "Todos", data.teachers.map((item) => [item.id, item.displayName]))}
          {filter("Turma", classFilter, setClassFilter, "Todas", data.classes.filter((item) => item.semesterId === plan.semesterId).map((item) => [item.id, item.name]))}
          {filter("Ambiente", roomFilter, setRoomFilter, "Todos", data.rooms.map((item) => [item.id, item.name]))}
          {filter("Situação", statusFilter, setStatusFilter, "Todas", Object.entries(statusLabel))}
        </div>
        <div className="planning-section-body sgp-proposals">
          {visible.length === 0 && <p className="planning-empty">Nenhuma proposta neste filtro.</p>}
          {visible.map((item) => { const assignment = data.assignments.find((row) => row.id === item.assignmentId); return <article key={item.id} className="reservation-panel sgp-proposal">
            <header className="reservation-panel-head"><div><h5>Proposta #{item.id} · {className(item.classGroupId)}</h5><small>{item.roomName} · {item.shiftName} · {dateBR(item.startDate)} a {dateBR(item.endDate)}</small></div><span className={`pill planning-reference-status ${tone(item.status)}`}>{item.status}</span></header>
            <div className="reservation-panel-body">
              <p>Instrutor: <strong>{teacherName(item.teacherId)}</strong> · UC: <strong>{assignment?.disciplineName ?? (item.curricularUnitId ? `UC #${item.curricularUnitId}` : "não informada")}</strong>{item.curricularCapabilityId && <> · Capacidade: <strong>{capabilities.find((row) => row.id === item.curricularCapabilityId)?.description ?? `#${item.curricularCapabilityId}`}</strong></>}</p>
              <p className="reservation-env-note">{item.status === "Aprovada" ? "Aprovada para publicação; ainda não ocupa ambiente." : item.status === "Publicada" ? "Publicada no planejamento." : statusLabel[item.status] ?? item.status}</p>
              {item.rejectionReason && <p className="course-error">Motivo: {item.rejectionReason}</p>}
              {!plan.published && item.status === "Rejeitada" && <div className="sgp-actions"><button type="button" className="course-secondary" disabled={busy} onClick={() => void run(() => post(`/semester-plans/${plan.id}/proposals/${item.id}/revise`), "Proposta reaberta como rascunho; a decisão anterior permanece no histórico.")}>Corrigir proposta</button></div>}
              {!plan.published && item.status === "Rascunho" && <div className="sgp-actions">
                <button type="button" className="course-secondary" disabled={busy} onClick={() => edit(item)}>Editar</button>
                <button type="button" className="course-primary" disabled={busy} onClick={() => void run(() => post(`/semester-plans/${plan.id}/proposals/${item.id}/submit`), "Proposta enviada para análise.")}>Enviar</button>
              </div>}
              {admin && !plan.published && item.status === "Enviada" && <div className="sgp-actions">
                <input aria-label={`Motivo para rejeitar proposta ${item.id}`} placeholder="Motivo da rejeição" maxLength={500} value={reason[item.id] ?? ""} disabled={busy} onChange={(event) => setReason((old) => ({ ...old, [item.id]: event.target.value }))} />
                <button type="button" className="course-primary" disabled={busy} onClick={() => void run(() => post(`/semester-plans/${plan.id}/proposals/${item.id}/decision?decision=approve`, {}), "Proposta aprovada. Ainda não ocupa ambiente.")}>Aprovar</button>
                <button type="button" className="course-secondary" disabled={busy || !reason[item.id]?.trim()} onClick={() => void run(() => post(`/semester-plans/${plan.id}/proposals/${item.id}/decision?decision=reject`, { reason: reason[item.id] }), "Proposta rejeitada.")}>Rejeitar</button>
              </div>}
            </div>
          </article>; })}
        </div>
      </section>
    </>}
  </Fold>;

  const gradeArea = <>
    {gradeError && <p className="course-error" role="alert">{gradeError}</p>}
    {admin && <Fold icon={<Settings2 size={20} aria-hidden="true" />} title="Gestão das versões da grade" subtitle="Geração, alocações pendentes, ajuste de encontros e publicação de cada versão." badge={`${versions.length} ${versions.length === 1 ? "versão" : "versões"}`}>
      <div className="sgp-legacy"><Schedules user={user} reloadAgenda={reloadAgenda} initialSemesterId={String(semester.id)} embedded /></div>
    </Fold>}
    <section className="courses-panel planning-section planning-reference-finalize">
      <div className="curriculum-section-head"><div><h3>Finalização do planejamento</h3><p>Publicação confirmada pelo gestor. A prévia revalida as propostas aprovadas antes de criar ocupações.</p></div><div className="planning-reference-finalize-actions">
        {ready && !plan && <button type="button" className="course-primary" disabled={busy} onClick={() => void run(async () => { await post(`/semester-plans/${semesterId}`); }, "Planejamento criado.")}>Criar planejamento</button>}
        {ready && plan && admin && !plan.published && <button type="button" className="course-primary" disabled={busy} onClick={() => void previewPublication()}>Consultar prévia</button>}
        {ready && plan?.published && <span className="planning-reference-status is-confirmed">Planejamento publicado</span>}
      </div></div>
      <ol className="grade-steps" aria-label="Etapas do planejamento">{steps.map((label, index) => <li key={label} className={index < step ? "is-done" : index === step ? "is-current" : ""} aria-current={index === step ? "step" : undefined}><span>{index < step ? <Check size={14} /> : index + 1}</span>{label}</li>)}</ol>
      {ready && plan && <p className="grade-steps-note">{proposals.length} proposta(s) · {approved} aprovada(s). Aprovação, por si só, não reserva ambientes.</p>}
      {!ready && <p className="grade-steps-note">{loading ? "Aguarde o carregamento do planejamento." : "Planejamento não carregado."}</p>}
      {ready && plan && preview && !plan.published && <div className="planning-section-body sgp-preview">
        <p>{preview.proposalCount} propostas · {preview.approved} aprovadas · {preview.toCreate} ocupações a criar · {preview.existing} ocupações equivalentes existentes.</p>
        <p><span className={`planning-reference-status ${preview.allowed ? "is-confirmed" : "is-warning"}`}>{preview.allowed ? "Publicação permitida pela prévia" : "Publicação bloqueada pela prévia"}</span></p>
        {preview.blocks.map((item, index) => <p className="course-error" role="alert" key={`block-${index}`}>{item}</p>)}
        {preview.warnings.map((item, index) => <p className="planning-reference-tip" role="status" key={`warning-${index}`}>Aviso: {item}</p>)}
        <div className="sgp-scroll">{preview.checks.map((item, index) => <p key={index}>Proposta {item.proposalId} · {new Date(item.startsAt).toLocaleDateString("pt-BR")} · {item.existingOccupationId ? "ocupação existente" : "nova ocupação"}{item.blocks.length ? ` · ${item.blocks.join("; ")}` : ""}</p>)}</div>
        <div className="sgp-actions"><button type="button" className="course-primary" disabled={busy || !preview.allowed || preview.revision !== plan.revision} onClick={() => void run(async () => {
          await post(`/semester-plans/${plan.id}/publish`, { confirm: true, expectedRevision: preview.revision, expectedSignature: preview.signature });
          if (mounted.current) setPreview(null);
          await reloadAgenda();
        }, "Planejamento publicado. O cronograma e a agenda foram atualizados.")}>Confirmar publicação</button></div>
      </div>}
    </section>
    <Fold icon={<HistoryIcon size={20} aria-hidden="true" />} title="Histórico do planejamento" subtitle="Registro das ações realizadas sobre este planejamento." badge={ready && plan ? `${history.length} ${history.length === 1 ? "evento" : "eventos"}` : "Indisponível"}>
      <section className="courses-panel planning-section">{!(ready && plan) ? unavailable : history.length === 0 ? <p className="planning-empty">Sem eventos registrados.</p> : <ol className="sgp-scroll sgp-history">{history.map((entry) => <li key={entry.id}>
        {new Date(entry.createdAtUtc).toLocaleString("pt-BR")} · {entry.actorName} · {entry.action} · {entry.entityType} #{entry.entityId}{entry.reason ? ` · ${entry.reason}` : ""}
        {publishedDistribution(entry)?.map((item) => <p key={item.Id}>
          Proposta {item.Id}: {teacherName(item.TeacherId)} · {className(item.ClassGroupId)} · {data.rooms.find((row) => row.id === item.RoomId)?.name ?? `Ambiente ${item.RoomId}`} · {dateBR(item.StartDate)} a {dateBR(item.EndDate)} · {data.shifts.find((row) => row.id === item.ShiftId)?.name ?? `Turno ${item.ShiftId}`}
        </p>)}
      </li>)}</ol>}</section>
    </Fold>
  </>;

  return <>
    {success && <div className="environment-notice" role="status"><Check size={16} /> {success}<button type="button" aria-label="Dispensar aviso" onClick={() => setSuccess("")}><X size={15} /></button></div>}
    {error && <div className="sgp-alert" role="alert"><span>{error}</span><button type="button" aria-label="Dispensar erro" onClick={() => setError("")}><X size={15} /></button></div>}
    {loading && <p role="status" className="sr-only">Carregando planejamento...</p>}
    {!loading && !loaded && <button type="button" className="course-secondary sgp-retry" onClick={() => void load(semesterId)}>Tentar novamente</button>}
    {panel("overview", <OverviewTab semester={semester} occupations={agenda.items} agendaReady={!agenda.loading && !agenda.error} grade={grade} proposals={proposals} issueCount={issues.reduce((total, item) => total + item.occurrences.length, 0)} gradeStatus={gradeStatus} onTab={onTab} />)}
    {panel("preparation", <PreparationTab semester={semester} user={user} units={units} issues={issues} onOpen={onOpen} />)}
    {panel("reservations", <ReservationsTab semester={semester} user={user} occupations={agenda.items} loading={agenda.loading} onOpenBookings={onOpen && (() => onOpen("bookings"))}>{proposalArea}</ReservationsTab>)}
    {panel("grade", <GradeTab semester={semester} user={user} occupations={agenda.items} loading={agenda.loading} error={agenda.error} versions={versions} versionId={versionId} onVersion={setVersionId} grade={grade}>{gradeArea}</GradeTab>)}
  </>;
}
