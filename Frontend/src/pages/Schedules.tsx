import { useEffect, useRef, useState } from "react";
import { CalendarCheck2, Sparkles, Send, AlertTriangle } from "lucide-react";
import { useData } from "../lib/data";
import { post, put, read } from "../lib/api";
import { dayNames, hour, resultMessage } from "../lib/utils";
import { Badge, Card, Empty, Field, FilterBar, Notice, SectionHeading, Title, useConfirmation } from "../components/UI";
import type { ScheduleDetails, User } from "../types";

export function Schedules({
  user,
  reloadAgenda,
  initialSemesterId = "",
  embedded = false,
}: {
  user: User;
  reloadAgenda: () => Promise<void>;
  initialSemesterId?: string;
  embedded?: boolean;
}) {
  const admin = user.roles.includes("Admin");
  const { data, reload } = useData();
  const ask = useConfirmation();
  const [semesterId, setSemesterId] = useState(initialSemesterId);
  const selectedSemester = useRef(initialSemesterId);
  const suggestionRequest = useRef(0);
  const [selected, setSelected] = useState("");
  const [details, setDetails] = useState<ScheduleDetails | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [shiftHours, setShiftHours] = useState<Record<number, string>>({});
  const [view, setView] = useState<"Turma" | "Semana" | "Semestre">("Turma");
  const [classFilter, setClassFilter] = useState("");
  const [weekDate, setWeekDate] = useState("");
  const [adjusting, setAdjusting] = useState<{ planId: number; meetingId: number | null;
    date: string; shiftId: string; roomId: string } | null>(null);
  const [alternatives, setAlternatives] = useState<{ date: string; shiftId: number;
    roomId: number | null; roomName: string | null; hours: number }[]>([]);
  const [adjustBlocks, setAdjustBlocks] = useState<string[]>([]);
  const schedules = data.schedules.filter(
    (s) => !semesterId || String(s.semesterId) === semesterId,
  );
  useEffect(() => {
    let active = true;
    setDetails(null);
    setAdjusting(null); setAlternatives([]);
    suggestionRequest.current++;
    if (selected)
      read<ScheduleDetails>(`/schedules/${selected}`)
        .then((value) => { if (active && String(value.id) === selected &&
          (!semesterId || String(value.semesterId) === semesterId)) {
            setDetails(value);
            setWeekDate(value.unitPlans?.flatMap((plan) => plan.meetings)
              .find((meeting) => meeting.date)?.date ?? "");
          } })
        .catch((e) => { if (active) setError(resultMessage(e)); });
    return () => { active = false; };
  }, [selected, semesterId]);
  async function saveShiftHours(shiftId: number) {
    const hours = Number(shiftHours[shiftId]);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24 || Math.round(hours * 100) !== hours * 100) return;
    setBusy(true); setError("");
    try {
      await put(`/shifts/${shiftId}/pedagogical-hours`, { hours });
      await reload();
      setSuccess("Carga pedagógica do turno registrada.");
    } catch (cause) { setError(resultMessage(cause)); }
    finally { setBusy(false); }
  }
  async function generate() {
    if (!semesterId) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const r = await post<{ id: number; unallocatedMeetings: number }>(
        `/schedules/generate/${semesterId}`,
      );
      await reload();
      setSelected(String(r.id));
      setSuccess(
        r.unallocatedMeetings
          ? `Grade gerada com ${r.unallocatedMeetings} pendência(s). Revise os cadastros antes de publicar.`
          : "Rascunho gerado. Revise antes de publicar.",
      );
    } catch (e) {
      setError(resultMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (
      !selected ||
      !details ||
      String(details.semesterId) !== semesterId ||
      !await ask({ title: "Publicar grade", message: "Os encontros presenciais serão adicionados à agenda; a programação EAD permanece sem sala física. A grade publicada não será substituída.", confirmLabel: "Publicar grade" }) ||
      selectedSemester.current !== String(details.semesterId)
    )
      return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await post(`/schedules/${selected}/publish`);
      await reload();
      setDetails(await read(`/schedules/${selected}`));
      await reloadAgenda();
      setSuccess("Grade publicada! As aulas foram adicionadas à agenda.");
    } catch (e) {
      setError(resultMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function suggest(planId: number, meetingId: number | null, from = "") {
    if (!selected || !details || String(details.semesterId) !== semesterId) return;
    const requestId = ++suggestionRequest.current;
    setAlternatives([]);
    try {
      const query = new URLSearchParams();
      if (meetingId != null) query.set("meetingId", String(meetingId));
      if (from) query.set("from", from);
      const options = await read<typeof alternatives>(
        `/schedules/${selected}/unit-plans/${planId}/alternatives?${query}`);
      if (suggestionRequest.current === requestId &&
        selectedSemester.current === String(details.semesterId)) setAlternatives(options);
    } catch (cause) { setError(resultMessage(cause)); }
  }
  function beginAdjustment(planId: number, meetingId: number | null,
    date: string, shiftId: number | null, roomId: number | null) {
    setAdjustBlocks([]);
    setAdjusting({ planId, meetingId, date: date || "", shiftId: shiftId ? String(shiftId) : "",
      roomId: roomId ? String(roomId) : "" });
    void suggest(planId, meetingId, date);
  }
  async function saveAdjustment() {
    if (!adjusting || !details || details.status !== "Rascunho" ||
      String(details.semesterId) !== semesterId || !adjusting.date || !adjusting.shiftId) return;
    const plan = details.unitPlans?.find((item) => item.id === adjusting.planId);
    if (!plan) return;
    const input = { meetingId: adjusting.meetingId, date: adjusting.date,
      shiftId: Number(adjusting.shiftId), roomId: plan.deliveryMode === "Ead" ? null :
        adjusting.roomId ? Number(adjusting.roomId) : null };
    setBusy(true); setAdjustBlocks([]); setError("");
    try {
      const path = `/schedules/${details.id}/unit-plans/${plan.id}`;
      const preview = await post<{ allowed: boolean; blocks: string[] }>(`${path}/meeting-preview`, input);
      if (!preview.allowed) { setAdjustBlocks(preview.blocks); return; }
      await put(`${path}/meeting`, input);
      const updated = await read<ScheduleDetails>(`/schedules/${details.id}`);
      if (selectedSemester.current !== String(details.semesterId)) return;
      setDetails(updated); setAdjusting(null); setAlternatives([]);
      await reload();
      setSuccess("Encontro ajustado. As demais aulas foram preservadas.");
    } catch (cause) { setError(resultMessage(cause)); }
    finally { setBusy(false); }
  }
  const visiblePlans = (details?.unitPlans ?? []).filter((plan) =>
    !classFilter || String(plan.classGroupId) === classFilter);
  const meetingInWeek = (date: string | null) => {
    if (view !== "Semana" || !weekDate || !date) return view !== "Semana" || !weekDate;
    const selectedDay = new Date(`${weekDate}T12:00:00`);
    const meetingDay = new Date(`${date}T12:00:00`);
    const monday = new Date(selectedDay);
    monday.setDate(selectedDay.getDate() - ((selectedDay.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return meetingDay >= monday && meetingDay <= sunday;
  };
  return (
    <>
      {!embedded && <Title
        title="Geração de grade"
        subtitle="Organize instrutores, turmas e salas sem conflitos de turno."
      />}
      {embedded && <SectionHeading title="Grade semestral gerada"
        subtitle="Revise a distribuição automática, ajuste encontros pontuais e publique somente uma proposta completa." />}
      {error && (
        <div className="mb-4">
          <Notice message={error} onClose={() => setError("")} />
        </div>
      )}
      {success && (
        <div className="mb-4">
          <Notice
            message={success}
            type="success"
            onClose={() => setSuccess("")}
          />
        </div>
      )}
      <div className="mb-5">
        <FilterBar actions={admin && (
            <button onClick={() => void generate()} disabled={!semesterId || busy} className="btn-primary">
              <Sparkles size={16} />{busy ? "Processando..." : "Gerar nova grade"}
            </button>
          )}>
          {!embedded && <Field className="flex-1" label="Semestre">
            <select
              className="field"
              disabled={busy}
              value={semesterId}
              onChange={(e) => {
                selectedSemester.current = e.target.value;
                setSemesterId(e.target.value);
                setSelected("");
              }}
            >
              <option value="">Selecione um semestre</option>
              {data.semesters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>}
        </FilterBar>
        <p className="muted mt-3">As ofertas de UC são distribuídas pelas datas letivas. Aulas anteriores sem oferta de UC preservam a grade semanal existente. O cálculo exige CH pedagógica institucional configurada por turno.</p>
      </div>
      {admin && <Card className="p-4 mb-5 space-y-3" aria-label="Carga pedagógica por turno">
        <SectionHeading title="Carga pedagógica por turno" subtitle="Configure uma vez a equivalência institucional da CH da UC. A duração do relógio do turno não é convertida automaticamente." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.shifts.map((shift) =>
          <div key={shift.id} className="rounded-xl border border-line p-3 space-y-2">
            <Field label={`${shift.name}: horas pedagógicas por encontro`}><input className="field" type="number" min="0.01" max="24" step="0.01"
              value={shiftHours[shift.id] ?? (shift.pedagogicalHours == null ? "" : String(shift.pedagogicalHours))}
              onChange={(event) => setShiftHours((current) => ({ ...current, [shift.id]: event.target.value }))} /></Field>
            <button type="button" className="btn-secondary" disabled={busy || !(shiftHours[shift.id] ?? shift.pedagogicalHours)}
              onClick={() => void saveShiftHours(shift.id)}>Salvar CH do turno</button>
          </div>)}</div>
      </Card>}
      <div className="grid lg:grid-cols-[300px_1fr] gap-5">
        <Card className="overflow-hidden self-start">
          <div className="p-4 border-b border-line">
            <SectionHeading title="Versões da grade" subtitle="Rascunhos e publicações do semestre." />
          </div>
          {schedules.length === 0 ? (
            <Empty
              title="Nenhuma grade gerada"
              text="Selecione um semestre e gere o primeiro rascunho."
            />
          ) : (
            schedules.map((s) => (
              <button
                disabled={busy}
                className={`p-4 border-b border-slate-100 last:border-0 w-full text-left hover:bg-slate-50 ${selected === String(s.id) ? "bg-sky-50" : ""}`}
                onClick={() => setSelected(String(s.id))}
                key={s.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm">Grade #{s.id}</p>
                  <Badge status={s.status} />
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {data.semesters.find((x) => x.id === s.semesterId)?.name} •{" "}
                      {s.allocatedMeetings} registros de aula
                </p>
                {s.unallocatedMeetings > 0 && (
                  <p className="text-xs text-amber-700 mt-1">
                  {s.unallocatedMeetings} pendências
                  </p>
                )}
              </button>
            ))
          )}
        </Card>
        <Card className="overflow-hidden min-h-[280px]">
          {!details ? (
            <Empty
              title="Selecione uma versão da grade"
              text="As disciplinas, salas e horários aparecerão aqui."
            />
          ) : (
            <>
              <div className="p-5 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
                <div>
                  <h3 className="section-title">Grade #{details.id}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge status={details.status} />
                    <span className="text-xs text-slate-500">
                      {details.lessons.length + (details.unitPlans ?? []).reduce((total, plan) => total + plan.meetings.length, 0)} registros planejados
                    </span>
                  </div>
                </div>
                {admin && details.status === "Rascunho" && (
                  <button
                    className="btn-primary"
                    disabled={
                      busy ||
                      String(details.semesterId) !== semesterId ||
                      details.unallocatedMeetings > 0 ||
                      details.unitPlans?.some((plan) => plan.pendingReason ||
                        plan.unallocatedHours == null || plan.unallocatedHours > 0) ||
                      details.lessons.length === 0 && !(details.unitPlans?.length)
                    }
                    onClick={() => void publish()}
                  >
                    <Send size={15} />
                    Publicar grade
                  </button>
                )}
              </div>
              {details.unallocatedMeetings > 0 && (
                <div className="p-4 mx-5 my-4 rounded-xl bg-amber-50 text-amber-800 text-sm flex gap-2">
                  <AlertTriangle size={18} className="shrink-0" />
                  Há {details.unallocatedMeetings} pendência(s). Consulte as horas não alocadas e os motivos por UC antes de gerar outra versão.
                </div>
              )}
              {!!details.unitPlans?.length && <div className="p-4 space-y-3">
                <SectionHeading title="Ofertas de UCs" subtitle="CH planejada, distribuição presencial ou EAD e pendências do semestre." />
                <FilterBar>
                  <Field label="Visualizar por"><select className="field" value={view}
                    onChange={(event) => setView(event.target.value as typeof view)}>
                    <option>Turma</option><option>Semana</option><option>Semestre</option>
                  </select></Field>
                  <Field label="Turma"><select className="field" value={classFilter}
                    onChange={(event) => setClassFilter(event.target.value)}>
                    <option value="">Todas as turmas</option>
                    {[...new Map(details.unitPlans.map((plan) => [plan.classGroupId, plan.className])).entries()]
                      .map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </select></Field>
                  {view === "Semana" && <Field label="Semana de referência"><input type="date"
                    className="field" value={weekDate} onChange={(event) => setWeekDate(event.target.value)} /></Field>}
                </FilterBar>
                <p className="text-sm text-muted-ink">Situação: <strong className="text-ink">{details.status === "Publicada" ? "Publicada" :
                  details.unallocatedMeetings ? "Com pendências" : "Pronta para aprovação"}</strong>.
                  A revisão da grade gerada é feita antes do comando Publicar; as propostas institucionais acima mantêm seu fluxo de aprovação próprio.</p>
                {visiblePlans.map((plan) => <article key={plan.id}
                  className="rounded-xl border border-line p-3 space-y-2 text-sm">
                  <p className="font-semibold text-ink">{plan.className} · {plan.unitName}</p>
                  <p className="text-muted-ink">{plan.courseName ?? "Curso não vinculado"} → {plan.moduleName ?? "Módulo não vinculado"} · {plan.deliveryMode === "Ead" ?
                    plan.eadScheduleMode === "SemHorarioFixo" ? "EAD sem horário fixo" : "EAD com encontros on-line" : "Presencial"}</p>
                  <p className="text-muted-ink">Instrutor: {data.teachers.find((item) => item.id === plan.teacherId)?.displayName ?? "Não atribuído"}</p>
                  <p className="text-muted-ink">CH prevista: {plan.plannedHours ?? "Não informada"} h · planejada: {plan.allocatedHours} h · não alocada: {plan.unallocatedHours ?? "Indeterminada"} h</p>
                  {plan.pendingReason && <Notice message={plan.pendingReason} />}
                  <ul className="space-y-2">{plan.meetings.filter((meeting) => meetingInWeek(meeting.date)).map((meeting) => <li key={meeting.id} className="text-muted-ink flex flex-wrap items-center gap-2">
                    {meeting.date ? `${meeting.date.slice(8, 10)}/${meeting.date.slice(5, 7)}/${meeting.date.slice(0, 4)} · ${meeting.shiftName ?? "Turno"} ${meeting.start ? hour(meeting.start) : ""}–${meeting.end ? hour(meeting.end) : ""}` : "EAD sem horário fixo"}
                    {meeting.room ? ` · ${meeting.room}` : " · sem sala física"} · {meeting.plannedHours} h planejadas
                    {admin && details.status === "Rascunho" && meeting.date &&
                      <button type="button" className="btn-secondary" disabled={busy}
                        onClick={() => beginAdjustment(plan.id, meeting.id, meeting.date!, meeting.shiftId, meeting.roomId)}>Ajustar</button>}
                  </li>)}</ul>
                  {view === "Semana" && !plan.meetings.some((meeting) => meetingInWeek(meeting.date)) &&
                    <p className="text-muted-ink">Nenhum encontro nesta semana.</p>}
                  {admin && details.status === "Rascunho" && (plan.unallocatedHours ?? 0) > 0 &&
                    plan.eadScheduleMode !== "SemHorarioFixo" &&
                    <button type="button" className="btn-secondary" disabled={busy}
                      onClick={() => beginAdjustment(plan.id, null, weekDate, data.classes.find((c) => c.id === plan.classGroupId)?.shiftId ?? null, null)}>
                      Alocar horas pendentes
                    </button>}
                </article>)}
                {adjusting && <Card className="p-4 space-y-3" aria-label="Ajustar encontro da proposta">
                  <SectionHeading title={adjusting.meetingId ? "Ajustar encontro" : "Alocar horas pendentes"}
                    subtitle="A alteração modifica somente este encontro do rascunho." />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Data"><input className="field" type="date" value={adjusting.date}
                      onChange={(event) => setAdjusting({ ...adjusting, date: event.target.value })} /></Field>
                    <Field label="Turno autorizado"><select className="field" value={adjusting.shiftId}
                      onChange={(event) => setAdjusting({ ...adjusting, shiftId: event.target.value })}>
                      <option value="">Selecione</option>{data.shifts.filter((shift) => shift.id ===
                        data.classes.find((cls) => cls.id === details.unitPlans?.find((plan) =>
                          plan.id === adjusting.planId)?.classGroupId)?.shiftId).map((shift) =>
                        <option key={shift.id} value={shift.id}>{shift.name}</option>)}
                    </select></Field>
                    {details.unitPlans?.find((plan) => plan.id === adjusting.planId)?.deliveryMode === "Presencial" &&
                      <Field label="Ambiente"><select className="field" value={adjusting.roomId}
                        onChange={(event) => setAdjusting({ ...adjusting, roomId: event.target.value })}>
                        <option value="">Selecione</option>{data.rooms.map((room) =>
                          <option key={room.id} value={room.id}>{room.name}</option>)}
                      </select></Field>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-secondary" disabled={busy}
                      onClick={() => void suggest(adjusting.planId, adjusting.meetingId, adjusting.date)}>Buscar alternativas</button>
                    <button type="button" className="btn-primary" disabled={busy || !adjusting.date || !adjusting.shiftId}
                      onClick={() => void saveAdjustment()}>Validar e salvar</button>
                    <button type="button" className="btn-secondary" onClick={() => {
                      suggestionRequest.current++; setAdjusting(null); setAlternatives([]);
                    }}>Cancelar</button>
                  </div>
                  {adjustBlocks.length > 0 && <Notice message={adjustBlocks.join("; ")} />}
                  <div aria-live="polite" className="space-y-1">
                    <p className="font-medium">Alternativas comprovadas</p>
                    {alternatives.length === 0 && <p className="text-muted-ink">Nenhuma alternativa encontrada nos próximos 31 dias consultados.</p>}
                    {alternatives.map((option, index) => <button key={`${option.date}:${option.roomId}:${index}`}
                      type="button" className="btn-secondary mr-2 mb-2" onClick={() => setAdjusting({ ...adjusting,
                        date: option.date, shiftId: String(option.shiftId), roomId: option.roomId ? String(option.roomId) : "" })}>
                      {option.date} · {option.roomName ?? "On-line"} · {option.hours} h
                    </button>)}
                  </div>
                </Card>}
              </div>}
              {details.lessons.length === 0 && !details.unitPlans?.length ? (
                <Empty text="Não foi possível alocar aulas neste rascunho." />
              ) : (
                <div className="data-table-wrap border-0 rounded-none">
                  <table className="min-w-full">
                    <thead>
                      <tr className="table-head">
                        <th className="px-4 py-3 text-left">Dia</th>
                        <th className="px-4 py-3 text-left">Turno</th>
                        <th className="px-4 py-3 text-left">
                          Disciplina e turma
                        </th>
                        <th className="px-4 py-3 text-left">Sala</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...details.lessons]
                        .sort(
                          (a, b) =>
                            a.weekday - b.weekday ||
                            a.start.localeCompare(b.start),
                        )
                        .map((l) => (
                          <tr key={l.id}>
                            <td className="table-cell whitespace-nowrap font-medium">
                              {dayNames[l.weekday - 1]}
                            </td>
                            <td className="table-cell whitespace-nowrap">
                              <span>{l.shiftName}</span>
                              <span className="block text-xs text-slate-400">
                                {hour(l.start)}–{hour(l.end)}
                              </span>
                            </td>
                            <td className="table-cell">
                              <p className="font-semibold">
                                {l.disciplineName}
                              </p>
                              <span className="text-xs text-slate-400">
                                {
                                  data.classes.find(
                                    (c) => c.id === l.classGroupId,
                                  )?.name
                                }{" "}
                                •{" "}
                                {data.teachers.find((t) => t.id === l.teacherId)
                                  ?.displayName || "Instrutor"}
                              </span>
                            </td>
                            <td className="table-cell font-medium">{l.room}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
      <Card className="p-4 mt-5 flex items-start gap-3">
        <CalendarCheck2 size={20} className="text-skybrand-600 shrink-0" />
        <p className="text-sm text-slate-600">
          Ao publicar, o backend registra todas as ocorrências do semestre.
          Reservas avulsas aprovadas e empréstimos aparecem na agenda. Só é
          possível publicar uma grade completa.
        </p>
      </Card>
    </>
  );
}
