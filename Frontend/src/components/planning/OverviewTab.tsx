// Origem: features/planning/PlanningPage.tsx (aba Visão geral)
import { BookOpen, CalendarDays, CircleAlert, Clock3 } from "lucide-react";
import { useData } from "../../lib/data";
import type { AgendaOccupation, ScheduleDetails, Semester } from "../../types";
import { bookingStatus, formatNumber, isEad, proposalStatus, semesterBookings, type PlanningTab } from "./data";
import { PlanningReservationTable, type ReservationRow } from "./PlanningReservationTable";
import { bookingRow } from "./ReservationsTab";

export type ProposalSummary = { id: number; teacherId: string; classGroupId: number; assignmentId: number; roomName: string; shiftName: string; startDate: string; status: string };

export function OverviewTab({ semester, occupations, agendaReady, grade, proposals, issueCount, gradeStatus, onTab }: {
  semester: Semester; occupations: AgendaOccupation[]; agendaReady: boolean; grade: ScheduleDetails | null;
  proposals: ProposalSummary[]; issueCount: number; gradeStatus: string; onTab: (tab: PlanningTab) => void;
}) {
  const { data } = useData();
  const classes = data.classes.filter((item) => item.semesterId === semester.id);
  const bookings = semesterBookings(data.bookings, semester);
  const confirmed = bookings.filter((item) => item.status === "Aprovada");
  const requested = bookings.filter((item) => item.status !== "Rejeitada");
  const reserved = occupations.filter((item) => item.bookingRequestId != null);
  const attention = issueCount + bookings.filter((item) => item.status === "Pendente").length + proposals.filter((item) => item.status === "Enviada").length;
  const hoursOf = (rows: AgendaOccupation[]) => rows.reduce<number | null>((total, item) => {
    const value = data.shifts.find((shift) => shift.id === item.shiftId)?.pedagogicalHours;
    return total === null || !value ? null : total + value;
  }, 0);
  const reservedHours = agendaReady ? hoursOf(reserved) : null;
  // Dias EAD de reservas continuam com sala; encontros EAD da grade não ocupam ambiente.
  const eadDays = occupations.filter(isEad);
  const eadMeetings = (grade?.unitPlans ?? []).filter((plan) => plan.deliveryMode === "Ead");
  const eadClasses = new Set([...eadDays.map((item) => item.actualClassGroupId), ...eadMeetings.map((plan) => plan.classGroupId)].filter(Boolean));
  const percent = requested.length ? Math.round(confirmed.length / requested.length * 100) : 0;

  const latest: ReservationRow[] = [
    ...[...proposals].sort((a, b) => b.id - a.id).map((item) => ({ order: item.startDate, row: {
      key: `p${item.id}`, date: item.startDate, teacher: data.teachers.find((row) => row.id === item.teacherId)?.displayName ?? item.teacherId,
      group: data.classes.find((row) => row.id === item.classGroupId)?.name ?? `Turma ${item.classGroupId}`,
      unit: data.assignments.find((row) => row.id === item.assignmentId)?.disciplineName ?? "UC não informada",
      modality: "Proposta do planejamento", room: item.roomName, shift: item.shiftName, status: proposalStatus(item.status) } })),
    ...bookings.map((item) => ({ order: item.startsAt, row: bookingRow(data, item, occupations) })),
  ].sort((a, b) => b.order.localeCompare(a.order)).slice(0, 3).map((item) => item.row);

  return <>
    <section className="planning-reference-cards" aria-label="Indicadores do semestre">
      <div className="planning-reference-card"><span>Turmas</span><BookOpen className="planning-reference-card-icon" size={18} aria-hidden="true" /><strong>{classes.length}</strong><small>Turmas vinculadas ao semestre</small></div>
      <div className="planning-reference-card"><span>Reservas confirmadas</span><CalendarDays className="planning-reference-card-icon" size={18} aria-hidden="true" /><strong>{confirmed.length}</strong><small>{agendaReady ? `${reserved.length} ocorrências · ${new Set(reserved.map((item) => item.actualClassGroupId).filter(Boolean)).size} turmas` : "Ocorrências em consulta"}</small></div>
      <div className="planning-reference-card"><span>Pendências</span><CircleAlert className="planning-reference-card-icon" size={18} aria-hidden="true" /><strong>{attention}</strong><small>Cadastros e solicitações que exigem atenção</small></div>
      <div className="planning-reference-card"><span>Carga horária reservada</span><Clock3 className="planning-reference-card-icon" size={18} aria-hidden="true" /><strong>{reservedHours === null ? "—" : `${formatNumber(reservedHours)} h`}</strong><small>{reservedHours === null && agendaReady ? "Configure as horas pedagógicas dos turnos" : "Horas pedagógicas das reservas confirmadas"}</small></div>
      <div className="planning-reference-card"><span>Programação EAD</span><CalendarDays className="planning-reference-card-icon" size={18} aria-hidden="true" /><strong>{eadDays.length + eadMeetings.reduce((sum, plan) => sum + plan.meetings.length, 0)}</strong><small>{eadClasses.size} turmas · dias EAD na agenda e encontros da grade</small></div>
    </section>
    <div className="planning-reference-grid2">
      <section className="courses-panel planning-section"><div className="curriculum-section-head"><div><h3>Andamento do planejamento</h3><p>Acompanhe as reservas que compõem a grade do semestre.</p></div></div><div className="planning-section-body"><div className="planning-reference-between"><strong>Reservas válidas</strong><strong>{confirmed.length} de {requested.length}</strong></div><div className="planning-reference-progress" role="progressbar" aria-label="Reservas confirmadas" aria-valuenow={confirmed.length} aria-valuemin={0} aria-valuemax={requested.length || 1}><span style={{ width: `${percent}%` }} /></div><p>Reservas presenciais são confirmadas quando a sala é escolhida. O gestor acompanha e publica o planejamento ao final.</p><button type="button" className="course-secondary" onClick={() => onTab("reservations")}>Ver reservas</button></div></section>
      <section className="courses-panel planning-section"><div className="curriculum-section-head"><h3>Situação do semestre</h3></div><div className="planning-section-body"><div className="planning-reference-summaryrow"><span><i className="planning-reference-dot is-success" />Reservas confirmadas</span><strong>{confirmed.length}</strong></div><div className="planning-reference-summaryrow"><span><i className="planning-reference-dot is-warning" />Precisam de atenção</span><strong>{attention}</strong></div><div className="planning-reference-summaryrow"><span><i className="planning-reference-dot" />Grade semestral</span><span className="planning-reference-status is-pending">{gradeStatus}</span></div></div></section>
    </div>
    <section className="courses-panel planning-section"><div className="curriculum-section-head"><div><h3>Últimas reservas dos instrutores</h3><p>Solicitações e reservas do semestre, conforme a situação registrada no sistema.</p></div><button type="button" className="planning-text-button" onClick={() => onTab("reservations")}>Ver todas →</button></div><PlanningReservationTable rows={latest} /></section>
  </>;
}
