import { useEffect, useState } from "react";
import { read } from "../lib/api";
import { useData } from "../lib/data";
import { comparisonPath, indicatorErrorMessage, indicatorPath, isBottleneck, isSemesterIndicators, orderedRooms, settleCurrent, shiftColor, shiftDistribution, variationPoints,
  type RoomIndicator, type SemesterComparison, type SemesterIndicators } from "../lib/occupancyIndicators";
import { dateBR, localDate, roomKind } from "../lib/utils";
import { Busy, Field, Modal, Notice } from "./UI";
import { OperatingShiftEditor } from "./OperatingShiftEditor";
import { OccupancyBar, OccupancyLegend } from "./OccupancyBar";
import { PageHeading, Panel, SenaiScope, StatCard } from "./senai/SenaiUI";
import { BarChart3, Lightbulb, TrendingUp } from "lucide-react";

const hours = (value: number | null) => value === null ? "Não comprovada" :
  `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)} h`;
const percent = (value: number | null) => value === null ? "Indeterminado" :
  `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}%`;
const provenPercent = (capacity: number | null, value: number | null) => percent(capacity === null || capacity <= 0 || value === null || !Number.isFinite(value) ? null : value);
const status = { Bottleneck: "Gargalo", Opportunity: "Oportunidade", Intermediate: "Intermediária", Unknown: "Percentual indeterminado" };

function Summary({ report, semesterName }: { report: SemesterIndicators; semesterName?: string }) {
  const knownRooms = report.rooms.filter((room) => room.capacityHours !== null && room.availableHours !== null);
  const knownCapacity = knownRooms.length ? hours(knownRooms.reduce((sum, room) => sum + room.capacityHours!, 0)) : "Não comprovada";
  const knownAvailable = knownRooms.length ? hours(knownRooms.reduce((sum, room) => sum + room.availableHours!, 0)) : "Não comprovadas";
  const capacityWarning = report.roomsWithUnknownCapacity > 0
    ? `${report.roomsWithUnknownCapacity} ambiente(s) sem capacidade comprovada; o percentual geral está indeterminado. Base parcial de ${knownRooms.length} ambiente(s): ${knownCapacity} de capacidade e ${knownAvailable} disponíveis. As horas físicas permanecem visíveis.` : "";
  useEffect(() => {
    if (capacityWarning) console.warn(capacityWarning);
  }, [capacityWarning]);
  const days = report.occupiedRoomDays ?? (report.rooms.every((room) => room.daysWithOccupations !== undefined)
    ? report.rooms.reduce((sum, room) => sum + room.daysWithOccupations!, 0) : undefined);
  const within = report.occupiedWithinCapacityHours ?? (report.capacityHours !== null && report.availableHours !== null ? report.capacityHours - report.availableHours : null);
  const bottlenecks = report.rooms.filter(isBottleneck).length;
  const opportunities = report.rooms.filter((room) => room.capacityHours !== null && room.classification === "Opportunity").length;
  return <section aria-label="Resumo do semestre" className="sg-stack">
    <h2 className="sr-only">{`Ocupação do semestre${semesterName ? ` · ${semesterName}` : ""}`}</h2>
    <div className="sg-stats">
      <StatCard label="Ocupação do semestre" value={provenPercent(report.capacityHours, report.occupancyPercent)} detail="Utilização da capacidade comprovada" />
      <StatCard label="Horas ocupadas" value={hours(report.capacityHours === null ? report.physicalOccupiedHours : within)} detail={report.capacityHours === null ? "Registros físicos; capacidade não configurada" : `De ${hours(report.capacityHours)} possíveis · Registros físicos: ${hours(report.physicalOccupiedHours)}`} />
      <StatCard tone="green" label="Horas ociosas" value={report.capacityHours === null || report.availableHours === null ? "Não comprovadas" : hours(report.availableHours)} detail="Capacidade sem ocupação; não significa desperdício" />
      <StatCard label="Dias-ambiente ocupados" value={days === undefined ? "Não informado" : String(days)} detail={report.eligibleRoomDays == null ? "Datas elegíveis não comprovadas" : `De ${report.eligibleRoomDays} dias-ambiente possíveis · ${report.occupiedEligibleRoomDays ?? "Não informado"} ocupados em datas elegíveis`} />
      <StatCard tone="amber" label="Gargalos" value={bottlenecks} detail={`${opportunities} oportunidade(s) de utilização classificada(s)`} />
      <StatCard tone="amber" label="Conflitos" value={report.conflictPairs} detail="Pares de ocupações em conflito" />
    </div>
    {report.rooms.length === 0 && <Notice message="Nenhum ambiente cadastrado para este filtro." />}
    {report.rooms.length > 0 && report.physicalOccupiedHours === 0 && <p className="sg-note">Sem ocupações registradas neste semestre. Zero horas registradas não comprova disponibilidade quando falta configuração.</p>}
    {report.outsideCapacityHours !== null && report.outsideCapacityHours > 0 && <p className="sg-warning">Uso físico fora da capacidade letiva: {hours(report.outsideCapacityHours)}. Essas horas não entram no percentual.</p>}
    {report.warnings.map((warning) => <p key={warning} className="sg-warning">{warning}</p>)}
  </section>;
}

type RoomDetails = { code?: string | null; seats?: number; location?: string };

const roomStatus = (room: RoomIndicator) => room.capacityHours === null || room.capacityHours <= 0 || room.occupancyPercent === null ? "Unknown" : room.classification;
const statusTone = { Bottleneck: "is-danger", Opportunity: "is-success", Intermediate: "is-primary", Unknown: "" };
const withinCapacity = (room: RoomIndicator) => room.occupiedWithinCapacityHours ?? (room.capacityHours !== null && room.availableHours !== null ? room.capacityHours - room.availableHours : null);

function RoomLine({ room, details, onTimeline }: { room: RoomIndicator; details: RoomDetails; onTimeline: (roomId: number) => void }) {
  const within = withinCapacity(room);
  return <div className="sg-room">
    <div className="sg-room-top">
      <b>{details.code ? `${details.code} · ` : ""}{room.roomName}</b>
      <span className={`sg-badge ${statusTone[roomStatus(room)]}`}>{provenPercent(room.capacityHours, room.occupancyPercent)} · {status[roomStatus(room)]}</span>
    </div>
    <OccupancyBar room={room} compact />
    {room.capacityHours === null && <p className="sg-warning">Capacidade não configurada ou não comprovada.</p>}
    <div className="sg-room-line">
      <span>{room.capacityHours === null ? `Registros físicos: ${hours(room.physicalOccupiedHours)}` : `${hours(within)} de ${hours(room.capacityHours)}`}{details.seats ? ` · ${details.seats} vagas` : ""} · {roomKind(room.kind)}</span>
      <span>Disponíveis: {hours(room.capacityHours === null ? null : room.availableHours)}</span>
    </div>
    <div className="sg-room-foot">
      <details>
        <summary>Detalhes do ambiente</summary>
        <div className="sg-detail-list">
          <span>Horas ocupadas na capacidade: {hours(room.capacityHours === null ? null : within)} / {hours(room.capacityHours)}</span>
          <span>Registros físicos: {hours(room.physicalOccupiedHours)}</span><span>Disponíveis: {hours(room.availableHours)}</span>
          {room.daysWithOccupations !== undefined && <span>Dias com ocupações: {room.daysWithOccupations}</span>}
          <span>Dias possíveis: {room.eligibleDays ?? "Não comprovados"}</span>
          <span>Dias livres: {room.unoccupiedDays ?? "Não comprovados"}</span>
          {room.occupiedEligibleDays != null && <span>Dias ocupados elegíveis: {room.occupiedEligibleDays}</span>}
          {room.unoccupiedSlots !== undefined && room.unoccupiedSlots !== null && <span>Turnos livres: {room.unoccupiedSlots}</span>}
          {room.outsideCapacityHours !== null && room.outsideCapacityHours > 0 && <span>Fora da capacidade letiva: {hours(room.outsideCapacityHours)}</span>}
          {room.unclassifiedOccupations > 0 && <span>{room.unclassifiedOccupations} ocupação(ões) sem turno classificável</span>}
        </div>
        <OccupancyLegend room={room} />
        {room.shifts.length > 0 && <div className="grid gap-2 py-2 sm:grid-cols-3" aria-label={`Ocupação por turno de ${room.roomName}`}>
          {room.shifts.map((shift) => <div key={shift.shiftId}>
            <p>{shift.shiftName} · Taxa individual: {provenPercent(shift.capacityHours, shift.occupancyPercent)}</p>
            <span>{hours(shift.occupiedHours)} ocupadas · {hours(shift.availableHours)} disponíveis</span>
          </div>)}
        </div>}
      </details>
      <button type="button" className="sg-link" onClick={() => onTimeline(room.roomId)}>Ver cronograma</button>
    </div>
  </div>;
}

export function OccupancyView({ report, onTimeline, onOpportunity, roomType = "", roomDetails = {}, roomCodes = {}, semesterName }: { report: SemesterIndicators; onTimeline: (roomId: number) => void; onOpportunity?: (roomId: number) => void; roomType?: string; roomDetails?: Record<number, RoomDetails>; roomCodes?: Record<number, string | null | undefined>; semesterName?: string }) {
  const rooms = orderedRooms(report.rooms.filter((room) => !roomType || room.kind === roomType));
  const detailsOf = (roomId: number): RoomDetails => ({ code: roomCodes[roomId], ...roomDetails[roomId] });
  const shifts = shiftDistribution(report);
  const shiftNames = [...new Set(rooms.flatMap((room) => room.shifts.map((shift) => shift.shiftName)))];
  const maxShiftHours = Math.max(1, ...shifts.map((shift) => shift.occupied));
  const bottlenecks = rooms.filter(isBottleneck);
  const opportunities = rooms.filter((r) => r.capacityHours !== null && r.capacityHours > 0 && r.occupancyPercent !== null && r.classification === "Opportunity");
  const pending = rooms.filter((room) => room.capacityHours === null || room.unclassifiedOccupations > 0 || room.conflictPairs > 0 || room.warnings.length > 0);
  return <div className="sg-stack">
    <Summary report={report} semesterName={semesterName} />
    <div className="sg-grid">
      <Panel title="Ocupação dos ambientes" subtitle={`Participação de cada turno na capacidade total. Gargalo acima de ${percent(report.thresholds.bottleneckPercent)}; oportunidade abaixo de ${percent(report.thresholds.opportunityPercent)}.`}
        action={<span className="sg-count">{report.rooms.length} ambientes analisados</span>}>
        {roomType && <p className="sg-note mb-2">O tipo refina esta lista e as oportunidades; o resumo acima permanece no escopo da consulta da API.</p>}
        {shiftNames.length > 0 && <ul className="sg-legend" aria-label="Legenda dos turnos">
          {shiftNames.map((name) => <li key={name}><i aria-hidden="true" style={{ backgroundColor: shiftColor(name) }} />{name}</li>)}
          <li><i aria-hidden="true" style={{ backgroundColor: "var(--color-shift-free)" }} />Livre</li>
        </ul>}
        {rooms.length ? <div className="sg-scroll" tabIndex={0} role="region" aria-label="Lista de ocupação por ambiente">
          {rooms.map((room) => <RoomLine key={room.roomId} room={room} details={detailsOf(room.roomId)} onTimeline={onTimeline} />)}
        </div> : <p className="sg-empty">Nenhum ambiente para exibir.</p>}
      </Panel>
      <div className="sg-stack">
        <Panel title="Oportunidades de utilização" subtitle="Horas livres indicam potencial de uso. A oferta de um curso depende da análise dos requisitos técnicos e das datas.">
          {opportunities.length ? <div className="sg-scroll">{opportunities.map((room) => <div key={room.roomId} className="sg-item">
            <span className="sg-item-icon"><Lightbulb size={19} aria-hidden="true" /></span>
            <div className="sg-item-text">
              <strong>{room.roomName}</strong>
              <small>Disponíveis: {hours(room.availableHours)} · {percent(room.occupancyPercent)} de ocupação · {roomKind(room.kind)}</small>
              <div className="sg-item-actions">
                <button type="button" className="sg-link" onClick={() => onTimeline(room.roomId)}>Ver cronograma</button>
                {onOpportunity && <button type="button" className="sg-link" onClick={() => onOpportunity(room.roomId)}>Analisar oportunidades</button>}
              </div>
            </div>
          </div>)}</div> : <p className="sg-empty">Nenhuma oportunidade classificada.</p>}
        </Panel>
        <Panel title="Gargalos">
          {bottlenecks.length ? <div className="sg-scroll">{bottlenecks.map((room) => <div key={room.roomId} className="sg-item">
            <span className="sg-item-icon is-danger"><TrendingUp size={19} aria-hidden="true" /></span>
            <div className="sg-item-text">
              <strong>{room.roomName} · {percent(room.occupancyPercent)}</strong>
              <small>Ocupadas: {hours(room.physicalOccupiedHours)} · Disponíveis: {hours(room.availableHours)}</small>
              <button type="button" className="sg-link" onClick={() => onTimeline(room.roomId)}>Ver cronograma</button>
            </div>
          </div>)}</div> : <p className="sg-empty">Nenhum gargalo classificado.</p>}
        </Panel>
      </div>
    </div>
    <Panel title="Ocupação por turno" subtitle="Horas físicas dos turnos cadastrados. Capacidade e horas livres somente onde comprovadas.">
      {shifts.length ? shifts.map((shift) => <div key={shift.id} className="sg-hbar">
        <span>{shift.name}</span>
        <progress value={shift.occupied} max={maxShiftHours} aria-label={`${shift.name}: ${hours(shift.occupied)} ocupadas`} />
        <b>{hours(shift.occupied)}</b>
        <small>Disponíveis comprovadas: {shift.known ? hours(shift.available) : "Não comprovadas"}</small>
        {shift.unknown > 0 && <small>Capacidade parcial ou desconhecida em {shift.unknown} ambiente(s).</small>}
      </div>) : <p className="sg-empty">Sem distribuição por turno cadastrada.</p>}
    </Panel>
    {rooms.length > 0 && <section className="card sg-panel">
      <div className="sg-panel-head">
        <div><h2>Detalhamento dos ambientes</h2><p>Capacidade, horas utilizadas e disponibilidade para a seleção atual.</p></div>
        <span className="sg-count">{rooms.length} ambientes</span>
      </div>
      <div className="sg-table-wrap" tabIndex={0} role="region" aria-label="Tabela de detalhamento dos ambientes">
        <table className="sg-table">
          <thead><tr>{["Ambiente", "Tipo", "Vagas", "Capacidade", "Ocupadas", "Disponíveis", "Ocupação"].map((title) => <th scope="col" key={title}>{title}</th>)}</tr></thead>
          <tbody>{rooms.map((room) => {
            const details = detailsOf(room.roomId);
            return <tr key={room.roomId}>
              <td><strong>{room.roomName}</strong><small>{[details.code, details.location].filter(Boolean).join(" · ")}</small></td>
              <td>{roomKind(room.kind)}</td>
              <td>{details.seats ?? "—"}</td>
              <td>{hours(room.capacityHours)}</td>
              <td>{hours(room.capacityHours === null ? room.physicalOccupiedHours : withinCapacity(room))}</td>
              <td>{hours(room.capacityHours === null ? null : room.availableHours)}</td>
              <td><span className={`sg-badge ${statusTone[roomStatus(room)]}`}>{provenPercent(room.capacityHours, room.occupancyPercent)}</span></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>}
    <details className="card sg-panel">
      <summary>Detalhes e pendências do semestre</summary>
      <div className="sg-panel-body sg-stack">
        <Panel title="Distribuição das datas ocupadas" subtitle={report.referenceDate ? `Data local da instituição: ${dateBR(report.referenceDate)}. Hoje é mostrado separadamente.` : "Data de referência não informada pela API."}>
          <dl className="sg-facts">
            {[["Datas passadas", report.pastOccupiedRoomDays], ["Hoje", report.todayOccupiedRoomDays], ["Datas futuras", report.futureOccupiedRoomDays], ["Datas elegíveis sem ocupação", report.unoccupiedRoomDays]].map(([label, value]) =>
              <div key={label}><dt>{label}</dt><dd>{value == null ? "Não informado" : `${value} dias-ambiente`}</dd></div>)}
          </dl>
          <p className="sg-note">Reservas em datas passadas não comprovam aulas realizadas. Datas sem ocupação não incluem dias indisponíveis ou turnos não ofertados.</p>
        </Panel>
        <Panel title="Pendências gerenciais do período" subtitle="Capacidade é a base de horas oferecidas para o cálculo. Equipamentos operacionais são avaliados separadamente na compatibilidade técnica.">
          {pending.length ? <ul>{pending.map((room) => <li key={room.roomId} className="sg-item"><div className="sg-item-text">
            <strong>{room.roomName}</strong>
            {room.capacityHours === null && <small>Capacidade em horas não comprovada: configure ou revise os turnos oferecidos e o calendário.</small>}
            {room.unclassifiedOccupations > 0 && <small>{room.unclassifiedOccupations} ocupação(ões) sem turno identificável.</small>}
            {room.conflictPairs > 0 && <small>{room.conflictPairs} par(es) de conflitos registrados.</small>}
            {room.warnings.map((warning) => <small key={warning}>{warning}</small>)}
          </div></li>)}</ul> : <p className="sg-empty">Nenhuma pendência indicada pelos dados deste relatório.</p>}
        </Panel>
      </div>
    </details>
  </div>;
}

export function ComparisonView({ first, second, firstName, secondName }: SemesterComparison & { firstName: string; secondName: string }) {
  const change = variationPoints(first, second);
  return <div>
    <h3 className="sr-only">Comparação entre semestres</h3>
    {[[firstName, first], [secondName, second]].map(([name, value]) => {
      const report = value as SemesterIndicators;
      const known = report.capacityHours !== null && report.occupancyPercent !== null;
      return <div key={name as string} className="sg-hbar">
        <span>{name as string}</span>
        {known ? <div role="img" aria-label={`${name as string}: ocupação ${percent(report.occupancyPercent)}`} className="sg-track">
          <i style={{ width: `${Math.max(0, Math.min(100, report.occupancyPercent!))}%` }} />
        </div> : <span />}
        <b>{provenPercent(report.capacityHours, report.occupancyPercent)}</b>
        <small>Horas ocupadas: {hours(report.physicalOccupiedHours)} · Disponíveis: {hours(report.availableHours)} · Capacidade: {hours(report.capacityHours)} · Ambientes analisados: {report.rooms.length} · Sem capacidade comprovada: {report.roomsWithUnknownCapacity}</small>
      </div>;
    })}
    <p className="sg-note">Variação da taxa: {change === null ? "Indeterminada; falta base comparável completa." : `${change > 0 ? "+" : ""}${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(change)} ponto(s) percentuais`}</p>
  </div>;
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
    room.computerGroups.some((group) => group.operationalQuantity == null)).map((room) => room.name).join(", ");
  useEffect(() => {
    if (inventoryPending) console.warn(`Quantidade operacional de computadores não informada em: ${inventoryPending}. Confira o inventário em Ambientes; o cadastro de máquinas não comprova adequação técnica.`);
  }, [inventoryPending]);
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
  const listedRooms = data.rooms.filter((room) => (!roomType || room.kind === roomType) && (!roomId || room.id === Number(roomId)));
  return <>
    <SenaiScope>
      <PageHeading title="Visão Geral" subtitle="Ocupação dos ambientes no semestre selecionado."
        action={<button type="button" className="btn-secondary" disabled={!semesterId} onClick={() => onExport(Number(semesterId), secondId ? Number(secondId) : null, roomId ? Number(roomId) : null)}>Exportar relatórios</button>} />
      <section aria-label="Filtros" className="sg-filters">
        <div className="sg-filters-title"><BarChart3 size={17} aria-hidden="true" /><strong>Visão do semestre</strong></div>
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
        <div className="sg-filters-end">
          <span className="sg-count">{listedRooms.length} ambiente(s) no filtro</span>
          <button type="button" className="btn-quiet" disabled={!semesterId || loading} onClick={() => setIndicatorRevision((value) => value + 1)}>Atualizar</button>
          {admin && <button type="button" className="btn-secondary" disabled={!semesterId} onClick={() => setConfiguring(true)}>Configurar turnos oferecidos</button>}
        </div>
      </section>
      {error && <Notice type="error" message={error} />}
      {loading && <Busy />}
      {report && loadedKey === key && !loading && !error && <OccupancyView report={report} roomType={roomType}
        semesterName={data.semesters.find((semester) => String(semester.id) === semesterId)?.name}
        roomDetails={Object.fromEntries(data.rooms.map((room) => [room.id, { code: room.code, seats: room.seats, location: room.location }]))}
        onTimeline={(selectedRoom) => onTimeline(Number(semesterId), selectedRoom)} onOpportunity={(selectedRoom) => onOpportunity(Number(semesterId), selectedRoom)} />}
      <Panel title="Comparativo entre semestres" subtitle="Cada semestre usa sua própria capacidade e configuração de turnos.">
        <Field label="Comparar com outro semestre" className="max-w-sm"><select className="field" value={secondId} onChange={(e) => setSecondId(e.target.value)}>
          <option value="">Selecione</option>{data.semesters.filter((s) => String(s.id) !== semesterId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></Field>
        <div className="mt-3">
          {secondId && compareLoading && <Busy />}
          {secondId && compareError && <Notice type="error" message={compareError} />}
          {secondId && comparison && comparedKey === compareKey && !compareLoading && !compareError && <ComparisonView {...comparison}
            firstName={data.semesters.find((s) => String(s.id) === semesterId)?.name ?? semesterId}
            secondName={data.semesters.find((s) => String(s.id) === secondId)?.name ?? secondId} />}
          {!secondId && <p className="sg-note">{data.semesters.length < 2 ? "Não há outro semestre cadastrado para comparar." : "Selecione outro semestre para comparar."}</p>}
        </div>
      </Panel>
    </SenaiScope>
    {admin && configuring && semesterId && <Modal title="Turnos oferecidos por ambiente" onClose={() => setConfiguring(false)}>
      <OperatingShiftEditor key={semesterId} semesterId={Number(semesterId)} roomId={roomId} onSaved={() => setIndicatorRevision((value) => value + 1)} />
    </Modal>}
  </>;
}
