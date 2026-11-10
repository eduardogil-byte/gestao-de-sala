import { useEffect, useState } from "react";
import { read } from "../lib/api";
import { useData } from "../lib/data";
import { comparisonPath, indicatorErrorMessage, indicatorPath, isSemesterIndicators, orderedRooms, settleCurrent, shiftDistribution, variationPoints,
  type RoomIndicator, type SemesterComparison, type SemesterIndicators } from "../lib/occupancyIndicators";
import { localDate, roomKind } from "../lib/utils";
import { Busy, Card, Field, FilterBar, MetricCard, Modal, Notice, SectionHeading } from "./UI";
import { OperatingShiftEditor } from "./OperatingShiftEditor";

const hours = (value: number | null) => value === null ? "Não comprovada" :
  `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)} h`;
const percent = (value: number | null) => value === null ? "Indeterminado" :
  `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}%`;
const provenPercent = (capacity: number | null, value: number | null) => percent(capacity === null ? null : value);
const status = { Bottleneck: "Gargalo", Opportunity: "Oportunidade", Intermediate: "Intermediária", Unknown: "Percentual indeterminado" };
const tone = { Bottleneck: "bg-rose-600", Opportunity: "bg-emerald-600", Intermediate: "bg-sky-600", Unknown: "bg-slate-400" };
const shiftTone = (name: string) => /^manh/i.test(name) ? "bg-sky-400" : /^tard/i.test(name) ? "bg-emerald-400" : "bg-violet-400";

function Summary({ report }: { report: SemesterIndicators }) {
  const knownRooms = report.rooms.filter((room) => room.capacityHours !== null && room.availableHours !== null);
  const knownCapacity = knownRooms.length ? hours(knownRooms.reduce((sum, room) => sum + room.capacityHours!, 0)) : "Não comprovada";
  const knownAvailable = knownRooms.length ? hours(knownRooms.reduce((sum, room) => sum + room.availableHours!, 0)) : "Não comprovadas";
  const cards: { label: string; value: string; tone: "blue" | "violet" | "amber" | "emerald" | "rose" | "slate" }[] = [
    { label: "Ocupação geral", value: provenPercent(report.capacityHours, report.occupancyPercent), tone: report.capacityHours === null || report.occupancyPercent === null ? "slate" : "blue" },
    { label: "Horas ocupadas fisicamente", value: hours(report.physicalOccupiedHours), tone: "violet" },
    { label: "Horas disponíveis comprovadas", value: report.availableHours === null ? knownAvailable : hours(report.availableHours), tone: "emerald" },
    { label: "Capacidade comprovada", value: report.capacityHours === null ? knownCapacity : hours(report.capacityHours), tone: "blue" },
    { label: "Ambientes analisados", value: String(report.rooms.length), tone: "slate" },
    { label: "Gargalos", value: String(report.rooms.filter((r) => r.classification === "Bottleneck").length), tone: "rose" },
    { label: "Oportunidades", value: String(report.rooms.filter((r) => r.classification === "Opportunity").length), tone: "emerald" },
    { label: "Dias com ocupações", value: report.daysWithOccupations === undefined ? "Não informado" : String(report.daysWithOccupations), tone: "slate" },
    { label: "Pares de conflitos", value: String(report.conflictPairs), tone: report.conflictPairs ? "amber" : "slate" },
  ];
  return <section aria-label="Resumo do semestre" className="space-y-3">
    <SectionHeading title="Resumo do semestre" subtitle="Indicadores calculados somente com a capacidade e os registros disponíveis." />
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {cards.map((card) => <MetricCard key={card.label} {...card} />)}
    </div>
    {report.roomsWithUnknownCapacity > 0 && <Notice message={`${report.roomsWithUnknownCapacity} ambiente(s) sem capacidade comprovada. Capacidade e horas disponíveis acima cobrem apenas ${knownRooms.length} ambiente(s); o percentual geral está indeterminado. As horas físicas permanecem visíveis.`} />}
    {report.rooms.length === 0 && <Notice message="Nenhum ambiente cadastrado para este filtro." />}
    {report.rooms.length > 0 && report.physicalOccupiedHours === 0 && <p className="text-sm text-slate-600">Sem ocupações registradas neste semestre. Zero horas registradas não comprova disponibilidade quando falta configuração.</p>}
    <p className="muted">Dias disponíveis, total de capacidades e capacidades sem ambiente não são fornecidos por esta consulta de indicadores.</p>
    {report.outsideCapacityHours !== null && report.outsideCapacityHours > 0 && <p className="text-sm text-amber-800">Uso físico fora da capacidade letiva: {hours(report.outsideCapacityHours)}. Essas horas não entram no percentual.</p>}
    {report.warnings.map((warning) => <p key={warning} className="text-sm text-amber-800">{warning}</p>)}
  </section>;
}

function RoomLine({ room, code, onTimeline }: { room: RoomIndicator; code?: string | null; onTimeline: (roomId: number) => void }) {
  return <div className="rounded-panel border border-line bg-navy-900/60 p-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <div><b className="text-ink">{code ? `${code} · ` : ""}{room.roomName}</b><span className="ml-2 text-muted-ink">{roomKind(room.kind)}</span></div>
      <span className={`pill ${room.capacityHours === null ? "bg-navy-800 text-ink" : room.classification === "Bottleneck" ? "bg-rose-950 text-rose-200" : room.classification === "Opportunity" ? "bg-emerald-950 text-emerald-200" : "bg-navy-800 text-ink"}`}>{provenPercent(room.capacityHours, room.occupancyPercent)} · {room.capacityHours === null ? status.Unknown : status[room.classification]}</span>
    </div>
    {room.capacityHours !== null && room.occupancyPercent !== null && <div role="img" aria-label={`${room.roomName}: ${percent(room.occupancyPercent)}`} className="h-2.5 rounded-full bg-navy-800 overflow-hidden">
      <div className={`h-full rounded-full ${tone[room.classification]}`} style={{ width: `${Math.max(0, Math.min(100, room.occupancyPercent))}%` }} />
    </div>}
    {room.capacityHours === null && <p className="mt-2 text-xs text-amber-800">Capacidade não configurada ou não comprovada.</p>}
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-ink">
      <span>Ocupadas: {hours(room.physicalOccupiedHours)}</span><span>Capacidade: {hours(room.capacityHours)}</span><span>Disponíveis: {hours(room.availableHours)}</span>
      {room.daysWithOccupations !== undefined && <span>Dias com ocupações: {room.daysWithOccupations}</span>}
      {room.unoccupiedSlots !== undefined && room.unoccupiedSlots !== null && <span>Turnos livres: {room.unoccupiedSlots}</span>}
      {room.outsideCapacityHours !== null && room.outsideCapacityHours > 0 && <span>Fora da capacidade letiva: {hours(room.outsideCapacityHours)}</span>}
      {room.unclassifiedOccupations > 0 && <span>{room.unclassifiedOccupations} ocupação(ões) sem turno classificável</span>}
      <button type="button" className="text-sky-300 font-semibold underline focus-visible:outline focus-visible:outline-2" onClick={() => onTimeline(room.roomId)}>Ver cronograma</button>
    </div>
    {room.shifts.length > 0 && <div className="grid gap-2 sm:grid-cols-3" aria-label={`Ocupação por turno de ${room.roomName}`}>
      {room.shifts.map((shift) => <div key={shift.shiftId} className="text-xs">
        <div className="flex justify-between gap-2"><span>{shift.shiftName}</span><span>{provenPercent(shift.capacityHours, shift.occupancyPercent)}</span></div>
        <div className="mt-1 h-2 rounded-full bg-navy-800 overflow-hidden">{shift.capacityHours !== null && shift.occupancyPercent !== null &&
          <div className={`h-full ${shiftTone(shift.shiftName)}`} style={{ width: `${Math.max(0, Math.min(100, shift.occupancyPercent))}%` }} />}</div>
        <span className="text-muted-ink">{hours(shift.occupiedHours)} ocupadas · {hours(shift.availableHours)} disponíveis</span>
      </div>)}
    </div>}
  </div>;
}

export function OccupancyView({ report, onTimeline, onOpportunity, roomType = "", roomCodes = {} }: { report: SemesterIndicators; onTimeline: (roomId: number) => void; onOpportunity?: (roomId: number) => void; roomType?: string; roomCodes?: Record<number, string | null | undefined> }) {
  const rooms = orderedRooms(report.rooms.filter((room) => !roomType || room.kind === roomType));
  const shifts = shiftDistribution(report);
  const maxShiftHours = Math.max(1, ...shifts.map((shift) => shift.occupied));
  const maxMonthHours = Math.max(1, ...report.months.map((month) => month.physicalOccupiedHours));
  const bottlenecks = rooms.filter((r) => r.classification === "Bottleneck");
  const opportunities = rooms.filter((r) => r.classification === "Opportunity");
  const pending = rooms.filter((room) => room.capacityHours === null || room.unclassifiedOccupations > 0 || room.conflictPairs > 0 || room.warnings.length > 0);
  return <div className="space-y-5">
    <Summary report={report} />
    <Card className="p-5"><h3 className="section-title">Pendências gerenciais do período</h3>
      <p className="muted mt-1">Capacidade é a base de horas oferecidas para o cálculo. Equipamentos operacionais são avaliados separadamente na compatibilidade técnica.</p>
      {pending.length ? <ul className="mt-3 space-y-3">{pending.map((room) => <li key={room.roomId} className="text-sm border-t border-line pt-3">
        <strong>{room.roomName}</strong>
        {room.capacityHours === null && <p>Capacidade em horas não comprovada: configure ou revise os turnos oferecidos e o calendário.</p>}
        {room.unclassifiedOccupations > 0 && <p>{room.unclassifiedOccupations} ocupação(ões) sem turno identificável.</p>}
        {room.conflictPairs > 0 && <p>{room.conflictPairs} par(es) de conflitos registrados.</p>}
        {room.warnings.map((warning) => <p key={warning}>{warning}</p>)}
      </li>)}</ul> : <p className="muted mt-3">Nenhuma pendência indicada pelos dados deste relatório.</p>}
    </Card>
    <Card className="p-5"><h3 className="section-title">Ocupação por ambiente</h3>
      <p className="text-xs text-slate-600 mt-1">Percentual fornecido pela SG-23. Gargalo a partir de {percent(report.thresholds.bottleneckPercent)}; oportunidade abaixo de {percent(report.thresholds.opportunityPercent)}.</p>
      {roomType && <p className="text-xs text-muted-ink mt-1">O tipo refina esta lista e as oportunidades; o resumo acima permanece no escopo da consulta da API.</p>}
      <div className="mt-4 grid gap-3">{rooms.length ? rooms.map((room) => <RoomLine key={room.roomId} room={room} code={roomCodes[room.roomId]} onTimeline={onTimeline} />) : <p className="text-sm text-slate-600">Nenhum ambiente para exibir.</p>}</div>
    </Card>
    <div className="grid xl:grid-cols-2 gap-5">
      <Card className="p-5"><h3 className="section-title">Ocupação por turno</h3>
        <p className="text-xs text-slate-600 mt-1">Horas físicas dos turnos cadastrados. Capacidade e horas livres somente onde comprovadas.</p>
        {shifts.length ? shifts.map((shift) => <div key={shift.id} className="py-3 border-b border-slate-100 last:border-0 text-sm">
          <b>{shift.name}</b><p className="text-slate-600 mt-1">Ocupadas: {hours(shift.occupied)} · Disponíveis comprovadas: {shift.known ? hours(shift.available) : "Não comprovadas"}</p>
          <progress className="w-full h-2 mt-2 accent-sky-600" value={shift.occupied} max={maxShiftHours} aria-label={`${shift.name}: ${hours(shift.occupied)} ocupadas`} />
          {shift.unknown > 0 && <p className="text-xs text-amber-800">Capacidade parcial ou desconhecida em {shift.unknown} ambiente(s).</p>}
        </div>) : <p className="text-sm text-slate-600 mt-4">Sem distribuição por turno cadastrada.</p>}
      </Card>
      <Card className="p-5"><h3 className="section-title">Evolução da ocupação</h3>
        <p className="text-xs text-slate-600 mt-1">Horas programadas/ocupadas no período; datas futuras são registros, não aulas já realizadas.</p>
        {report.months.length ? report.months.map((month) => <div key={`${month.year}-${month.month}`} className="flex justify-between gap-3 py-3 border-b border-slate-100 last:border-0 text-sm">
          <div className="w-full"><div className="flex justify-between gap-3"><span className="capitalize">{new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(month.year, month.month - 1, 1))}</span>
            <b>{hours(month.physicalOccupiedHours)}</b></div>
            <progress className="w-full h-2 mt-2 accent-sky-600" value={month.physicalOccupiedHours} max={maxMonthHours} aria-label={`${month.month}/${month.year}: ${hours(month.physicalOccupiedHours)}`} /></div>
        </div>) : <p className="text-sm text-slate-600 mt-4">Sem distribuição mensal disponível.</p>}
      </Card>
    </div>
    <div className="grid xl:grid-cols-2 gap-5">
      <Card className="p-5"><h3 className="section-title">Gargalos</h3>
        {bottlenecks.length ? bottlenecks.map((room) => <div key={room.roomId} className="py-3 border-b border-slate-100 text-sm">
          <b>{room.roomName} · {percent(room.occupancyPercent)}</b><p className="text-slate-600 mt-1">Ocupadas: {hours(room.physicalOccupiedHours)} · Disponíveis: {hours(room.availableHours)}</p>
          <p className="text-slate-600">Turnos em uso: {room.shifts.filter((s) => s.occupiedHours > 0).sort((a, b) => b.occupiedHours - a.occupiedHours).map((s) => s.shiftName).join(", ") || "sem dados"}</p>
          <button type="button" className="text-skybrand-700 underline mt-1" onClick={() => onTimeline(room.roomId)}>Ver cronograma</button>
        </div>) : <p className="text-sm text-slate-600 mt-4">Nenhum gargalo classificado.</p>}
      </Card>
      <Card className="p-5"><h3 className="section-title">Oportunidades de utilização</h3>
        <p className="muted mt-1">Horas livres indicam potencial de uso. A oferta de um curso depende da análise dos requisitos técnicos e das datas.</p>
        {opportunities.length ? opportunities.map((room) => <div key={room.roomId} className="py-3 border-b border-slate-100 text-sm">
          <b>{room.roomName} · {roomKind(room.kind)} · {percent(room.occupancyPercent)}</b>
          <p className="text-slate-600 mt-1">Disponíveis: {hours(room.availableHours)}</p>
          <p className="text-slate-600">Turnos com horas livres comprovadas: {room.shifts.filter((s) => s.availableHours !== null && s.availableHours > 0).map((s) => s.shiftName).join(", ") || "sem dados"}</p>
          <button type="button" className="text-sky-300 underline mt-1" onClick={() => onTimeline(room.roomId)}>Ver cronograma</button>
          {onOpportunity && <button type="button" className="text-sky-300 underline mt-1 ml-4" onClick={() => onOpportunity(room.roomId)}>Analisar oportunidades</button>}
        </div>) : <p className="text-sm text-slate-600 mt-4">Nenhuma oportunidade classificada.</p>}
      </Card>
    </div>
  </div>;
}

export function ComparisonView({ first, second, firstName, secondName }: SemesterComparison & { firstName: string; secondName: string }) {
  const change = variationPoints(first, second);
  return <Card className="p-5"><h3 className="section-title">Comparação entre semestres</h3>
    <p className="text-xs text-slate-600 mt-1">Cada semestre usa sua própria capacidade e configuração de turnos.</p>
    <div className="grid sm:grid-cols-2 gap-4 mt-4">{[[firstName, first], [secondName, second]].map(([name, value]) => {
      const report = value as SemesterIndicators;
      return <div key={name as string} className="rounded-panel border border-line bg-navy-900/60 p-4 text-sm space-y-2"><b className="text-base">{name as string}</b>
        <p>Ocupação: {provenPercent(report.capacityHours, report.occupancyPercent)}</p><p>Horas ocupadas: {hours(report.physicalOccupiedHours)}</p>
        <p>Horas disponíveis: {hours(report.availableHours)}</p><p>Capacidade: {hours(report.capacityHours)}</p>
        <p>Ambientes analisados: {report.rooms.length}</p><p>Sem capacidade comprovada: {report.roomsWithUnknownCapacity}</p>
        {report.capacityHours !== null && report.occupancyPercent !== null && <div role="img" aria-label={`${name as string}: ocupação ${percent(report.occupancyPercent)}`} className="h-2.5 rounded-full bg-navy-800 overflow-hidden">
          <div className="h-full bg-sky-500" style={{ width: `${Math.max(0, Math.min(100, report.occupancyPercent))}%` }} />
        </div>}
      </div>;
    })}</div>
    <p className="text-sm text-slate-700 mt-4">Variação da taxa: {change === null ? "Indeterminada; falta base comparável completa." : `${change > 0 ? "+" : ""}${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(change)} ponto(s) percentuais`}</p>
  </Card>;
}

export function ManagerDashboard({ onTimeline, onOpportunity, onExport, admin = false }: { onTimeline: (semesterId: number, roomId: number) => void; onOpportunity: (semesterId: number, roomId: number) => void; onExport: (semesterId: number, secondSemesterId: number | null, roomId: number | null) => void; admin?: boolean }) {
  const { data, revision } = useData();
  const [configuring, setConfiguring] = useState(false);
  const [indicatorRevision, setIndicatorRevision] = useState(0);
  const [semesterId, setSemesterId] = useState("");
  const [roomType, setRoomType] = useState("");
  const [roomId, setRoomId] = useState("");
  const [secondId, setSecondId] = useState("");
  const [report, setReport] = useState<SemesterIndicators | null>(null);
  const [comparison, setComparison] = useState<SemesterComparison | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [comparedKey, setComparedKey] = useState("");
  const [error, setError] = useState("");
  const [compareError, setCompareError] = useState("");
  const [loading, setLoading] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const inventoryPending = data.rooms.filter((room) => (!roomId || room.id === Number(roomId)) &&
    room.computerGroups.some((group) => group.operationalQuantity == null));
  useEffect(() => {
    if (!semesterId && data.semesters.length) {
      const today = localDate(new Date());
      setSemesterId(String((data.semesters.find((s) => s.startDate <= today && today <= s.endDate) ?? data.semesters[0]).id));
    }
  }, [data.semesters, semesterId]);
  const key = `${semesterId}|${roomId}|${revision}|${indicatorRevision}`;
  const compareKey = `${semesterId}|${secondId}|${roomId}|${revision}|${indicatorRevision}`;
  useEffect(() => {
    let active = true;
    if (!semesterId) return;
    setLoading(true); setError(""); setReport(null); setLoadedKey("");
    const request = read<unknown>(indicatorPath(Number(semesterId), roomId ? Number(roomId) : undefined))
      .then((value) => { if (!isSemesterIndicators(value)) throw new Error("A API retornou indicadores incompletos."); return value; });
    void settleCurrent(request, () => active,
      (value) => { setReport(value); setLoadedKey(key); },
      (reason) => setError(indicatorErrorMessage(reason)), () => setLoading(false));
    return () => { active = false; };
  }, [key, semesterId, roomId]);
  useEffect(() => {
    let active = true;
    if (!semesterId || !secondId || semesterId === secondId) return;
    setCompareLoading(true); setCompareError(""); setComparison(null); setComparedKey("");
    const request = read<unknown>(comparisonPath(Number(semesterId), Number(secondId), roomId ? Number(roomId) : undefined))
      .then((value) => { const result = value as SemesterComparison; if (!result || !isSemesterIndicators(result.first) || !isSemesterIndicators(result.second)) throw new Error("A API retornou uma comparação incompleta."); return result; });
    void settleCurrent(request, () => active,
      (value) => { setComparison(value); setComparedKey(compareKey); },
      (reason) => setCompareError(indicatorErrorMessage(reason)), () => setCompareLoading(false));
    return () => { active = false; };
  }, [compareKey, semesterId, secondId, roomId]);
  return <div className="mt-6 space-y-5">
    <SectionHeading title="Dashboard gerencial de ocupação"
      subtitle="Indicadores oficiais para as ocupações registradas no semestre. Valores sem base comprovada são identificados explicitamente."
      action={<button type="button" className="btn-secondary" disabled={!semesterId} onClick={() => onExport(Number(semesterId), secondId ? Number(secondId) : null, roomId ? Number(roomId) : null)}>Exportar relatórios</button>} />
    <FilterBar actions={admin ? <button type="button" className="btn-secondary" disabled={!semesterId} onClick={() => setConfiguring(true)}>Configurar turnos oferecidos</button> : undefined}>
      <Field label="Semestre"><select className="field" value={semesterId} onChange={(e) => { setSemesterId(e.target.value); if (e.target.value === secondId) setSecondId(""); }}>
        <option value="">Selecione</option>{data.semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select></Field>
      <Field label="Tipo de ambiente (lista)"><select className="field" value={roomType} onChange={(e) => {
        setRoomType(e.target.value);
        if (roomId && data.rooms.find((room) => room.id === Number(roomId))?.kind !== e.target.value) setRoomId("");
      }}>
        <option value="">Todos</option>{[...new Set(data.rooms.map((room) => room.kind))].map((kind) =>
          <option key={kind} value={kind}>{roomKind(kind)}</option>)}
      </select></Field>
      <Field label="Ambiente"><select className="field" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
        <option value="">Todos</option>{data.rooms.filter((r) => !roomType || r.kind === roomType).map((r) => <option key={r.id} value={r.id}>{r.code ? `${r.code} · ` : ""}{r.name}</option>)}
      </select></Field>
    </FilterBar>
    {inventoryPending.length > 0 && <Notice type="info" message={`Quantidade operacional de computadores não informada em: ${inventoryPending.map((room) => room.name).join(", ")}. Confira o inventário em Ambientes; o cadastro de máquinas não comprova adequação técnica.`} />}
    {admin && configuring && semesterId && <Modal title="Turnos oferecidos por ambiente" onClose={() => setConfiguring(false)}>
      <OperatingShiftEditor key={semesterId} semesterId={Number(semesterId)} roomId={roomId} onSaved={() => setIndicatorRevision((value) => value + 1)} />
    </Modal>}
    {!data.semesters.length && <Notice message="Nenhum semestre cadastrado para consultar." />}
    {error && <Notice type="error" message={error} />}
    {loading && <Busy />}
    {report && loadedKey === key && !loading && !error && <OccupancyView report={report} roomType={roomType}
      roomCodes={Object.fromEntries(data.rooms.map((room) => [room.id, room.code]))}
      onTimeline={(selectedRoom) => onTimeline(Number(semesterId), selectedRoom)} onOpportunity={(selectedRoom) => onOpportunity(Number(semesterId), selectedRoom)} />}
    <Card className="p-5"><Field label="Comparar com outro semestre"><select className="field" value={secondId} onChange={(e) => setSecondId(e.target.value)}>
      <option value="">Selecione</option>{data.semesters.filter((s) => String(s.id) !== semesterId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select></Field></Card>
    {secondId && compareLoading && <Busy />}
    {secondId && compareError && <Notice type="error" message={compareError} />}
    {secondId && comparison && comparedKey === compareKey && !compareLoading && !compareError && <ComparisonView {...comparison}
      firstName={data.semesters.find((s) => String(s.id) === semesterId)?.name ?? semesterId}
      secondName={data.semesters.find((s) => String(s.id) === secondId)?.name ?? secondId} />}
    {!secondId && <p className="text-sm text-slate-600">{data.semesters.length < 2 ? "Não há outro semestre cadastrado para comparar." : "Selecione outro semestre para comparar."}</p>}
  </div>;
}
