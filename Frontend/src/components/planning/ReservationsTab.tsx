// Origem: features/reservations/ManagerPlanning.tsx (aba Reservas)
import { useState, type ReactNode } from "react";
import { Building2, CalendarDays, ClipboardCheck } from "lucide-react";
import { useData } from "../../lib/data";
import { hour, localDate } from "../../lib/utils";
import type { AgendaOccupation, Booking, Semester, User } from "../../types";
import { AuditHistory } from "../AuditHistory";
import { bookingStatus, dateLabel, formatNumber, isEad, semesterBookings, weekdayShort } from "./data";
import { PlanningReservationTable, type ReservationRow } from "./PlanningReservationTable";

type AppData = ReturnType<typeof useData>["data"];
const conflictText: Record<string, string> = { Room: "Ambiente em duas ocupações no mesmo horário.", Teacher: "Instrutor em duas ocupações no mesmo horário.", ClassGroup: "Turma em duas ocupações no mesmo horário.", Class: "Turma em duas ocupações no mesmo horário." };
const shiftOf = (data: AppData, booking: Booking) => data.shifts.find((item) => item.startsAt.slice(0, 5) === booking.startsAt.slice(11, 16) && item.endsAt.slice(0, 5) === booking.endsAt.slice(11, 16));

export function bookingRow(data: AppData, booking: Booking, occupations: AgendaOccupation[]): ReservationRow {
  const own = occupations.filter((item) => item.bookingRequestId === booking.id);
  const group = data.classes.find((item) => item.id === booking.classGroupId);
  return {
    key: `r${booking.id}`, date: own[0]?.date ?? booking.startsAt,
    teacher: data.teachers.find((item) => item.id === booking.teacherId)?.displayName ?? "Instrutor ausente",
    group: `${group?.code || group?.name || "Sem turma"}${own.length > 1 ? ` · ${own.length} datas` : ""}`,
    unit: booking.curricularUnitName ?? "UC não informada",
    modality: own.some(isEad) || booking.recurringEadWeekday != null ? "Presencial com dia EAD" : "Presencial",
    room: data.rooms.find((item) => item.id === booking.approvedRoomId)?.name ?? own[0]?.roomName ?? "Sem ambiente",
    shift: shiftOf(data, booking)?.name ?? booking.startsAt.slice(11, 16), status: bookingStatus(booking.status),
  };
}

export function ReservationsTab({ semester, user, occupations, loading, onOpenBookings, children }: {
  semester: Semester; user: User; occupations: AgendaOccupation[]; loading: boolean; onOpenBookings?: () => void; children: ReactNode;
}) {
  const { data } = useData();
  const admin = user.roles.includes("Admin");
  const [filters, setFilters] = useState({ classId: "", teacherId: "", status: "", modality: "" });
  const [selectedKey, setSelectedKey] = useState("");
  const all = semesterBookings(data.bookings, semester).sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id - b.id);
  const visible = all.filter((item) => (!filters.classId || String(item.classGroupId) === filters.classId) && (!filters.teacherId || item.teacherId === filters.teacherId) &&
    (!filters.status || item.status === filters.status) && (!filters.modality || (filters.modality === "ead") === (bookingRow(data, item, occupations).modality !== "Presencial")));
  const selected = visible.find((item) => `r${item.id}` === selectedKey);

  const detail = (booking: Booking) => {
    const row = bookingRow(data, booking, occupations);
    const own = occupations.filter((item) => item.bookingRequestId === booking.id);
    const confirmed = booking.status === "Aprovada";
    const shift = shiftOf(data, booking);
    const group = data.classes.find((item) => item.id === booking.classGroupId);
    const room = data.rooms.find((item) => item.id === (booking.approvedRoomId ?? own[0]?.roomId));
    const hours = shift?.pedagogicalHours ? own.length * shift.pedagogicalHours : null;
    // A referência mostra carga prevista da UC; a reserva não informa esse total, então a barra usa as ocorrências.
    const total = own.length;
    const done = own.filter((item) => item.date < localDate(new Date())).length;
    const dates = own.length ? own.map((item) => item.date) : [booking.startsAt.slice(0, 10)];
    const conflicts = own.flatMap((item) => item.conflicts.map((conflict, index) => ({ key: `${item.id}-${index}`, date: item.date, message: conflictText[conflict] ?? conflict })));
    const requested = [booking.needsProjector && "Projetor", booking.needsTeacherComputer && "Computador do instrutor",
      booking.needsStudentComputers && `Computadores (${booking.studentsPerComputer} aluno(s) por máquina)`, booking.minRamGb > 0 && `RAM mínima ${booking.minRamGb} GB`,
      booking.needsDedicatedGpu && "GPU dedicada", ...booking.softwareIds.map((id) => data.software.find((item) => item.id === id)?.name)].filter((item): item is string => !!item);
    const rows = room ? [
      { label: "Capacidade", asks: `${booking.students} alunos`, offers: `${room.seats} vagas`, result: room.seats >= booking.students ? "ok" : "fail" },
      ...requested.map((item) => ({ label: item, asks: "Solicitado", offers: "Validado pela API na confirmação", result: "unknown" })),
    ] : [];
    const resultText: Record<string, string> = { ok: "Atende", fail: "Não atende", unknown: "A verificar" };
    return <>
      <div className="reservation-detail-head"><div><span className="reservation-detail-eyebrow">Detalhes da reserva</span><h4>{group?.code || group?.name || "Sem turma"} · {row.unit}</h4></div><div className="reservation-detail-head-actions"><span className={`planning-reference-status ${row.status.tone}`}>{row.status.label}</span><button type="button" className="planning-text-button" onClick={() => setSelectedKey("")}>Fechar ×</button></div></div>
      <div className="reservation-detail-grid">
        <div><span>Instrutor</span><strong>{row.teacher}</strong></div>
        <div><span>Modalidade e tipo</span><strong>{row.modality} · {booking.recurrence === "Nenhuma" ? "Individual" : "Recorrente"}</strong></div>
        <div><span>Turno e horário</span><strong>{row.shift}</strong><small>{hour(booking.startsAt.slice(11))} às {hour(booking.endsAt.slice(11))}</small></div>
        <div className="reservation-detail-load"><span>Carga horária</span><strong>{hours === null ? "Horas pedagógicas não informadas" : `${formatNumber(hours)} h reservadas`}</strong><i aria-hidden="true"><b style={{ width: `${total ? Math.round(done / total * 100) : 0}%` }} /></i></div>
        <div className="reservation-detail-wide"><span>Situação</span><strong>{confirmed ? "Reserva confirmada diretamente no sistema." : booking.status === "Pendente" ? "Aguardando a escolha da sala — ainda não é reserva oficial." : "Solicitação descartada."}{booking.reason ? ` Motivo informado: ${booking.reason}` : ""}</strong></div>
      </div>
      <section className="reservation-panel">
        <header className="reservation-panel-head"><span className="reservation-panel-icon"><CalendarDays size={18} aria-hidden="true" /></span><div><h5>Datas da reserva</h5><small>{dateLabel(dates[0])} a {dateLabel(dates[dates.length - 1])}</small></div><span className="reservation-panel-count">{own.length} {own.length === 1 ? "data" : "datas"}</span></header>
        <div className="reservation-panel-body">{own.length ? <div className="reservation-dates reservation-dates-scroll">{own.map((item) => <span key={item.id}><b>{weekdayShort(item.date)}</b>{dateLabel(item.date)}{isEad(item) ? " · EAD" : ""}</span>)}</div> : <p className="reservation-env-note">Sem ocupações confirmadas. Data inicial solicitada: {dateLabel(booking.startsAt)}.</p>}</div>
      </section>
      <section className="reservation-panel">
        <header className="reservation-panel-head"><span className="reservation-panel-icon"><Building2 size={18} aria-hidden="true" /></span><div><h5>Ambiente</h5><small>{room ? [room.code, room.name].filter(Boolean).join(" · ") : "Ainda não escolhido"}</small></div>{rows[0] && <span className={`reservation-env-chip is-${rows[0].result === "ok" ? "ok" : "fail"}`}>{rows[0].result === "ok" ? "Capacidade atende" : "Capacidade insuficiente"}</span>}</header>
        <div className="reservation-panel-body">{!room ? <p className="reservation-env-note">A sala é escolhida em Reservas.</p> : <div className="reservation-env-compare" role="table" aria-label="Requisitos solicitados e o que o ambiente oferece">
          <div className="reservation-env-row reservation-env-head" role="row"><span role="columnheader">Item</span><span role="columnheader">A reserva pede</span><span role="columnheader">O ambiente oferece</span><span role="columnheader">Resultado</span></div>
          {rows.map((item) => <div className="reservation-env-row" role="row" key={item.label}><strong role="cell">{item.label}</strong><span role="cell" data-label="A reserva pede">{item.asks}</span><span role="cell" data-label="O ambiente oferece">{item.offers}</span><span role="cell" className={`reservation-env-result is-${item.result}`}>{resultText[item.result]}</span></div>)}
        </div>}</div>
      </section>
      <section className="reservation-panel">
        <header className="reservation-panel-head"><span className="reservation-panel-icon"><ClipboardCheck size={18} aria-hidden="true" /></span><div><h5>Análise por ocorrência</h5><small>Conflitos registrados nas ocupações confirmadas</small></div>{conflicts.length ? <span className="reservation-env-chip is-fail">{conflicts.length} conflito(s)</span> : <span className={`reservation-env-chip is-${own.length ? "ok" : "warn"}`}>{own.length ? "Sem conflitos" : "Sem ocorrências"}</span>}</header>
        <div className="reservation-panel-body">{conflicts.length ? <div className="reservation-detail-issues">{conflicts.map((item) => <p className="is-blocking" key={item.key}><b>Conflito</b><em>{weekdayShort(item.date)} {dateLabel(item.date)}</em><span>{item.message}</span></p>)}</div> : <p className="reservation-detail-ok">{own.length ? "Sem conflitos informados pela agenda." : "Não há ocupações para analisar."}</p>}</div>
      </section>
      <details className="planning-reference-more"><summary>Histórico da reserva</summary><AuditHistory type="Booking" id={booking.id} /></details>
    </>;
  };

  const select = (label: string, key: keyof typeof filters, all: string, options: [string, string][]) =>
    <label><span>{label}</span><select aria-label={`${label} da reserva`} value={filters[key]} onChange={(event) => setFilters({ ...filters, [key]: event.target.value })}><option value="">{all}</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>;

  return <div className="planning-request-flow">
    <div className="planning-reference-tip">Reservas presenciais válidas são confirmadas diretamente, sem aprovação individual do gestor.{onOpenBookings && <> Criação e escolha de sala ficam em <button type="button" className="planning-text-button" onClick={onOpenBookings}>Reservas</button>.</>}</div>
    <section className="courses-panel planning-section" id="planning-requests">
      <div className="curriculum-section-head"><div><h3>Reservas realizadas pelos instrutores</h3><p>Dê dois cliques em uma reserva para abrir os detalhes; dois cliques de novo para fechar.</p></div><span className="planning-reference-status is-pending">{visible.length} de {all.length} registros</span></div>
      <div className="grade-filters" role="group" aria-label="Filtros das reservas">
        {admin && select("Instrutor", "teacherId", "Todos", data.teachers.map((item) => [item.id, item.displayName]))}
        {select("Turma", "classId", "Todas", data.classes.filter((item) => item.semesterId === semester.id).map((item) => [String(item.id), item.code || item.name]))}
        {select("Situação", "status", "Todas", ["Pendente", "Aprovada", "Rejeitada"].map((item) => [item, bookingStatus(item).label]))}
        {select("Modalidade", "modality", "Todas", [["presencial", "Presencial"], ["ead", "Com dia EAD"]])}
      </div>
      {loading && <p role="status" className="planning-empty">Consultando ocorrências…</p>}
      <PlanningReservationTable rows={visible.map((item) => bookingRow(data, item, occupations))} selected={selectedKey} onSelect={(key) => setSelectedKey((current) => current === key ? "" : key)} />
      {selected && <div className="planning-reference-detail">{detail(selected)}</div>}
    </section>
    {children}
  </div>;
}
