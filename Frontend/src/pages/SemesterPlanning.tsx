import { useEffect, useRef, useState } from "react";
import { post, put, read } from "../lib/api";
import { useData } from "../lib/data";
import { dateBR, resultMessage } from "../lib/utils";
import { Badge, Card, Field, FilterBar, Notice, SectionHeading, Title } from "../components/UI";
import type { User } from "../types";

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

export function SemesterPlanning({ user, reloadAgenda }: { user: User; reloadAgenda: () => Promise<void> }) {
  const { data } = useData();
  const [semesterId, setSemesterId] = useState("");
  const semester = data.semesters.find((item) => String(item.id) === semesterId);
  return <div className="space-y-5">
    <Title title="Planejamento Semestral" subtitle="Propostas e aprovação não ocupam ambientes. Apenas a publicação confirmada cria ocupações efetivas." />
    <FilterBar><Field label="Semestre"><select className="field" value={semesterId} onChange={(e) => setSemesterId(e.target.value)}>
      <option value="">Selecione</option>{data.semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select></Field></FilterBar>
    {semester && <p className="text-sm text-muted-ink">Semestre selecionado: <strong className="text-ink">{semester.name}</strong> · {dateBR(semester.startDate)} a {dateBR(semester.endDate)}</p>}
    {semesterId && <SemesterPlan key={semesterId} semesterId={semesterId} user={user} reloadAgenda={reloadAgenda} />}
  </div>;
}

// Each selection owns its form, filters and pending requests, including A → B → A.
function SemesterPlan({ semesterId, user, reloadAgenda }: {
  semesterId: string; user: User; reloadAgenda: () => Promise<void>;
}) {
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

  async function load(semester: string) {
    const id = ++request.current;
    const current = () => mounted.current && id === request.current;
    setLoading(true); setLoaded(false); setError(""); setPreview(null); setPlan(null); setHistory([]);
    try {
      const plans = await read<{ id: number }[]>(`/semester-plans?semesterId=${semester}`);
      if (!current()) return false;
      if (!plans.length) { setLoaded(true); return true; }
      const next = await read<Plan>(`/semester-plans/${plans[0].id}`);
      if (!current()) return false;
      if (next.semesterId !== Number(semester)) throw new Error("O planejamento recebido não corresponde ao semestre selecionado.");
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

  return <div className="space-y-5">
    {error && <Notice message={error} onClose={() => setError("")} />}
    {success && <Notice type="success" message={success} onClose={() => setSuccess("")} />}
    {loading && <p role="status">Carregando planejamento...</p>}
    {!loading && !loaded && <button type="button" className="btn-secondary" onClick={() => void load(semesterId)}>Tentar novamente</button>}
    {ready && !plan && <Card className="p-5 space-y-3">
      <SectionHeading title="Planejamento ainda não criado" subtitle="Reservas cotidianas continuam disponíveis." />
      <button type="button" className="btn-primary" disabled={busy} onClick={() => void run(async () => {
        await post(`/semester-plans/${semesterId}`);
      }, "Planejamento criado.")}>Criar planejamento</button>
    </Card>}
    {ready && plan && <>
      <Card className="p-5 space-y-4">
        <SectionHeading title={`Planejamento ${plan.published ? "publicado" : "em preparação"}`}
          subtitle={plan.published ? "As ocupações publicadas estão disponíveis no cronograma e na agenda." : "Propostas em preparação ainda não ocupam ambientes."} />
        <div className="flex flex-wrap items-center gap-2 text-sm"><Badge status={plan.published ? "Publicada" : "Rascunho"} />
          <span className="text-muted-ink">{plan.proposals.length} proposta(s) · {plan.proposals.filter((item) => item.status === "Aprovada").length} aprovada(s)</span>
        </div>
        {!plan.published && assignments.length === 0 && <Notice type="info" message="Nenhuma atribuição pedagógica ativa disponível para você neste semestre." />}
        {!plan.published && assignments.length > 0 && <div className="border-t border-line pt-4 space-y-4">
          <div><h3 className="font-semibold text-ink">{editingId ? `Editar proposta #${editingId}` : "Nova proposta"}</h3>
            <p className="text-sm text-muted-ink">Selecione a atribuição, o ambiente e o período. Salvar mantém a proposta em rascunho.</p></div>
          <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Atribuição"><select className="field" value={assignmentId} disabled={busy} onChange={(e) => { setAssignmentId(e.target.value); setCapabilityId(""); }}>
            <option value="">Selecione</option>{assignments.map((a) => <option key={a.id} value={a.id}>
              {data.classes.find((c) => c.id === a.classGroupId)?.name ?? `Turma ${a.classGroupId}`} · {a.disciplineName} · {data.teachers.find((t) => t.id === a.teacherId)?.displayName ?? a.teacherId}
            </option>)}
          </select></Field>
          <Field label="Capacidade (opcional)"><select className="field" value={capabilityId} disabled={busy || !assignmentId} onChange={(e) => setCapabilityId(e.target.value)}>
            <option value="">Sem capacidade específica</option>{capabilities.map((c) => <option key={c.id} value={c.id}>{c.description}</option>)}
          </select></Field>
          <Field label="Ambiente"><select className="field" value={roomId} disabled={busy} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">Selecione</option>{data.rooms.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select></Field>
          <Field label="Turno"><select className="field" value={shiftId} disabled={busy} onChange={(e) => setShiftId(e.target.value)}>
            <option value="">Selecione</option>{data.shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></Field>
          <Field label="Início"><input type="date" className="field" value={startDate} disabled={busy} onChange={(e) => setStartDate(e.target.value)} /></Field>
          <Field label="Fim"><input type="date" className="field" value={endDate} disabled={busy} onChange={(e) => setEndDate(e.target.value)} /></Field>
          <div className="sm:col-span-3 flex flex-wrap gap-2"><button type="button" className="btn-primary" disabled={busy || !assignmentId || !roomId || !shiftId || !startDate || !endDate} onClick={() => void save()}>{editingId ? "Salvar alteração" : "Criar proposta"}</button>
            {editingId && <button type="button" className="btn-secondary" disabled={busy} onClick={clearForm}>Cancelar edição</button>}</div>
          </div>
        </div>}
      </Card>
      <Card className="p-5 space-y-4"><SectionHeading title="Propostas do semestre" subtitle="Aprovação e publicação são etapas distintas e permanecem identificadas pelo estado." />
        <h3 className="text-sm font-semibold text-ink">Filtrar propostas</h3>
        <div className="grid sm:grid-cols-4 gap-2">
          {admin && <select aria-label="Filtrar professor" className="field" value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)}><option value="">Todos os professores</option>{data.teachers.map((t) => <option key={t.id} value={t.id}>{t.displayName}</option>)}</select>}
          <select aria-label="Filtrar turma" className="field" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}><option value="">Todas as turmas</option>{data.classes.filter((c) => c.semesterId === plan.semesterId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select aria-label="Filtrar ambiente" className="field" value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}><option value="">Todos os ambientes</option>{data.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          <select aria-label="Filtrar situação" className="field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">Todas as situações</option>{Object.entries(statusLabel).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select>
        </div>
        {visible.length === 0 && <Notice type="info" message="Nenhuma proposta neste filtro." />}
        {visible.map((p) => { const assignment = data.assignments.find((item) => item.id === p.assignmentId); return <article key={p.id} className="rounded-xl border border-line p-4 text-sm space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold text-ink">Proposta #{p.id} · {data.classes.find((c) => c.id === p.classGroupId)?.name ?? `Turma ${p.classGroupId}`}</h3>
            <p className="text-muted-ink mt-1">{p.roomName} · {p.shiftName} · {dateBR(p.startDate)} a {dateBR(p.endDate)}</p></div><Badge status={p.status} /></div>
          <p className="text-muted-ink">Professor: <span className="text-ink">{data.teachers.find((t) => t.id === p.teacherId)?.displayName ?? p.teacherId}</span> · UC: <span className="text-ink">{assignment?.disciplineName ?? (p.curricularUnitId ? `UC #${p.curricularUnitId}` : "não informada")}</span>{p.curricularCapabilityId && <> · Capacidade: <span className="text-ink">{capabilities.find((item) => item.id === p.curricularCapabilityId)?.description ?? `#${p.curricularCapabilityId}`}</span></>}</p>
          <p className="text-xs text-muted-ink">{p.status === "Aprovada" ? "Aprovada para publicação; ainda não ocupa ambiente." : p.status === "Publicada" ? "Publicada no planejamento." : statusLabel[p.status] ?? p.status}</p>
          {p.rejectionReason && <p className="text-rose-300">Motivo: {p.rejectionReason}</p>}
          {!plan.published && p.status === "Rejeitada" && <button type="button" className="btn-secondary" disabled={busy} onClick={() => void run(() => post(`/semester-plans/${plan.id}/proposals/${p.id}/revise`), "Proposta reaberta como rascunho; a decisão anterior permanece no histórico.")}>Corrigir proposta</button>}
          {!plan.published && p.status === "Rascunho" && <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => edit(p)}>Editar</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void run(() => post(`/semester-plans/${plan.id}/proposals/${p.id}/submit`), "Proposta enviada para análise.")}>Enviar</button>
          </div>}
          {admin && !plan.published && p.status === "Enviada" && <div className="space-y-2">
            <input className="field" aria-label={`Motivo para rejeitar proposta ${p.id}`} placeholder="Motivo da rejeição" maxLength={500} value={reason[p.id] ?? ""} disabled={busy} onChange={(e) => setReason((old) => ({ ...old, [p.id]: e.target.value }))} />
            <div className="flex flex-wrap gap-2"><button type="button" className="btn-primary" disabled={busy} onClick={() => void run(() => post(`/semester-plans/${plan.id}/proposals/${p.id}/decision?decision=approve`, {}), "Proposta aprovada. Ainda não ocupa ambiente.")}>Aprovar</button>
              <button type="button" className="btn-secondary" disabled={busy || !reason[p.id]?.trim()} onClick={() => void run(() => post(`/semester-plans/${plan.id}/proposals/${p.id}/decision?decision=reject`, { reason: reason[p.id] }), "Proposta rejeitada.")}>Rejeitar</button></div>
          </div>}
        </article>; })}
      </Card>
      {admin && !plan.published && <Card className="p-5 space-y-4"><SectionHeading title="Publicação" subtitle="A prévia revalida todas as propostas aprovadas antes de criar ocupações. Aprovação, por si só, não reserva ambientes." />
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => void previewPublication()}>Consultar prévia</button>
        {preview && <><div className="rounded-xl border border-line p-4 space-y-2 text-sm"><p>{preview.proposalCount} propostas · {preview.approved} aprovadas · {preview.toCreate} ocupações a criar · {preview.existing} ocupações equivalentes existentes.</p>
          <p className={preview.allowed ? "font-semibold text-emerald-300" : "font-semibold text-rose-300"}>{preview.allowed ? "Publicação permitida pela prévia" : "Publicação bloqueada pela prévia"}</p></div>
          {preview.blocks.map((b, i) => <Notice key={`block-${i}`} message={b} />)}
          {preview.warnings.map((w, i) => <p key={`warning-${i}`} role="status" className="rounded-xl border border-amber-700 bg-amber-950 p-3.5 text-sm text-amber-100">Aviso: {w}</p>)}
          <div className="max-h-48 overflow-y-auto rounded-xl border border-line p-3 space-y-2">{preview.checks.map((c, i) => <p key={i} className="text-xs text-muted-ink">Proposta {c.proposalId} · {new Date(c.startsAt).toLocaleDateString("pt-BR")} · {c.existingOccupationId ? "ocupação existente" : "nova ocupação"}{c.blocks.length ? ` · ${c.blocks.join("; ")}` : ""}</p>)}</div>
          <button type="button" className="btn-primary" disabled={busy || !preview.allowed || preview.revision !== plan.revision} onClick={() => void run(async () => {
            await post(`/semester-plans/${plan.id}/publish`, { confirm: true, expectedRevision: preview.revision, expectedSignature: preview.signature });
            if (mounted.current) setPreview(null);
            await reloadAgenda();
          }, "Planejamento publicado. O cronograma e a agenda foram atualizados.")}>Confirmar publicação</button>
        </>}
      </Card>}
      <Card className="p-5 space-y-4"><SectionHeading title="Histórico" subtitle="Registro das ações realizadas sobre este planejamento." />
        {history.length === 0 ? <p className="text-sm text-muted-ink">Sem eventos registrados.</p> : <ol className="space-y-2 text-sm">{history.map((h) => <li key={h.id} className="border-b border-line pb-3 last:border-0">
          {new Date(h.createdAtUtc).toLocaleString("pt-BR")} · {h.actorName} · {h.action} · {h.entityType} #{h.entityId}{h.reason ? ` · ${h.reason}` : ""}
          {publishedDistribution(h)?.map((item) => <p key={item.Id} className="text-muted-ink ml-3 mt-1">
            Proposta {item.Id}: {data.teachers.find((t) => t.id === item.TeacherId)?.displayName ?? item.TeacherId} · {data.classes.find((c) => c.id === item.ClassGroupId)?.name ?? `Turma ${item.ClassGroupId}`} · {data.rooms.find((r) => r.id === item.RoomId)?.name ?? `Ambiente ${item.RoomId}`} · {dateBR(item.StartDate)} a {dateBR(item.EndDate)} · {data.shifts.find((s) => s.id === item.ShiftId)?.name ?? `Turno ${item.ShiftId}`}
          </p>)}
        </li>)}</ol>}
      </Card>
    </>}
  </div>;
}
