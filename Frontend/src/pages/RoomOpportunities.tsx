import { useEffect, useRef, useState } from "react";
import { read } from "../lib/api";
import { useData } from "../lib/data";
import { indicatorErrorMessage, indicatorPath, isSemesterIndicators, orderedRooms,
  type SemesterIndicators } from "../lib/occupancyIndicators";
import { capabilitiesPath, periodsPath, validCapabilities, validPeriods,
  type CapabilityOpportunity, type OpportunityPeriods } from "../lib/roomOpportunities";
import { dateBR, localDate, roomKind } from "../lib/utils";
import { Busy, Card, Field, Notice, Title } from "../components/UI";
import type { Course } from "../types";

const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const className = { Compatible: "Compatível", Partial: "Parcialmente compatível", Incompatible: "Incompatível" };
const dayName = { Potential: "Potencialmente livre", Occupied: "Ocupado", NotEligible: "Não elegível", NotOffered: "Turno não oferecido" };
const number = (value: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);

export function RoomOpportunities({ initial, onTimeline }: {
  initial?: { semesterId: number; roomId: number } | null;
  onTimeline: (semesterId: number, roomId: number, anchor?: string, shiftId?: number) => void;
}) {
  const { data } = useData();
  const [semesterId, setSemesterId] = useState(String(initial?.semesterId ?? ""));
  const [roomId, setRoomId] = useState(String(initial?.roomId ?? ""));
  const [courseId, setCourseId] = useState("");
  const [students, setStudents] = useState("1");
  const [courses, setCourses] = useState<Course[]>([]);
  const [report, setReport] = useState<SemesterIndicators | null>(null);
  const [reportKey, setReportKey] = useState("");
  const [reportError, setReportError] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [coursesError, setCoursesError] = useState("");
  const [suggestions, setSuggestions] = useState<CapabilityOpportunity[] | null>(null);
  const [suggestionKey, setSuggestionKey] = useState("");
  const [suggestionError, setSuggestionError] = useState("");
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [capabilityId, setCapabilityId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [weekdaysMask, setWeekdaysMask] = useState(62);
  const [periods, setPeriods] = useState<OpportunityPeriods | null>(null);
  const [resultKey, setResultKey] = useState("");
  const [periodError, setPeriodError] = useState("");
  const [periodLoading, setPeriodLoading] = useState(false);
  const suggestionRequest = useRef(0);
  const periodRequest = useRef(0);
  const semester = data.semesters.find((item) => String(item.id) === semesterId);
  const room = data.rooms.find((item) => String(item.id) === roomId);
  const scopeKey = `${semesterId}|${roomId}|${students}|${courseId}`;
  const periodKey = `${scopeKey}|${capabilityId}|${shiftId}|${from}|${to}|${weekdaysMask}`;
  const visibleSuggestions = suggestionKey === scopeKey ? suggestions : null;
  const visiblePeriods = resultKey === periodKey ? periods : null;
  const selected = visibleSuggestions?.find((item) => String(item.capabilityId) === capabilityId);

  useEffect(() => {
    if (!semesterId && data.semesters.length) {
      const today = localDate(new Date());
      setSemesterId(String((data.semesters.find((item) => item.startDate <= today && today <= item.endDate) ?? data.semesters[0]).id));
    }
  }, [data.semesters, semesterId]);
  useEffect(() => {
    if (semester) { setFrom(semester.startDate); setTo(semester.endDate); }
  }, [semester?.id]);
  useEffect(() => {
    let active = true;
    read<Course[]>("/courses").then((result) => { if (active) setCourses(result); })
      .catch((error: unknown) => { if (active) setCoursesError(indicatorErrorMessage(error)); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    setReport(null); setReportKey(""); setReportError("");
    if (!semesterId) return;
    setReportLoading(true);
    read<unknown>(indicatorPath(Number(semesterId)))
      .then((result) => {
        if (!isSemesterIndicators(result)) throw new Error("Indicadores incompletos retornados pela API.");
        if (active) { setReport(result); setReportKey(semesterId); }
      }).catch((error: unknown) => { if (active) setReportError(indicatorErrorMessage(error)); })
      .finally(() => { if (active) setReportLoading(false); });
    return () => { active = false; };
  }, [semesterId]);
  useEffect(() => {
    suggestionRequest.current++;
    periodRequest.current++;
    setSuggestions(null); setSuggestionKey(""); setCapabilityId(""); setSuggestionError(""); setSuggestionLoading(false);
    setPeriods(null); setResultKey(""); setPeriodError(""); setPeriodLoading(false);
  }, [scopeKey]);
  useEffect(() => {
    periodRequest.current++;
    setPeriods(null); setResultKey(""); setPeriodError(""); setPeriodLoading(false);
  }, [periodKey]);

  async function findCapabilities() {
    const count = Number(students);
    if (!report || reportKey !== semesterId || !room || !Number.isInteger(count) || count < 1 || count > 1000) {
      setSuggestionError("Selecione semestre e ambiente e informe de 1 a 1000 alunos."); return;
    }
    const current = ++suggestionRequest.current;
    setSuggestions(null); setSuggestionKey(""); setCapabilityId(""); setSuggestionError(""); setSuggestionLoading(true);
    try {
      const result = await read<unknown>(capabilitiesPath(Number(semesterId), room.id, count,
        courseId ? Number(courseId) : undefined));
      if (!validCapabilities(result))
        throw new Error("A API retornou capacidades incompletas.");
      if (current === suggestionRequest.current) { setSuggestions(result); setSuggestionKey(scopeKey); }
    } catch (error) { if (current === suggestionRequest.current) setSuggestionError(indicatorErrorMessage(error)); }
    finally { if (current === suggestionRequest.current) setSuggestionLoading(false); }
  }

  async function analyze() {
    const count = Number(students);
    if (!room || !semester || !selected || !shiftId || !from || !to || from > to ||
      from < semester.startDate || to > semester.endDate || weekdaysMask === 0 ||
      !Number.isInteger(count) || count < 1 || count > 1000) {
      setPeriodError("Selecione capacidade, turno, datas dentro do semestre e dias da semana válidos."); return;
    }
    const current = ++periodRequest.current;
    setPeriods(null); setResultKey(""); setPeriodError(""); setPeriodLoading(true);
    try {
      const result = await read<unknown>(periodsPath(semester.id, room.id, selected.capabilityId,
        Number(shiftId), count, from, to, weekdaysMask));
      if (!validPeriods(result)) throw new Error("A API retornou uma análise incompleta.");
      if (current === periodRequest.current) { setPeriods(result); setResultKey(periodKey); }
    } catch (error) { if (current === periodRequest.current) setPeriodError(indicatorErrorMessage(error)); }
    finally { if (current === periodRequest.current) setPeriodLoading(false); }
  }

  const rows = report && reportKey === semesterId ? orderedRooms(report.rooms) : [];
  return <div className="space-y-5">
    <Title title="Oportunidades de Ambientes" subtitle="Análise técnica e de períodos para a coordenação. Nenhuma consulta cria reserva." />
    <Card className="p-5 space-y-4"><div className="grid sm:grid-cols-2 gap-3">
      <Field label="Semestre"><select className="field" value={semesterId} onChange={(event) => { setSemesterId(event.target.value); setRoomId(""); }}>
        <option value="">Selecione</option>{data.semesters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></Field>
      <Field label="Ambiente"><select className="field" value={roomId} onChange={(event) => setRoomId(event.target.value)}>
        <option value="">Selecione</option>{rows.map((item) => <option key={item.roomId} value={item.roomId}>{item.roomName}</option>)}
      </select></Field>
    </div>
      {!data.semesters.length && <Notice message="Nenhum semestre cadastrado." />}
      {reportLoading && <Busy />}{reportError && <Notice type="error" message={reportError} />}
      {report && reportKey === semesterId && rows.length === 0 && <Notice message="Nenhum ambiente cadastrado." />}
      {rows.length > 0 && !rows.some((item) => item.classification === "Opportunity") && <p className="text-sm text-slate-600">Nenhum ambiente classificado como oportunidade pela SG-23 neste semestre. Os demais continuam disponíveis para análise técnica.</p>}
      {rows.length > 0 && <div className="max-h-52 overflow-y-auto border-t border-slate-100 pt-2">
        {rows.map((item) => <button key={item.roomId} type="button" onClick={() => setRoomId(String(item.roomId))}
          className={`block w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 ${roomId === String(item.roomId) ? "bg-sky-50" : ""}`}>
          <b>{item.roomName}</b> · {roomKind(item.kind)} · {item.occupancyPercent === null ? "Ocupação indeterminada" : `${number(item.occupancyPercent)}%`} · {item.availableHours === null ? "Horas livres não comprovadas" : `${number(item.availableHours)} h livres`} · {item.classification === "Opportunity" ? "Oportunidade SG-23" : item.classification === "Bottleneck" ? "Gargalo SG-23" : "Sem classificação de oportunidade"}
          <span className="block text-xs text-slate-600 mt-1">Turnos oferecidos com capacidade comprovada: {item.shifts.filter((shift) => shift.capacityHours !== null).map((shift) => shift.shiftName).join(", ") || "não comprovados"}</span>
        </button>)}
      </div>}
      {room && reportKey === semesterId && <button type="button" className="btn-secondary" onClick={() => onTimeline(Number(semesterId), room.id)}>Ver cronograma do ambiente</button>}
    </Card>
    {room && reportKey === semesterId && <>
      <Card className="p-5 space-y-3"><h2 className="section-title">Atividades pedagógicas cadastradas</h2>
        <p className="text-sm text-slate-600">A compatibilidade da lista considera os recursos até o fim do semestre; a análise de períodos reavalia a data final. Uma capacidade compatível não comprova a viabilidade de um curso inteiro.</p>
        <div className="grid sm:grid-cols-2 gap-3"><Field label="Alunos"><input className="field" type="number" min="1" max="1000" value={students} onChange={(event) => setStudents(event.target.value)} /></Field>
          <Field label="Curso"><select className="field" value={courseId} onChange={(event) => setCourseId(event.target.value)}><option value="">Todos</option>{courses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></div>
        {coursesError && <Notice type="error" message={coursesError} />}
        <button type="button" className="btn-primary" onClick={() => void findCapabilities()} disabled={suggestionLoading}>Buscar atividades</button>
        {suggestionLoading && <Busy />}{suggestionError && <Notice type="error" message={suggestionError} />}
        {visibleSuggestions?.length === 0 && <Notice message="Nenhuma capacidade cadastrada neste filtro." />}
        {visibleSuggestions && visibleSuggestions.length > 0 && <div className="max-h-80 overflow-y-auto space-y-2">{visibleSuggestions.map((item) => <button type="button" key={item.capabilityId}
          onClick={() => setCapabilityId(String(item.capabilityId))} className={`block w-full text-left border rounded-xl p-3 text-sm focus-visible:outline focus-visible:outline-2 ${capabilityId === String(item.capabilityId) ? "border-sky-500 bg-sky-50" : "border-slate-200"}`}>
          <b>{item.description}</b><span className="block text-xs text-slate-600 mt-1">{item.courseName} · {item.unitName} · CH {number(item.requiredHours)} h · {className[item.classification]}</span>
        </button>)}</div>}
        {selected && <div className="rounded-xl bg-slate-50 p-4 text-sm"><b>{className[selected.classification]}</b>
          <p className="mt-1 text-slate-600">Recursos e limitações avaliados pela SG-14:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">{selected.findings.map((finding, index) => <li key={`${finding.requirement}-${index}`}>
            {finding.detail} · {finding.status === "Met" ? "atendido" : finding.status === "Unknown" ? "não comprovado" : "requer atenção"}</li>)}</ul>
        </div>}
      </Card>
      {selected && <Card className="p-5 space-y-3"><h2 className="section-title">Períodos concretos para análise</h2>
        <div className="grid sm:grid-cols-3 gap-3"><Field label="Início"><input className="field" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
          <Field label="Fim"><input className="field" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
          <Field label="Turno"><select className="field" value={shiftId} onChange={(event) => setShiftId(event.target.value)}><option value="">Selecione</option>{data.shifts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.startsAt.slice(0, 5)}–{item.endsAt.slice(0, 5)}</option>)}</select></Field></div>
        <fieldset><legend className="text-sm font-medium text-slate-700">Dias da semana</legend><div className="flex flex-wrap gap-3 mt-2">{weekdays.map((day, index) => <label key={day} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={(weekdaysMask & (1 << index)) !== 0}
          onChange={() => setWeekdaysMask((current) => current ^ (1 << index))} />{day}</label>)}</div></fieldset>
        <button type="button" className="btn-primary" onClick={() => void analyze()} disabled={periodLoading}>Analisar período</button>
        {periodLoading && <Busy />}{periodError && <Notice type="error" message={periodError} />}
        {visiblePeriods && <div className="space-y-3"><div className="rounded-xl bg-slate-50 p-4 text-sm">
          <p>CH pedagógica: <b>{number(visiblePeriods.pedagogicalHours)} h</b> · Turno: <b>{number(visiblePeriods.shiftHours)} h</b></p>
          <p>Encontros estimados: <b>{visiblePeriods.requiredMeetings}</b> · Ocupação física estimada: <b>{number(visiblePeriods.physicalHours)} h</b></p>
          <p>Turnos sem ocupação registrada: <b>{visiblePeriods.potentiallyFreeMeetings}</b> · Adequados tecnicamente: <b>{visiblePeriods.suitableMeetings}</b></p>
        </div>
          {visiblePeriods.availability === "UnknownCapacity" ? <Notice message="Disponibilidade indeterminada: capacidade ou turno oferecido não comprovado para este ambiente." /> :
            visiblePeriods.dates.length === 0 ? <Notice message="Nenhuma data encontrada nos dias selecionados." /> :
              <div className="max-h-80 overflow-y-auto space-y-1">{visiblePeriods.dates.map((day) => <div key={day.date} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2 text-sm"><span>{dateBR(day.date)}</span><span>{dayName[day.status]} · {day.detail}</span></div>)}</div>}
          {visiblePeriods.availability === "Known" && visiblePeriods.potentiallyFreeMeetings === 0 && <Notice message="Nenhum turno potencialmente livre neste filtro." />}
          {visiblePeriods.availability === "Known" && visiblePeriods.compatibility === "Compatible" && <p className="text-sm text-slate-700">{visiblePeriods.suitableMeetings >= visiblePeriods.requiredMeetings ? "Há encontros potencialmente suficientes neste filtro; cada data ainda exige confirmação." : "Os encontros adequados neste filtro não cobrem a quantidade estimada."}</p>}
          {visiblePeriods.compatibility !== "Compatible" && <Notice message="A adequação técnica não foi comprovada. Analise os recursos antes de planejar o uso." />}
          <p className="text-sm text-slate-600">A disponibilidade do professor e da turma não foi verificada. Datas livres exigem revalidação no fluxo oficial de Reservas.</p>
        </div>}
        <button type="button" className="btn-secondary" onClick={() => onTimeline(Number(semesterId), room.id, from || undefined, shiftId ? Number(shiftId) : undefined)}>Ver cronograma</button>
      </Card>}
    </>}
  </div>;
}
