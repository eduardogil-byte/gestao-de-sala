import { useEffect, useState } from "react";
import { post, put, read } from "../lib/api";
import { useData } from "../lib/data";
import { dateBR, resultMessage } from "../lib/utils";
import { Card, Field, Notice, Title } from "../components/UI";
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
  const admin = user.roles.includes("Admin");
  const [semesterId, setSemesterId] = useState("");
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
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const assignments = data.assignments.filter((a) => a.semesterId === Number(semesterId) &&
    a.endedAtUtc === null && a.curricularUnitId !== null && (admin || a.teacherId === user.id));
  const visible = (plan?.proposals ?? []).filter((p) =>
    (!teacherFilter || p.teacherId === teacherFilter) &&
    (!classFilter || String(p.classGroupId) === classFilter) &&
    (!roomFilter || String(p.roomId) === roomFilter) &&
    (!statusFilter || p.status === statusFilter));

  async function load(semester: string) {
    if (!semester) { setPlan(null); setHistory([]); return; }
    setLoading(true); setError(""); setPreview(null);
    try {
      const plans = await read<{ id: number }[]>(`/semester-plans?semesterId=${semester}`);
      if (!plans.length) { setPlan(null); setHistory([]); return; }
      const next = await read<Plan>(`/semester-plans/${plans[0].id}`);
      setPlan(next);
      setHistory(await read<History[]>(`/semester-plans/${next.id}/history`));
    } catch (cause) { setError(resultMessage(cause)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(semesterId); }, [semesterId]);
  useEffect(() => {
    if (!plan || !assignmentId) { setCapabilities([]); return; }
    let active = true;
    read<{ id: number; description: string }[]>(`/semester-plans/${plan.id}/capabilities?assignmentId=${assignmentId}`)
      .then((rows) => { if (active) setCapabilities(rows); })
      .catch((cause) => { if (active) setError(resultMessage(cause)); });
    return () => { active = false; };
  }, [plan?.id, assignmentId]);
  async function run(operation: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true); setError(""); setSuccess("");
    try { await operation(); await load(semesterId); setSuccess(message); }
    catch (cause) { setError(resultMessage(cause)); }
    finally { setBusy(false); }
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
    if (!plan || !assignmentId || !roomId || !shiftId || !startDate || !endDate) return;
    const input = { assignmentId: Number(assignmentId), curricularCapabilityId: capabilityId ? Number(capabilityId) : null,
      roomId: Number(roomId), shiftId: Number(shiftId), startDate, endDate };
    await run(async () => {
      if (editingId) await put(`/semester-plans/${plan.id}/proposals/${editingId}`, input);
      else await post(`/semester-plans/${plan.id}/proposals`, input);
      clearForm();
    }, "Rascunho salvo. Nenhuma sala foi ocupada.");
  }
  async function previewPublication() {
    if (!plan || busy) return;
    setBusy(true); setError(""); setPreview(null);
    try { setPreview(await read<Preview>(`/semester-plans/${plan.id}/publish-preview`)); }
    catch (cause) { setError(resultMessage(cause)); }
    finally { setBusy(false); }
  }

  return <div className="space-y-5">
    <Title title="Planejamento Semestral" subtitle="Propostas e aprovação não ocupam ambientes. Apenas a publicação confirmada cria ocupações efetivas." />
    {error && <Notice message={error} onClose={() => setError("")} />}
    {success && <Notice type="success" message={success} onClose={() => setSuccess("")} />}
    <Card className="p-5"><Field label="Semestre"><select className="field" value={semesterId} onChange={(e) => { setSemesterId(e.target.value); clearForm(); }}>
      <option value="">Selecione</option>{data.semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select></Field></Card>
    {loading && <p role="status">Carregando planejamento...</p>}
    {semesterId && !loading && !plan && <Card className="p-5 space-y-3">
      <p>Nenhum planejamento criado para este semestre. Reservas cotidianas continuam disponíveis.</p>
      <button type="button" className="btn-primary" disabled={busy} onClick={() => void run(async () => {
        await post(`/semester-plans/${semesterId}`);
      }, "Planejamento criado.")}>Criar planejamento</button>
    </Card>}
    {plan && <>
      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">Planejamento {plan.published ? "publicado" : "em preparação"}</h2>
        <p className="text-sm">{plan.proposals.length} proposta(s). {plan.published ? "As ocupações estão no cronograma e na agenda." : "Nenhuma proposta é ocupação confirmada."}</p>
        {!plan.published && assignments.length === 0 && <p>Nenhuma atribuição pedagógica ativa disponível para você neste semestre.</p>}
        {!plan.published && assignments.length > 0 && <div className="grid sm:grid-cols-3 gap-3">
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
          <div className="sm:col-span-3 flex gap-2"><button type="button" className="btn-primary" disabled={busy || !assignmentId || !roomId || !shiftId || !startDate || !endDate} onClick={() => void save()}>{editingId ? "Salvar alteração" : "Criar proposta"}</button>
            {editingId && <button type="button" className="btn-secondary" disabled={busy} onClick={clearForm}>Cancelar edição</button>}</div>
        </div>}
      </Card>
      <Card className="p-5 space-y-4"><h2 className="font-semibold">Propostas do semestre</h2>
        <div className="grid sm:grid-cols-4 gap-2">
          {admin && <select aria-label="Filtrar professor" className="field" value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)}><option value="">Todos os professores</option>{data.teachers.map((t) => <option key={t.id} value={t.id}>{t.displayName}</option>)}</select>}
          <select aria-label="Filtrar turma" className="field" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}><option value="">Todas as turmas</option>{data.classes.filter((c) => c.semesterId === plan.semesterId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select aria-label="Filtrar ambiente" className="field" value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}><option value="">Todos os ambientes</option>{data.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          <select aria-label="Filtrar situação" className="field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">Todas as situações</option>{Object.entries(statusLabel).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select>
        </div>
        {visible.length === 0 && <p>Nenhuma proposta neste filtro.</p>}
        {visible.map((p) => <div key={p.id} className="border rounded-lg p-3 text-sm space-y-2">
          <p className="font-semibold">#{p.id} · {data.classes.find((c) => c.id === p.classGroupId)?.name ?? `Turma ${p.classGroupId}`} · {p.roomName}</p>
          <p>{dateBR(p.startDate)} a {dateBR(p.endDate)} · {p.shiftName} · {statusLabel[p.status] ?? p.status}</p>
          {p.rejectionReason && <p className="text-rose-700">Motivo: {p.rejectionReason}</p>}
          {!plan.published && p.status === "Rejeitada" && <button type="button" className="btn-secondary" disabled={busy} onClick={() => void run(() => post(`/semester-plans/${plan.id}/proposals/${p.id}/revise`), "Proposta reaberta como rascunho; a decisão anterior permanece no histórico.")}>Corrigir proposta</button>}
          {!plan.published && p.status === "Rascunho" && <div className="flex gap-2">
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => edit(p)}>Editar</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void run(() => post(`/semester-plans/${plan.id}/proposals/${p.id}/submit`), "Proposta enviada para análise.")}>Enviar</button>
          </div>}
          {admin && !plan.published && p.status === "Enviada" && <div className="space-y-2">
            <input className="field" aria-label={`Motivo para rejeitar proposta ${p.id}`} placeholder="Motivo da rejeição" maxLength={500} value={reason[p.id] ?? ""} disabled={busy} onChange={(e) => setReason((old) => ({ ...old, [p.id]: e.target.value }))} />
            <div className="flex gap-2"><button type="button" className="btn-primary" disabled={busy} onClick={() => void run(() => post(`/semester-plans/${plan.id}/proposals/${p.id}/decision?decision=approve`, {}), "Proposta aprovada. Ainda não ocupa ambiente.")}>Aprovar</button>
              <button type="button" className="btn-secondary" disabled={busy || !reason[p.id]?.trim()} onClick={() => void run(() => post(`/semester-plans/${plan.id}/proposals/${p.id}/decision?decision=reject`, { reason: reason[p.id] }), "Proposta rejeitada.")}>Rejeitar</button></div>
          </div>}
        </div>)}
      </Card>
      {admin && !plan.published && <Card className="p-5 space-y-3"><h2 className="font-semibold">Publicação</h2>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => void previewPublication()}>Consultar prévia</button>
        {preview && <><p>{preview.proposalCount} propostas · {preview.approved} aprovadas · {preview.toCreate} ocupações a criar · {preview.existing} ocupações equivalentes existentes.</p>
          <p className={preview.allowed ? "text-emerald-700" : "text-rose-700"}>{preview.allowed ? "Publicação permitida" : "Publicação bloqueada"}</p>
          {preview.blocks.map((b, i) => <p key={i} className="text-rose-700">{b}</p>)}
          {preview.warnings.map((w, i) => <p key={i} className="text-amber-800">{w}</p>)}
          <div className="max-h-48 overflow-y-auto">{preview.checks.map((c, i) => <p key={i} className="text-xs">Proposta {c.proposalId} · {new Date(c.startsAt).toLocaleDateString("pt-BR")} · {c.existingOccupationId ? "ocupação existente" : "nova ocupação"}{c.blocks.length ? ` · ${c.blocks.join("; ")}` : ""}</p>)}</div>
          <button type="button" className="btn-primary" disabled={busy || !preview.allowed || preview.revision !== plan.revision} onClick={() => void run(async () => {
            await post(`/semester-plans/${plan.id}/publish`, { confirm: true, expectedRevision: preview.revision, expectedSignature: preview.signature });
            setPreview(null); await reloadAgenda();
          }, "Planejamento publicado. O cronograma e a agenda foram atualizados.")}>Confirmar publicação</button>
        </>}
      </Card>}
      <Card className="p-5"><h2 className="font-semibold mb-3">Histórico</h2>
        {history.length === 0 ? <p>Sem eventos registrados.</p> : <ol className="space-y-2 text-sm">{history.map((h) => <li key={h.id} className="border-b pb-2">
          {new Date(h.createdAtUtc).toLocaleString("pt-BR")} · {h.actorName} · {h.action} · {h.entityType} #{h.entityId}{h.reason ? ` · ${h.reason}` : ""}
          {publishedDistribution(h)?.map((item) => <p key={item.Id} className="text-slate-600 ml-3">
            Proposta {item.Id}: {data.teachers.find((t) => t.id === item.TeacherId)?.displayName ?? item.TeacherId} · {data.classes.find((c) => c.id === item.ClassGroupId)?.name ?? `Turma ${item.ClassGroupId}`} · {data.rooms.find((r) => r.id === item.RoomId)?.name ?? `Ambiente ${item.RoomId}`} · {dateBR(item.StartDate)} a {dateBR(item.EndDate)} · {data.shifts.find((s) => s.id === item.ShiftId)?.name ?? `Turno ${item.ShiftId}`}
          </p>)}
        </li>)}</ol>}
      </Card>
    </>}
  </div>;
}
