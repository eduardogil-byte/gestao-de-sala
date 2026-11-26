// Origem: features/planning/PlanningPage.tsx (aba Preparação) e PlanningIssuePanel.tsx
import { Fragment, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { BarChart3, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ListChecks, Pencil, Plus } from "lucide-react";
import { put, read } from "../../lib/api";
import { useData } from "../../lib/data";
import { hour, localDate, nextDate, resultMessage } from "../../lib/utils";
import type { Semester, Shift, User } from "../../types";
import { Field, Modal, Notice, SubmitButton } from "../UI";
import { dateLabel, isWeekend, mondayOf, type ClassUnits, type Issue, type PlanningTarget } from "./data";

type CalendarEvent = { id: number; startDate: string; endDate: string; kind: string; description: string };
type CalendarDay = { date: string; kind: string; countsAsPresential: boolean; reason: string };
type Panel = "calendar" | "shifts" | "checks";
const kinds: Record<string, string> = { Presential: "Dia letivo presencial", Ead: "Dia letivo EAD", Holiday: "Feriado", Recess: "Recesso", Planning: "Dia de planejamento pedagógico", NonTeaching: "Dia não letivo" };
const kindIndex = ["Presential", "Ead", "Holiday", "Recess", "Planning", "NonTeaching"];
const kindClass = (kind: string) => `planning-kind kind-${kindIndex.indexOf(kind)}`;
const calendarEditNote = "O cadastro de eventos não está liberado nesta tela.";

function Accordion({ id, title, subtitle, open, onToggle, children }: { id: string; title: string; subtitle: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return <section className="courses-panel planning-section planning-preparation-accordion" id={id} aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`} className="planning-accordion-heading"><button type="button" className="planning-accordion-toggle curriculum-section-head" aria-expanded={open} aria-controls={`${id}-content`} onClick={onToggle}><span><strong>{title}</strong><small>{subtitle}</small></span><ChevronDown size={18} aria-hidden="true" /></button></h3>
    <div id={`${id}-content`} className="planning-accordion-content" aria-hidden={!open} data-open={open}><div className="planning-accordion-inner">{children}</div></div>
  </section>;
}

function Calendar({ semester }: { semester: Semester }) {
  const first = semester.startDate.slice(0, 10), last = semester.endDate.slice(0, 10);
  const today = localDate(new Date());
  const [month, setMonth] = useState((today >= first && today <= last ? today : first).slice(0, 7));
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState("");
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [days, setDays] = useState<Map<string, CalendarDay> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    read<{ events: CalendarEvent[] }>(`/semesters/${semester.id}/calendar`).then((value) => {
      if (!Array.isArray(value?.events)) throw new Error("A API retornou um calendário incompleto.");
      if (active) setEvents(value.events);
    }).catch((cause) => { if (active) setError(resultMessage(cause)); });
    // Classificação efetiva calculada pela própria API (todos os dias da semana).
    read<{ dates: CalendarDay[] }>(`/academic-calendar/preview?semesterId=${semester.id}&from=${first}&to=${last}&weekdaysMask=127`).then((value) => {
      if (active && Array.isArray(value?.dates)) setDays(new Map(value.dates.map((item) => [item.date.slice(0, 10), item])));
    }).catch(() => { if (active) setDays(null); });
    return () => { active = false; };
  }, [semester.id, first, last]);
  const months: string[] = [];
  for (let value = `${first.slice(0, 7)}-01`; value.slice(0, 7) <= last.slice(0, 7); value = `${nextDate(value, 32).slice(0, 7)}-01`) months.push(value.slice(0, 7));
  const position = months.indexOf(month);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
  const length = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const offset = (new Date(`${month}-01T12:00:00Z`).getUTCDay() + 6) % 7;
  const eventsOn = (date: string) => (events ?? []).filter((item) => item.startDate <= date && item.endDate >= date);
  const classify = (date: string) => {
    if (date < first || date > last) return null;
    const day = days?.get(date);
    const event = eventsOn(date)[0];
    return { kind: day?.kind ?? event?.kind ?? null, reason: day?.reason ?? event?.description ?? "", weekend: isWeekend(date) && !event };
  };
  const visibleEvents = (events ?? []).filter((item) => !filter || item.kind === filter);
  const values = [...(days?.values() ?? [])].filter((item) => !isWeekend(item.date.slice(0, 10)) || item.kind !== "Presential");
  const count = (kind: string) => days ? values.filter((item) => item.kind === kind).length : "—";
  const teaching = days ? values.filter((item) => item.countsAsPresential).length : "—";
  const selectedDay = selected ? classify(selected) : null;
  return <div className="planning-section-body">
    <div className="planning-calendar-toolbar"><div className="planning-month-nav"><button type="button" aria-label="Mês anterior" disabled={position <= 0} onClick={() => setMonth(months[position - 1])}><ChevronLeft size={18} /></button><strong>{label}</strong><button type="button" aria-label="Próximo mês" disabled={position < 0 || position >= months.length - 1} onClick={() => setMonth(months[position + 1])}><ChevronRight size={18} /></button></div><div className="planning-calendar-tools"><label className="course-filter">Tipo<select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filtrar datas por tipo"><option value="">Todos</option>{kindIndex.map((kind) => <option key={kind} value={kind}>{kinds[kind]}</option>)}</select></label><button type="button" className="course-primary" disabled title={calendarEditNote}><Plus size={17} /> Adicionar evento</button></div></div>
    {error && <p className="course-error" role="alert">{error}</p>}
    <div className="planning-calendar" aria-label={`Calendário de ${label}`}><div className="planning-weekdays">{["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => <span key={day}>{day}</span>)}</div><div className="planning-days">
      {Array.from({ length: offset }, (_, index) => <span className="planning-day is-empty" key={`offset-${index}`} />)}
      {Array.from({ length }, (_, index) => {
        const date = `${month}-${String(index + 1).padStart(2, "0")}`;
        const day = classify(date);
        const dayEvents = day ? eventsOn(date) : [];
        const state = !day ? "" : day.weekend ? " is-weekend" : day.kind === "Holiday" ? " is-holiday" : day.kind === "Ead" ? " is-ead" : day.kind === "Presential" ? " is-lesson" : day.kind ? " is-special" : "";
        const text = !day ? "" : day.weekend ? "Fim de semana" : day.kind === "Presential" && !dayEvents.length ? "Letivo" : day.kind ? kinds[day.kind] ?? day.kind : "Sem classificação";
        return <button type="button" className={`planning-day${day ? "" : " is-outside"}${selected === date ? " is-selected" : ""}${day && filter && day.kind !== filter ? " is-filtered" : ""}${dayEvents.length ? " has-event" : ""}${state}${date === today ? " is-today" : ""}`} key={date} disabled={!day} onClick={() => setSelected(date)} aria-label={day ? `${dateLabel(date)}: ${text}. ${day.reason}` : `${dateLabel(date)}: fora do semestre`} aria-pressed={selected === date}><strong>{index + 1}</strong>{day && <small className={day.kind ? kindClass(day.kind) : "planning-kind"}>{text}</small>}</button>;
      })}
    </div></div>
    <div className="planning-legend"><span><i className="planning-legend-swatch is-lesson" /> Dia letivo</span><span><i className="planning-legend-swatch is-weekend" /> Fim de semana</span><span><i className="planning-legend-swatch is-exception" /> Feriado ou exceção</span></div>
    <details className="planning-calendar-more"><summary className="planning-fold-summary"><span className="planning-details-icon"><BarChart3 size={20} aria-hidden="true" /></span><span className="planning-details-text"><strong>Indicadores do calendário</strong><small>Dias letivos, feriados, recessos e dias disponíveis para reservas</small></span><span className="planning-details-badge is-ok">{teaching} dias letivos</span><ChevronDown className="planning-details-chevron" size={18} aria-hidden="true" /></summary><div className="planning-calendar-indicators" aria-label="Indicadores do calendário">{([["Total de dias", days ? days.size : "—", ""], ["Letivos presenciais", teaching, "is-green"], ["Letivos EAD", count("Ead"), "is-blue"], ["Feriados", count("Holiday"), "is-amber"], ["Recessos", count("Recess"), "is-amber"], ["Planejamento pedagógico", count("Planning"), "is-blue"], ["Não letivos", count("NonTeaching"), "is-gray"]] as const).map(([name, value, tone]) => <div key={name} className={`planning-ind ${tone}`}><span>{name}</span><strong>{value}</strong></div>)}</div></details>
    {selected && selectedDay && <div className="planning-selected-day"><div className="planning-selected-day-content"><strong>{dateLabel(selected)} · {selectedDay.kind ? kinds[selectedDay.kind] ?? selectedDay.kind : "Sem classificação"}</strong><span>{selectedDay.reason || "Sem observação"}</span>{eventsOn(selected).length ? <ul>{eventsOn(selected).map((item) => <li key={item.id}>{kinds[item.kind] ?? item.kind}: {item.description}</li>)}</ul> : <span>Nenhum evento especial nesta data.</span>}</div></div>}
    <details className="planning-calendar-more"><summary className="planning-fold-summary"><span className="planning-details-icon"><CalendarDays size={20} aria-hidden="true" /></span><span className="planning-details-text"><strong>Eventos cadastrados</strong><small>Feriados locais, recessos e exceções deste semestre</small></span><span className={`planning-details-badge ${visibleEvents.length ? "is-warning" : "is-ok"}`}>{visibleEvents.length} {visibleEvents.length === 1 ? "evento" : "eventos"}</span><ChevronDown className="planning-details-chevron" size={18} aria-hidden="true" /></summary><div className="planning-event-list">{visibleEvents.length ? visibleEvents.map((item) => <div className="planning-event" key={item.id}><span className={kindClass(item.kind)}>{kinds[item.kind] ?? item.kind}</span><span><strong>{dateLabel(item.startDate)}{item.endDate !== item.startDate ? ` a ${dateLabel(item.endDate)}` : ""}</strong><small>{item.description}</small></span></div>) : <p className="planning-empty">Nenhum evento para este filtro.</p>}</div></details>
    <p className="academic-note">Classificação informada pela API. {calendarEditNote} Feriados nacionais só aparecem quando cadastrados.</p>
  </div>;
}

function Shifts({ admin }: { admin: boolean }) {
  const { data, reload } = useData();
  const [editing, setEditing] = useState<Shift | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = (shift: Shift) => { setEditing(shift); setValue(shift.pedagogicalHours == null ? "" : String(shift.pedagogicalHours)); setError(""); };
  async function save(event: FormEvent) {
    event.preventDefault();
    const hours = Number(value);
    if (!editing || busy) return;
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24 || Math.round(hours * 100) !== hours * 100) { setError("Informe horas maiores que zero, até 24, com no máximo duas casas."); return; }
    setBusy(true); setError("");
    try { await put(`/shifts/${editing.id}/pedagogical-hours`, { hours }); await reload(); setEditing(null); }
    catch (cause) { setError(resultMessage(cause)); }
    finally { setBusy(false); }
  }
  const status = (shift: Shift) => <span className={`course-status ${shift.pedagogicalHours ? "is-active" : "is-inactive"}`}>{shift.pedagogicalHours ? "Configurado" : "Pendente"}</span>;
  const action = (shift: Shift) => admin && <div className="course-actions"><button type="button" aria-label={`Configurar horas pedagógicas do turno ${shift.name}`} onClick={() => open(shift)}><Pencil size={16} /></button></div>;
  return <>
    <div className="courses-table-scroll"><table className="courses-table planning-shifts-table"><thead><tr><th>Turno</th><th>Início</th><th>Término</th><th>Horas pedagógicas</th><th>Situação</th>{admin && <th>Ações</th>}</tr></thead><tbody>{data.shifts.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{hour(item.startsAt)}</td><td>{hour(item.endsAt)}</td><td>{item.pedagogicalHours ? `${item.pedagogicalHours} h` : "Não definida"}</td><td>{status(item)}</td>{admin && <td>{action(item)}</td>}</tr>)}</tbody></table></div>
    <div className="course-mobile-list">{data.shifts.map((item) => <article className="course-mobile-item" key={item.id}><div className="course-mobile-top"><strong>{item.name}</strong>{status(item)}</div><small>{hour(item.startsAt)} às {hour(item.endsAt)}</small><small>{item.pedagogicalHours ? `${item.pedagogicalHours} h pedagógicas` : "Horas pedagógicas não definidas"}</small>{action(item)}</article>)}</div>
    <p className="academic-note">A equivalência pedagógica é configurada separadamente da duração do turno.</p>
    {editing && <Modal title={`Horas pedagógicas · ${editing.name}`} width="max-w-md" onClose={() => { if (!busy) setEditing(null); }}>
      <form className="space-y-4" onSubmit={(event) => void save(event)} noValidate>
        {error && <Notice message={error} />}
        <Field label="Horas pedagógicas equivalentes"><input className="field" type="number" min="0.01" max="24" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} /></Field>
        <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancelar</button><SubmitButton busy={busy}>Salvar horas pedagógicas</SubmitButton></div>
      </form>
    </Modal>}
  </>;
}

const severityClass = (severity: string) => severity === "Impedimento" ? "block" : severity === "Atenção" ? "warning" : severity === "Informativo" ? "info" : "unknown";
const actionLabel = (target: PlanningTarget | "shifts") => target === "shifts" ? "Ir para seção" : target === "academic" ? "Abrir turmas" : target === "teachers" ? "Abrir instrutores" : target === "rooms" ? "Abrir Ambientes" : "Abrir Cursos";

function Checks({ semester, units, issues, onAction }: { semester: Semester; units: Record<number, ClassUnits | null>; issues: Issue[]; onAction?: (target: PlanningTarget | "shifts") => void }) {
  const { data } = useData();
  const [collapsed, setCollapsed] = useState<number[]>([]);
  const classes = data.classes.filter((item) => item.semesterId === semester.id);
  const unitCount = classes.reduce((total, item) => total + (units[item.id]?.units.length ?? 0), 0);
  const pending = issues.reduce((total, item) => total + item.occurrences.length, 0);
  const button = (target: PlanningTarget | "shifts", className = "planning-text-button") => onAction && <button type="button" className={className} onClick={() => onAction(target)}>{actionLabel(target)}</button>;
  const own = (classId: number) => issues.filter((issue) => issue.occurrences.some((row) => row.id === String(classId) && issue.id.startsWith("class-") || row.id.startsWith(`${classId}-`)));
  const summary = ([["Cursos, módulos e UCs", ["unit-hours", "class-module", "units-unavailable"]], ["Instrutores", ["unit-teacher", "class-assignment"]], ["Turmas e turnos", ["class-shift", "shift-hours"]]] as const)
    .map(([label, ids]) => ({ label, count: issues.filter((issue) => (ids as readonly string[]).includes(issue.id)).reduce((total, issue) => total + issue.occurrences.length, 0) }));

  const classDetail = (item: typeof classes[number]) => {
    const value = units[item.id];
    return <div className="planning-class-detail"><div className="planning-uc-list" aria-label={`UCs ofertadas da turma ${item.code || item.name}`}>
      <h4>UCs ofertadas <span>({value?.units.length ?? 0})</span></h4>
      {value?.units.map((unit) => {
        const found = issues.filter((issue) => issue.occurrences.some((row) => row.id === `${item.id}-${unit.curricularUnitId}`));
        const teacher = data.teachers.find((row) => row.id === unit.teacherId);
        return <article className="planning-uc-card" key={unit.curricularUnitId}>
          <div className="planning-uc-main">
            <div><span className="planning-uc-label">Unidade curricular</span><strong>{unit.code}</strong><small>{unit.name}</small></div>
            <div><span className="planning-uc-label">Modalidade e carga</span><div className="planning-uc-tags"><em className={`planning-mode ${unit.deliveryMode === "Ead" ? "is-ead" : ""}`}>{unit.deliveryMode === "Ead" ? "EAD" : "Presencial"}</em><em className="planning-mode">{unit.plannedHours ?? "—"} h</em></div>{unit.eadScheduleMode && <small>{unit.eadScheduleMode === "HorarioDefinido" ? "Com horário definido" : "Sem horário fixo"}</small>}</div>
            <div><span className="planning-uc-label">Instrutor</span>{unit.teacherId ? <strong>{teacher?.displayName ?? "Responsável registrado"}</strong> : <small>Sem instrutor</small>}</div>
            <div className="planning-uc-status"><span className="planning-uc-label">Situação</span><span className={`course-status ${found.length ? "is-inactive" : "is-active"}`}>{found.length ? `${found.length} pendência(s)` : "Sem pendências"}</span></div>
          </div>
          {found.map((issue) => <div className={`planning-uc-alert is-${severityClass(issue.severity)}`} key={issue.id}><span className={`planning-severity severity-${severityClass(issue.severity)}`}>{issue.severity}</span><span className="planning-uc-alert-text"><strong>{issue.title}</strong><small>{issue.description}</small></span>{button(issue.target)}</div>)}
        </article>;
      })}
      {!value?.units.length && <p className="planning-empty">{value === undefined ? "Consultando UCs…" : value === null ? "UCs não informadas pela API." : "Nenhuma UC ofertada nesta turma."}</p>}
    </div></div>;
  };

  return <>
    <div className="planning-section-body">{summary.map((row) => <div className="planning-reference-summaryrow" key={row.label}><span><i className={`planning-reference-dot ${row.count ? "is-warning" : "is-success"}`} />{row.label}</span><span className={`planning-reference-status ${row.count ? "is-warning" : "is-confirmed"}`}>{row.count ? `${row.count} pendência(s)` : "Verificado"}</span></div>)}
      <div className="planning-reference-summaryrow"><span><i className="planning-reference-dot" />Ambientes, recursos e compatibilidade técnica</span><span className="planning-reference-status is-pending">Validação na geração e publicação</span></div></div>
    <details className="planning-reference-check-details"><summary><span className="planning-details-icon"><ListChecks size={20} aria-hidden="true" /></span><span className="planning-details-text"><strong>Ver detalhes e pendências do semestre {semester.name}</strong><small>Turmas e UCs ofertadas, instrutores e avisos da preparação</small></span><span className={`planning-details-badge ${pending ? "is-warning" : "is-ok"}`}>{pending ? `${pending} ${pending === 1 ? "pendência" : "pendências"}` : "Sem pendências"}</span><ChevronDown className="planning-details-chevron" size={18} aria-hidden="true" /></summary>
      <section className="courses-panel planning-section" aria-labelledby="planning-classes-title"><div className="curriculum-section-head"><div><h3 id="planning-classes-title">Turmas e UCs do Semestre</h3><p>Cada turma com suas UCs ofertadas, modalidades, cargas horárias e instrutores. Corrija os dados na área Turmas.</p></div><div className="planning-classes-tools"><span className="courses-count">{classes.length} {classes.length === 1 ? "turma" : "turmas"} · {unitCount} {unitCount === 1 ? "UC" : "UCs"}</span>{!!classes.length && <button type="button" className="planning-text-button" onClick={() => setCollapsed(collapsed.length ? [] : classes.map((item) => item.id))}>{collapsed.length ? "Expandir todas" : "Recolher todas"}</button>}</div></div>
        <div className="courses-table-scroll"><table className="courses-table planning-classes-table"><thead><tr><th>Turma</th><th>Curso / módulo</th><th>Turno</th><th>Alunos</th><th>UCs</th><th>Carga prevista</th><th>Preparação</th><th>Ações</th></tr></thead><tbody>{classes.map((item) => {
          const value = units[item.id]; const found = own(item.id); const open = !collapsed.includes(item.id);
          return <Fragment key={item.id}><tr className={`planning-class-row${open ? " is-open" : ""}`}><td><button type="button" className="planning-class-toggle" aria-expanded={open} aria-label={`${open ? "Recolher" : "Expandir"} UCs da turma ${item.code || item.name}`} onClick={() => setCollapsed((current) => open ? [...current, item.id] : current.filter((id) => id !== item.id))}>{open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}<span><strong>{item.code || item.name}</strong><small className="academic-subline">{item.name}</small></span></button></td><td>{item.courseId ? "Curso vinculado" : "Curso ausente"}<small className="academic-subline">{item.courseModuleId ? "Módulo vinculado" : "Módulo ausente"}</small></td><td>{data.shifts.find((shift) => shift.id === item.shiftId)?.name ?? "Pendente"}</td><td>{item.students}</td><td>{value?.units.length ?? "—"}</td><td>{value ? `${value.units.reduce((total, unit) => total + (unit.plannedHours ?? 0), 0)} h` : "—"}</td><td><span className={`course-status ${found.length ? "is-inactive" : "is-active"}`}>{found.length ? `${found.length} pendência(s)` : "Sem pendências próprias"}</span></td><td>{button("academic", "course-secondary")}</td></tr>{open && <tr className="planning-class-offers-row"><td colSpan={8}>{classDetail(item)}</td></tr>}</Fragment>;
        })}</tbody></table></div>
        <div className="course-mobile-list">{classes.map((item) => <article className="course-mobile-item" key={item.id}><div className="course-mobile-top"><strong>{item.code || item.name}</strong></div><small>{item.name}</small><small>{data.shifts.find((shift) => shift.id === item.shiftId)?.name ?? "Turno pendente"} · {item.students} alunos</small>{classDetail(item)}</article>)}</div>
        {!classes.length && <div className="courses-empty">Nenhuma turma vinculada a este semestre.</div>}
      </section>
      <section className="courses-panel planning-section" aria-labelledby="planning-issues-title"><div className="curriculum-section-head"><div><h3 id="planning-issues-title">Pendências da Preparação</h3><p>Abra cada aviso para consultar os registros afetados, os valores encontrados e o caminho de correção.</p></div><span className="courses-count">{issues.length} avisos</span></div><div className="planning-issue-guide"><span><b>Informativo</b> acompanhamento</span><span><b>Atenção</b> verificar cadastro</span><span><b>Impedimento</b> correção necessária</span><span><b>Verificação indisponível</b> dados insuficientes</span></div><div className="planning-issue-list">{issues.length ? issues.map((issue) => <article className="planning-issue" key={issue.id}>
        <span className={`planning-severity severity-${severityClass(issue.severity)}`}>{issue.severity}</span>
        <details className="planning-issue-details"><summary><span><strong>{issue.title}</strong><small>{issue.occurrences.length} {issue.occurrences.length === 1 ? "ocorrência" : "ocorrências"} · {issue.location}</small><span className="planning-issue-description">{issue.description}</span></span><ChevronDown size={17} aria-hidden="true" /></summary>
          <div className="planning-issue-expanded"><p><strong>Impacto no planejamento:</strong> {issue.impact}</p><div className="planning-occurrences">{issue.occurrences.map((row) => <div className="planning-occurrence" key={row.id}><div className="planning-occurrence-head"><div><strong>{row.record}</strong><small>{row.location}</small></div>{button(issue.target, "course-secondary")}</div><dl>{row.facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl><p><strong>Impacto:</strong> {row.impact}</p></div>)}</div></div>
        </details>
        {onAction && <button type="button" className="course-secondary planning-issue-general" onClick={() => onAction(issue.target)}>{actionLabel(issue.target)}</button>}
      </article>) : <div className="courses-empty">Nenhuma pendência identificada nas verificações disponíveis.</div>}</div></section>
    </details>
  </>;
}

export function PreparationTab({ semester, user, units, issues, onOpen }: {
  semester: Semester; user: User; units: Record<number, ClassUnits | null>; issues: Issue[]; onOpen?: (target: PlanningTarget) => void;
}) {
  const admin = user.roles.includes("Admin");
  const [open, setOpen] = useState<Record<Panel, boolean>>({ calendar: true, shifts: false, checks: false });
  const toggle = (panel: Panel) => setOpen((current) => ({ ...current, [panel]: !current[panel] }));
  const act = admin && onOpen ? (target: PlanningTarget | "shifts") => {
    if (target !== "shifts") { onOpen(target); return; }
    setOpen((current) => ({ ...current, shifts: true }));
    requestAnimationFrame(() => document.getElementById("planning-shifts")?.scrollIntoView({ block: "start" }));
  } : undefined;
  return <>
    <div className="planning-reference-tip">As informações desta área alimentam o Planejamento. Não é necessário cadastrar novamente cursos, turmas ou instrutores.</div>
    <Accordion id="planning-calendar" title="Calendário acadêmico" subtitle="Segunda a sexta são letivas, salvo eventos cadastrados. Feriados, recessos e exceções vêm do calendário do semestre." open={open.calendar} onToggle={() => toggle("calendar")}><Calendar semester={semester} /></Accordion>
    <Accordion id="planning-shifts" title="Turnos" subtitle="Horários cadastrados. A equivalência pedagógica é configurada separadamente." open={open.shifts} onToggle={() => toggle("shifts")}><Shifts admin={admin} /></Accordion>
    <Accordion id="planning-checks" title="Cadastros e pendências" subtitle="Resumo das informações necessárias para a preparação." open={open.checks} onToggle={() => toggle("checks")}><Checks semester={semester} units={units} issues={issues} onAction={act} /></Accordion>
  </>;
}
