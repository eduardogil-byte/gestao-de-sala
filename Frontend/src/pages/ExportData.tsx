import { useState } from "react";
import { Card, Field, Notice, Title } from "../components/UI";
import { downloadFile } from "../lib/api";
import { useData } from "../lib/data";
import { resultMessage } from "../lib/utils";

type Report = "Ambientes" | "Docentes" | "Catalogo" | "Ocupacoes" | "Planejamento" | "Indicadores" | "Comparacao";
const choices: [Report, string, string][] = [
  ["Ambientes", "Ambientes e inventário", "Ambientes, recursos, computadores e softwares."],
  ["Docentes", "Docentes e habilitações", "Formação e vínculos pedagógicos. Sem CPF ou credenciais."],
  ["Catalogo", "Catálogo pedagógico", "Cursos, módulos, UCs, capacidades e cargas horárias."],
  ["Ocupacoes", "Ocupações efetivas", "Ocupações confirmadas no intervalo ou semestre escolhido."],
  ["Planejamento", "Planejamento semestral", "Propostas e respectivos estados, separados das ocupações efetivas."],
  ["Indicadores", "Indicadores de ocupação", "Cálculos oficiais da SG-23 e alertas de dados parciais."],
  ["Comparacao", "Comparação entre semestres", "Indicadores oficiais dos dois semestres e variação quando calculável."],
];

export function ExportData({ initial }: { initial?: { semesterId: number; secondSemesterId: number | null; roomId: number | null } | null }) {
  const { data } = useData();
  const [report, setReport] = useState<Report>(initial?.secondSemesterId ? "Comparacao" : "Indicadores");
  const [semester, setSemester] = useState(initial ? String(initial.semesterId) : "");
  const [secondSemester, setSecondSemester] = useState(initial?.secondSemesterId ? String(initial.secondSemesterId) : "");
  const [room, setRoom] = useState(initial?.roomId ? String(initial.roomId) : "");
  const [shift, setShift] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const description = choices.find((x) => x[0] === report)?.[2];
  async function exportReport() {
    const query = new URLSearchParams();
    if ((needsSemester || report === "Ocupacoes") && semester) query.set("semesterId", semester);
    if (report === "Comparacao" && secondSemester) query.set("secondSemesterId", secondSemester);
    if (! ["Docentes", "Catalogo"].includes(report) && room) query.set("roomId", room);
    if (report === "Ocupacoes" && shift) query.set("shiftId", shift);
    if (needsRange && from) query.set("from", from);
    if (needsRange && to) query.set("to", to);
    if (report === "Planejamento" && status) query.set("status", status);
    setBusy(true); setError("");
    try { await downloadFile(`/exports/${report}?${query.toString()}`); }
    catch (cause) { setError(resultMessage(cause)); }
    finally { setBusy(false); }
  }
  const needsSemester = ["Indicadores", "Planejamento", "Comparacao"].includes(report);
  const needsRange = report === "Ocupacoes" && !semester;
  return <div className="space-y-5">
    <Title title="Exportar Dados" subtitle="Gere relatórios Excel somente leitura a partir dos dados e indicadores oficiais." />
    <Card className="space-y-4">
      <Field label="Relatório">
        <select className="input" value={report} disabled={busy} onChange={(e) => { setReport(e.target.value as Report); setError(""); }}>
          {choices.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </Field>
      <p className="text-sm text-slate-600">{description}</p>
      <div className="grid md:grid-cols-2 gap-4">
        {(needsSemester || report === "Ocupacoes") && <Field label={report === "Comparacao" ? "Primeiro semestre" : "Semestre (opcional para ocupações)"}>
          <select className="input" value={semester} disabled={busy} onChange={(e) => setSemester(e.target.value)}>
            <option value="">Selecione</option>{data.semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>}
        {report === "Comparacao" && <Field label="Segundo semestre">
          <select className="input" value={secondSemester} disabled={busy} onChange={(e) => setSecondSemester(e.target.value)}>
            <option value="">Selecione</option>{data.semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>}
        {!["Docentes", "Catalogo"].includes(report) && <Field label="Ambiente (opcional)">
          <select className="input" value={room} disabled={busy} onChange={(e) => setRoom(e.target.value)}>
            <option value="">Todos os ambientes</option>{data.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>}
        {report === "Ocupacoes" && <Field label="Turno (opcional)"><select className="input" value={shift} disabled={busy} onChange={(e) => setShift(e.target.value)}>
          <option value="">Todos</option>{data.shifts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></Field>}
        {needsRange && <><Field label="Data inicial"><input type="date" className="input" value={from} disabled={busy} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Data final"><input type="date" className="input" value={to} disabled={busy} onChange={(e) => setTo(e.target.value)} /></Field></>}
        {report === "Planejamento" && <Field label="Estado da proposta (opcional)">
          <select className="input" value={status} disabled={busy} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option><option value="Rascunho">Rascunhos</option><option value="Enviada">Enviadas</option>
            <option value="Aprovada">Aprovadas</option><option value="Rejeitada">Rejeitadas</option><option value="Publicada">Publicadas</option>
          </select>
        </Field>}
      </div>
      {error && <Notice message={error} />}
      <button type="button" className="btn-primary" disabled={busy || (needsSemester && !semester) ||
        (report === "Comparacao" && (!secondSemester || semester === secondSemester)) ||
        (needsRange && (!from || !to))} onClick={() => void exportReport()}>
        {busy ? "Gerando arquivo..." : "Exportar Excel"}
      </button>
      <p className="text-xs text-slate-500">Limite: 10.000 linhas por relatório. As exportações não alteram cadastros ou ocupações.</p>
    </Card>
  </div>;
}
