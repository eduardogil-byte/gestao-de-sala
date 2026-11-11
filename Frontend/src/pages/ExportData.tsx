import { useEffect, useState } from "react";
import { Busy, Card, Field, FilterBar, MetricCard, Notice, SectionHeading, Title } from "../components/UI";
import { ComparisonView } from "../components/ManagerDashboard";
import { downloadFile, read } from "../lib/api";
import { useData } from "../lib/data";
import { comparisonPath, indicatorErrorMessage, indicatorPath, isSemesterIndicators, orderedRooms,
  type SemesterComparison, type SemesterIndicators } from "../lib/occupancyIndicators";
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

const hours = (value: number | null) => value === null ? "Não comprovada" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)} h`;
const percentage = (value: number | null, capacity: number | null) => value === null || capacity === null ? "Indeterminado" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}%`;

export function ExportData({ initial, onInstructorAgenda }: { initial?: { semesterId: number; secondSemesterId: number | null; roomId: number | null } | null; onInstructorAgenda?: () => void }) {
  const { data, loading: catalogLoading, error: catalogError } = useData();
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
  const [success, setSuccess] = useState("");
  const [analysisSemester, setAnalysisSemester] = useState(initial ? String(initial.semesterId) : "");
  const [analysisRoom, setAnalysisRoom] = useState(initial?.roomId ? String(initial.roomId) : "");
  const [analysisSecond, setAnalysisSecond] = useState(initial?.secondSemesterId ? String(initial.secondSemesterId) : "");
  const [analysis, setAnalysis] = useState<SemesterIndicators | null>(null);
  const [comparison, setComparison] = useState<SemesterComparison | null>(null);
  const [loadedAnalysisKey, setLoadedAnalysisKey] = useState("");
  const [loadedComparisonKey, setLoadedComparisonKey] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [comparisonError, setComparisonError] = useState("");
  const description = choices.find((x) => x[0] === report)?.[2];
  const analysisKey = `${analysisSemester}|${analysisRoom}`;
  const comparisonKey = `${analysisSemester}|${analysisSecond}|${analysisRoom}`;
  useEffect(() => {
    if (!analysisSemester) { setAnalysis(null); setLoadedAnalysisKey(""); setAnalysisError(""); setAnalysisLoading(false); return; }
    let active = true;
    setAnalysis(null); setLoadedAnalysisKey(""); setAnalysisError(""); setAnalysisLoading(true);
    read<unknown>(indicatorPath(Number(analysisSemester), analysisRoom ? Number(analysisRoom) : undefined))
      .then((value) => {
        if (!isSemesterIndicators(value) || value.semesterId !== Number(analysisSemester)) throw new Error("A API retornou indicadores incompletos ou de outro semestre.");
        if (active) { setAnalysis(value); setLoadedAnalysisKey(analysisKey); }
      }).catch((cause) => { if (active) setAnalysisError(indicatorErrorMessage(cause)); })
      .finally(() => { if (active) setAnalysisLoading(false); });
    return () => { active = false; };
  }, [analysisKey, analysisSemester, analysisRoom]);
  useEffect(() => {
    if (!analysisSemester || !analysisSecond || analysisSemester === analysisSecond) {
      setComparison(null); setLoadedComparisonKey(""); setComparisonError(""); setComparisonLoading(false); return;
    }
    let active = true;
    setComparison(null); setLoadedComparisonKey(""); setComparisonError(""); setComparisonLoading(true);
    read<unknown>(comparisonPath(Number(analysisSemester), Number(analysisSecond), analysisRoom ? Number(analysisRoom) : undefined))
      .then((value) => {
        const result = value as SemesterComparison;
        if (!result || !isSemesterIndicators(result.first) || !isSemesterIndicators(result.second) ||
          result.first.semesterId !== Number(analysisSemester) || result.second.semesterId !== Number(analysisSecond))
          throw new Error("A API retornou uma comparação incompleta ou de outro semestre.");
        if (active) { setComparison(result); setLoadedComparisonKey(comparisonKey); }
      }).catch((cause) => { if (active) setComparisonError(indicatorErrorMessage(cause)); })
      .finally(() => { if (active) setComparisonLoading(false); });
    return () => { active = false; };
  }, [comparisonKey, analysisSemester, analysisSecond, analysisRoom]);
  async function exportReport() {
    const query = new URLSearchParams();
    if ((needsSemester || report === "Ocupacoes") && semester) query.set("semesterId", semester);
    if (report === "Comparacao" && secondSemester) query.set("secondSemesterId", secondSemester);
    if (! ["Docentes", "Catalogo"].includes(report) && room) query.set("roomId", room);
    if (report === "Ocupacoes" && shift) query.set("shiftId", shift);
    if (needsRange && from) query.set("from", from);
    if (needsRange && to) query.set("to", to);
    if (report === "Planejamento" && status) query.set("status", status);
    setBusy(true); setError(""); setSuccess("");
    try { await downloadFile(`/exports/${report}?${query.toString()}`); setSuccess("Arquivo Excel enviado ao navegador. O nome do arquivo é definido pelo servidor."); }
    catch (cause) { setError(resultMessage(cause)); }
    finally { setBusy(false); }
  }
  const needsSemester = ["Indicadores", "Planejamento", "Comparacao"].includes(report);
  const needsRange = report === "Ocupacoes" && !semester;
  const invalidRange = needsRange && !!from && !!to && from > to;
  useEffect(() => { setSuccess(""); }, [report, semester, secondSemester, room, shift, from, to, status]);
  return <div className="space-y-6">
    <Title title="Relatórios e exportações" subtitle="Consulte a ocupação registrada e exporte planilhas institucionais com filtros e indicadores oficiais." />
    <Card className="p-4 sm:p-5 space-y-5">
      <SectionHeading title="Análise de ocupação" subtitle="Capacidade, horas e percentuais são fornecidos pela API. Dados não comprovados permanecem indeterminados." />
      <FilterBar embedded>
        <Field label="Semestre da análise"><select className="field" value={analysisSemester} onChange={(event) => {
          setAnalysisSemester(event.target.value); if (event.target.value === analysisSecond) setAnalysisSecond("");
        }}><option value="">Selecione</option>{data.semesters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Ambiente da análise"><select className="field" value={analysisRoom} onChange={(event) => setAnalysisRoom(event.target.value)}>
          <option value="">Todos os ambientes</option>{data.rooms.map((item) => <option key={item.id} value={item.id}>{item.code ? `${item.code} · ` : ""}{item.name}</option>)}
        </select></Field>
        <Field label="Comparar com"><select className="field" value={analysisSecond} disabled={!analysisSemester} onChange={(event) => setAnalysisSecond(event.target.value)}>
          <option value="">Sem comparação</option>{data.semesters.filter((item) => String(item.id) !== analysisSemester).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></Field>
      </FilterBar>
      {catalogLoading && <Busy />}{catalogError && <Notice message={catalogError} />}
      {!catalogLoading && !data.semesters.length && <Notice type="info" message="Nenhum semestre cadastrado para análise." />}
      {!analysisSemester && data.semesters.length > 0 && <p className="muted">Selecione um semestre para consultar os indicadores.</p>}
      {analysisLoading && <Busy />}{analysisError && <Notice message={analysisError} />}
      {analysis && loadedAnalysisKey === analysisKey && !analysisLoading && !analysisError && <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Ocupação" value={percentage(analysis.occupancyPercent, analysis.capacityHours)} detail="Percentual oficial quando a capacidade é comprovada" tone={analysis.capacityHours === null ? "slate" : "blue"} />
          <MetricCard label="Horas ocupadas" value={hours(analysis.physicalOccupiedHours)} detail="Ocupação física registrada" tone="violet" />
          <MetricCard label="Capacidade" value={hours(analysis.capacityHours)} detail="Horas oferecidas comprovadas" tone="blue" />
          <MetricCard label="Horas disponíveis" value={hours(analysis.availableHours)} detail="Somente quando comprovadas" tone="emerald" />
        </div>
        {analysis.roomsWithUnknownCapacity > 0 && <Notice type="info" message={`${analysis.roomsWithUnknownCapacity} ambiente(s) sem capacidade comprovada; o percentual geral pode permanecer indeterminado.`} />}
        {analysis.warnings.map((warning) => <Notice key={warning} type="info" message={warning} />)}
        <div className="space-y-3"><SectionHeading title="Ocupação por ambiente" subtitle="Horas físicas ocupadas e capacidade por ambiente, conforme os indicadores oficiais." />
          {analysis.rooms.length ? <div className="grid gap-3">{orderedRooms(analysis.rooms).map((item) => <div key={item.roomId} className="rounded-panel border border-line p-4 space-y-2">
            <div className="flex flex-wrap justify-between gap-2"><strong className="text-ink">{data.rooms.find((room) => room.id === item.roomId)?.code ? `${data.rooms.find((room) => room.id === item.roomId)?.code} · ` : ""}{item.roomName}</strong><span className="pill bg-navy-800 text-ink">{percentage(item.occupancyPercent, item.capacityHours)}</span></div>
            <p className="muted">Ocupadas: {hours(item.physicalOccupiedHours)} · Capacidade: {hours(item.capacityHours)} · Disponíveis: {hours(item.availableHours)}</p>
            {item.capacityHours !== null && item.occupancyPercent !== null && <div role="img" aria-label={`${item.roomName}: ocupação ${percentage(item.occupancyPercent, item.capacityHours)}`} className="h-2 rounded-full bg-navy-800 overflow-hidden"><div className="h-full bg-sky-500" style={{ width: `${Math.max(0, Math.min(100, item.occupancyPercent))}%` }} /></div>}
            {item.warnings.map((warning) => <p key={warning} className="text-sm text-amber-200">{warning}</p>)}
          </div>)}</div> : <p className="muted">Nenhum ambiente retornado para este filtro.</p>}
        </div>
      </div>}
      {analysisSecond && comparisonLoading && <Busy />}{analysisSecond && comparisonError && <Notice message={comparisonError} />}
      {analysisSecond && comparison && loadedComparisonKey === comparisonKey && !comparisonLoading && !comparisonError && <ComparisonView {...comparison}
        firstName={data.semesters.find((item) => String(item.id) === analysisSemester)?.name ?? analysisSemester}
        secondName={data.semesters.find((item) => String(item.id) === analysisSecond)?.name ?? analysisSecond} />}
    </Card>
    <Card className="p-4 sm:p-5 space-y-3">
      <SectionHeading title="Carga horária dos instrutores" subtitle="Consulte a carga semanal e semestral na Agenda dos Instrutores, que usa as ocupações autorizadas pela API." />
      <p className="muted">A planilha de Docentes contém cadastro e habilitações; não apresenta uma carga horária calculada.</p>
      {onInstructorAgenda && <button type="button" className="btn-secondary" onClick={onInstructorAgenda}>Abrir Agenda dos Instrutores</button>}
    </Card>
    <Card className="p-5 space-y-4">
      <SectionHeading title="Exportar planilha Excel" subtitle="Escolha o tipo de relatório e informe apenas os filtros aceitos pela API." />
      <Field label="Relatório">
        <select className="field" value={report} disabled={busy} onChange={(e) => { setReport(e.target.value as Report); setError(""); }}>
          <optgroup label="Cadastros">{choices.slice(0, 3).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</optgroup>
          <optgroup label="Planejamento e ocupações">{choices.slice(3, 5).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</optgroup>
          <optgroup label="Indicadores">{choices.slice(5).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</optgroup>
        </select>
      </Field>
      <p className="muted">{description} Formato: Excel (.xlsx).</p>
      <FilterBar embedded>
        {(needsSemester || report === "Ocupacoes") && <Field label={report === "Comparacao" ? "Primeiro semestre" : report === "Ocupacoes" ? "Semestre (opcional)" : "Semestre"}>
          <select className="field" value={semester} disabled={busy} onChange={(e) => setSemester(e.target.value)}>
            <option value="">Selecione</option>{data.semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>}
        {report === "Comparacao" && <Field label="Segundo semestre">
          <select className="field" value={secondSemester} disabled={busy} onChange={(e) => setSecondSemester(e.target.value)}>
            <option value="">Selecione</option>{data.semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>}
        {!["Docentes", "Catalogo"].includes(report) && <Field label="Ambiente (opcional)">
          <select className="field" value={room} disabled={busy} onChange={(e) => setRoom(e.target.value)}>
            <option value="">Todos os ambientes</option>{data.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>}
        {report === "Ocupacoes" && <Field label="Turno (opcional)"><select className="field" value={shift} disabled={busy} onChange={(e) => setShift(e.target.value)}>
          <option value="">Todos</option>{data.shifts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></Field>}
        {needsRange && <><Field label="Data inicial"><input type="date" className="field" value={from} disabled={busy} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Data final"><input type="date" className="field" value={to} disabled={busy} onChange={(e) => setTo(e.target.value)} /></Field></>}
        {report === "Planejamento" && <Field label="Estado da proposta (opcional)">
          <select className="field" value={status} disabled={busy} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option><option value="Rascunho">Rascunhos</option><option value="Enviada">Enviadas</option>
            <option value="Aprovada">Aprovadas</option><option value="Rejeitada">Rejeitadas</option><option value="Publicada">Publicadas</option>
          </select>
        </Field>}
      </FilterBar>
      {needsSemester && !semester && <p className="muted">Selecione o semestre para habilitar a exportação.</p>}
      {report === "Comparacao" && semester && !secondSemester && <p className="muted">Selecione o segundo semestre para comparar.</p>}
      {needsRange && (!from || !to) && <p className="muted">Informe as datas inicial e final para exportar ocupações sem semestre.</p>}
      {needsRange && invalidRange && <Notice type="info" message="A data final deve ser igual ou posterior à data inicial." />}
      {report === "Comparacao" && semester && secondSemester === semester && <Notice type="info" message="Selecione semestres distintos para exportar a comparação." />}
      {error && <Notice message={error} />}
      {success && <Notice type="success" message={success} />}
      <button type="button" className="btn-primary" disabled={busy || (needsSemester && !semester) ||
        (report === "Comparacao" && (!secondSemester || semester === secondSemester)) ||
        (needsRange && (!from || !to || invalidRange))} onClick={() => void exportReport()}>
        {busy ? "Gerando arquivo..." : "Exportar Excel"}
      </button>
      <p className="rounded-control border border-line bg-navy-800 px-3 py-2 text-xs text-muted-ink">Limite: 10.000 linhas por relatório. As exportações não alteram cadastros ou ocupações.</p>
    </Card>
  </div>;
}
