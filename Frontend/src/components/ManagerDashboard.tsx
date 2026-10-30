import { useEffect, useState } from "react";
import { read } from "../lib/api";
import { useData } from "../lib/data";
import { comparisonPath, indicatorErrorMessage, indicatorPath, isSemesterIndicators, orderedRooms, settleCurrent, shiftDistribution, variationPoints,
  type RoomIndicator, type SemesterComparison, type SemesterIndicators } from "../lib/occupancyIndicators";
import { localDate, roomKind } from "../lib/utils";
import { Busy, Card, Field, Notice } from "./UI";

const hours = (value: number | null) => value === null ? "Não comprovada" :
  `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)} h`;
const percent = (value: number | null) => value === null ? "Indeterminado" :
  `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}%`;
const status = { Bottleneck: "Gargalo", Opportunity: "Oportunidade", Intermediate: "Intermediária", Unknown: "Percentual indeterminado" };
const tone = { Bottleneck: "bg-rose-600", Opportunity: "bg-emerald-600", Intermediate: "bg-sky-600", Unknown: "bg-slate-400" };

function Summary({ report }: { report: SemesterIndicators }) {
  const knownRooms = report.rooms.filter((room) => room.capacityHours !== null && room.availableHours !== null);
  const knownCapacity = knownRooms.length ? hours(knownRooms.reduce((sum, room) => sum + room.capacityHours!, 0)) : "Não comprovada";
  const knownAvailable = knownRooms.length ? hours(knownRooms.reduce((sum, room) => sum + room.availableHours!, 0)) : "Não comprovadas";
  const cards = [
    ["Ocupação geral", percent(report.occupancyPercent)],
    ["Horas ocupadas fisicamente", hours(report.physicalOccupiedHours)],
    ["Horas disponíveis comprovadas", report.availableHours === null ? knownAvailable : hours(report.availableHours)],
    ["Capacidade comprovada", report.capacityHours === null ? knownCapacity : hours(report.capacityHours)],
    ["Ambientes analisados", String(report.rooms.length)],
    ["Gargalos", String(report.rooms.filter((r) => r.classification === "Bottleneck").length)],
    ["Oportunidades", String(report.rooms.filter((r) => r.classification === "Opportunity").length)],
    ["Pares de conflitos", String(report.conflictPairs)],
  ];
  return <section aria-label="Resumo do semestre" className="space-y-3">
    <h3 className="section-title">Resumo do semestre</h3>
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      {cards.map(([label, value]) => <Card key={label} className="p-4"><p className="text-xs text-slate-600">{label}</p>
        <p className="mt-2 text-xl font-bold text-slate-800">{value}</p></Card>)}
    </div>
    {report.roomsWithUnknownCapacity > 0 && <Notice message={`${report.roomsWithUnknownCapacity} ambiente(s) sem capacidade comprovada. Capacidade e horas disponíveis acima cobrem apenas ${knownRooms.length} ambiente(s); o percentual geral está indeterminado. As horas físicas permanecem visíveis.`} />}
    {report.rooms.length === 0 && <Notice message="Nenhum ambiente cadastrado para este filtro." />}
    {report.rooms.length > 0 && report.physicalOccupiedHours === 0 && <p className="text-sm text-slate-600">Sem ocupações registradas neste semestre. Zero horas registradas não comprova disponibilidade quando falta configuração.</p>}
    {report.outsideCapacityHours !== null && report.outsideCapacityHours > 0 && <p className="text-sm text-amber-800">Uso físico fora da capacidade letiva: {hours(report.outsideCapacityHours)}. Essas horas não entram no percentual.</p>}
    {report.warnings.map((warning) => <p key={warning} className="text-sm text-amber-800">{warning}</p>)}
  </section>;
}

function RoomLine({ room, onTimeline }: { room: RoomIndicator; onTimeline: (roomId: number) => void }) {
  return <div className="py-3 border-b border-slate-100 last:border-0">
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <div><b className="text-slate-800">{room.roomName}</b><span className="ml-2 text-slate-500">{roomKind(room.kind)}</span></div>
      <span className="font-semibold text-slate-800">{percent(room.occupancyPercent)} · {status[room.classification]}</span>
    </div>
    {room.occupancyPercent !== null && <div role="img" aria-label={`${room.roomName}: ${percent(room.occupancyPercent)}`} className="mt-2 h-3 rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full rounded-full ${tone[room.classification]}`} style={{ width: `${Math.max(0, Math.min(100, room.occupancyPercent))}%` }} />
    </div>}
    {room.capacityHours === null && <p className="mt-2 text-xs text-amber-800">Capacidade não configurada ou não comprovada.</p>}
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
      <span>Ocupadas: {hours(room.physicalOccupiedHours)}</span><span>Disponíveis: {hours(room.availableHours)}</span>
      {room.outsideCapacityHours !== null && room.outsideCapacityHours > 0 && <span>Fora da capacidade letiva: {hours(room.outsideCapacityHours)}</span>}
      {room.unclassifiedOccupations > 0 && <span>{room.unclassifiedOccupations} ocupação(ões) sem turno classificável</span>}
      <button type="button" className="text-skybrand-700 font-semibold underline focus-visible:outline focus-visible:outline-2" onClick={() => onTimeline(room.roomId)}>Ver cronograma</button>
    </div>
  </div>;
}

export function OccupancyView({ report, onTimeline }: { report: SemesterIndicators; onTimeline: (roomId: number, shiftId?: number) => void }) {
  const rooms = orderedRooms(report.rooms);
  const shifts = shiftDistribution(report);
  const maxShiftHours = Math.max(1, ...shifts.map((shift) => shift.occupied));
  const maxMonthHours = Math.max(1, ...report.months.map((month) => month.physicalOccupiedHours));
  const bottlenecks = rooms.filter((r) => r.classification === "Bottleneck");
  const opportunities = rooms.filter((r) => r.classification === "Opportunity");
  return <div className="space-y-5">
    <Summary report={report} />
    <Card className="p-5"><h3 className="section-title">Ocupação por ambiente</h3>
      <p className="text-xs text-slate-600 mt-1">Percentual fornecido pela SG-23. Gargalo a partir de {percent(report.thresholds.bottleneckPercent)}; oportunidade abaixo de {percent(report.thresholds.opportunityPercent)}.</p>
      {rooms.length ? rooms.map((room) => <RoomLine key={room.roomId} room={room} onTimeline={onTimeline} />) : <p className="text-sm text-slate-600 mt-4">Nenhum ambiente para exibir.</p>}
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
        {opportunities.length ? opportunities.map((room) => <div key={room.roomId} className="py-3 border-b border-slate-100 text-sm">
          <b>{room.roomName} · {roomKind(room.kind)} · {percent(room.occupancyPercent)}</b>
          <p className="text-slate-600 mt-1">Disponíveis: {hours(room.availableHours)}</p>
          <p className="text-slate-600">Turnos com horas livres comprovadas: {room.shifts.filter((s) => s.availableHours !== null && s.availableHours > 0).map((s) => s.shiftName).join(", ") || "sem dados"}</p>
          <button type="button" className="text-skybrand-700 underline mt-1" onClick={() => onTimeline(room.roomId)}>Ver cronograma</button>
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
      return <div key={name as string} className="rounded-xl bg-slate-50 p-4 text-sm space-y-1"><b>{name as string}</b>
        <p>Ocupação: {percent(report.occupancyPercent)}</p><p>Horas ocupadas: {hours(report.physicalOccupiedHours)}</p>
        <p>Horas disponíveis: {hours(report.availableHours)}</p><p>Capacidade: {hours(report.capacityHours)}</p>
        <p>Ambientes analisados: {report.rooms.length}</p><p>Sem capacidade comprovada: {report.roomsWithUnknownCapacity}</p>
      </div>;
    })}</div>
    <p className="text-sm text-slate-700 mt-4">Variação da taxa: {change === null ? "Indeterminada; falta base comparável completa." : `${change > 0 ? "+" : ""}${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(change)} ponto(s) percentuais`}</p>
  </Card>;
}

export function ManagerDashboard({ onTimeline }: { onTimeline: (semesterId: number, roomId: number) => void }) {
  const { data } = useData();
  const [semesterId, setSemesterId] = useState("");
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
  useEffect(() => {
    if (!semesterId && data.semesters.length) {
      const today = localDate(new Date());
      setSemesterId(String((data.semesters.find((s) => s.startDate <= today && today <= s.endDate) ?? data.semesters[0]).id));
    }
  }, [data.semesters, semesterId]);
  const key = `${semesterId}|${roomId}`;
  const compareKey = `${semesterId}|${secondId}|${roomId}`;
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
    <div><h2 className="text-xl font-bold text-slate-800">Dashboard gerencial de ocupação</h2>
      <p className="text-sm text-slate-600 mt-1">Indicadores oficiais da SG-23 para ocupações registradas no semestre.</p></div>
    <Card className="p-5 grid sm:grid-cols-2 gap-3">
      <Field label="Semestre"><select className="field" value={semesterId} onChange={(e) => { setSemesterId(e.target.value); if (e.target.value === secondId) setSecondId(""); }}>
        <option value="">Selecione</option>{data.semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select></Field>
      <Field label="Ambiente"><select className="field" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
        <option value="">Todos</option>{data.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select></Field>
    </Card>
    {!data.semesters.length && <Notice message="Nenhum semestre cadastrado para consultar." />}
    {error && <Notice type="error" message={error} />}
    {loading && <Busy />}
    {report && loadedKey === key && !loading && !error && <OccupancyView report={report} onTimeline={(selectedRoom) => onTimeline(Number(semesterId), selectedRoom)} />}
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
